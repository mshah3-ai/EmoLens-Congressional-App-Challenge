/**
 * Every write to a syncable table goes through here (SPEC 6.1). Each write:
 *  (a) sets created_at / updated_at (and the other standard columns on insert),
 *  (b) appends a row to `outbox` when Care Team is on, so Phase 7's sync can upload it,
 *  (c) marks the affected 2-hour time blocks "dirty" so the forecast engine recomputes them (SPEC 12.6).
 * A `Repo` wraps the database; `repo.write(fn)` runs `fn` in one transaction with a `Writer`.
 */
import type { Db, Executor, Row, SqlValue } from '../types';
import { DAY, HOUR, iso, ms, newId, nowIso } from '../time';
import { getSetting } from './settings';

/** Tables whose rows carry the six standard columns. `places` is synced too, but without coordinates. */
export const SYNCABLE_TABLES = [
  'children', 'episodes', 'strategies', 'strategy_uses', 'medications', 'medication_changes', 'med_doses', 'meals',
  'sleep_entries', 'illness_logs', 'routine_changes', 'place_visits', 'notes', 'alerts', 'alert_responses', 'day_closures',
] as const;
export type SyncTable = (typeof SYNCABLE_TABLES)[number] | 'places';

/** Columns that never leave the phone (SPEC 27.1): place coordinates. */
const LOCAL_ONLY_COLUMNS: Partial<Record<SyncTable, string[]>> = { places: ['latitude', 'longitude', 'radius_m', 'geofence_enabled'] };

/** Which blocks a change affects: every block starting within [from, to] (ISO strings). */
export interface DirtyRange { childId: string; from: string; to: string; }

/** Source data at time t marks blocks in [t - 24 h, t + 24 h] (SPEC 12.6). */
export const around = (childId: string, t: string): DirtyRange => ({ childId, from: iso(ms(t) - 24 * HOUR), to: iso(ms(t) + 24 * HOUR) });
/** A medication change at t marks [t, t + 21 days] (SPEC 12.6). */
export const medChangeRange = (childId: string, t: string): DirtyRange => ({ childId, from: t, to: iso(ms(t) + 21 * DAY) });
/** Settings that change features (wake window, school days, modeled types) mark every block. */
export const everything = (childId: string): DirtyRange => ({ childId, from: '0000', to: '9999' });

/** Who is writing: this install's id and the signed-in account (or 'local' without one). */
export interface RepoEnv { deviceId: string; createdBy: string; }

/** Told after a write transaction that queued uploads commits (Care Team sync then uploads a few seconds later). */
let outboxListener: (() => void) | null = null;
export function setOutboxListener(fn: (() => void) | null): void { outboxListener = fn; }

export class Writer {
  private outboxOn: boolean | null = null;
  /** True once this writer put something in the outbox. */
  queued = false;
  constructor(readonly ex: Executor, private env: RepoEnv) {}

  private async outboxEnabled(): Promise<boolean> {
    if (this.outboxOn == null) this.outboxOn = await getSetting(this.ex, 'care_team_enabled');
    return this.outboxOn;
  }

  async markDirty(ranges: DirtyRange[]): Promise<void> {
    for (const r of ranges) {
      await this.ex.execute('UPDATE blocks SET dirty = 1 WHERE child_id = ? AND block_start >= ? AND block_start <= ?', [r.childId, r.from, r.to]);
    }
  }

  private async enqueue(table: SyncTable, id: string, op: 'upsert' | 'delete'): Promise<void> {
    if (!(await this.outboxEnabled())) return;
    const row = (await this.ex.execute(`SELECT * FROM ${table} WHERE id = ?`, [id])).rows[0] ?? { id };
    const payload: Row = { ...row };
    for (const c of LOCAL_ONLY_COLUMNS[table] ?? []) delete payload[c];
    await this.ex.execute('INSERT INTO outbox (table_name, row_id, op, payload_json, created_at) VALUES (?, ?, ?, ?, ?)',
      [table === 'places' ? 'places_public' : table, id, op, JSON.stringify(payload), nowIso()]);
    this.queued = true;
  }

  /** Inserts a row, filling the standard columns. Returns the new id (uuidv7). */
  async insert(table: SyncTable, values: Record<string, SqlValue>, dirty: DirtyRange[] = []): Promise<string> {
    const id = typeof values.id === 'string' ? values.id : newId();
    const now = nowIso();
    const std: Record<string, SqlValue> = table === 'places'
      ? { id, created_at: now, updated_at: now }
      : { id, created_at: now, updated_at: now, created_by: this.env.createdBy, device_id: this.env.deviceId };
    const row = { ...values, ...std };
    const cols = Object.keys(row);
    await this.ex.execute(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map((c) => row[c]));
    await this.enqueue(table, id, 'upsert');
    await this.markDirty(dirty);
    return id;
  }

  /**
   * The columns every change sets: updated_at, and device_id = the phone that made this latest change (sync's
   * last-writer-wins breaks exact ties by device_id, so it must name the last writer, not the creator).
   */
  private stamp(table: SyncTable, now: string): Record<string, SqlValue> {
    return table === 'places' ? { updated_at: now } : { updated_at: now, device_id: this.env.deviceId };
  }

  /**
   * The new updated_at for a change to row `id`: now, but always later than the row's current value, so a quick
   * second change (an "Undo" in the same millisecond, or a phone clock that went back) still counts as newer.
   */
  private async nextTime(table: SyncTable, id: string): Promise<string> {
    const now = nowIso();
    const prev = (await this.ex.execute(`SELECT updated_at FROM ${table} WHERE id = ?`, [id])).rows[0]?.updated_at;
    return typeof prev === 'string' && prev >= now ? iso(ms(prev) + 1) : now;
  }

  /** Updates the given columns and bumps updated_at. */
  async update(table: SyncTable, id: string, values: Record<string, SqlValue>, dirty: DirtyRange[] = []): Promise<void> {
    const row: Record<string, SqlValue> = { ...values, ...this.stamp(table, await this.nextTime(table, id)) };
    const cols = Object.keys(row);
    await this.ex.execute(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => row[c]), id]);
    await this.enqueue(table, id, 'upsert');
    await this.markDirty(dirty);
  }

  /** Soft delete (SPEC 7.3: deletions are soft via deleted_at, so they can sync and be undone). */
  async softDelete(table: SyncTable, id: string, dirty: DirtyRange[] = []): Promise<void> {
    const stamp = this.stamp(table, await this.nextTime(table, id));
    const cols = Object.keys(stamp);
    await this.ex.execute(`UPDATE ${table} SET deleted_at = ?, ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [stamp.updated_at, ...cols.map((c) => stamp[c]), id]);
    await this.enqueue(table, id, 'delete');
    await this.markDirty(dirty);
  }

  /** Undo a soft delete (the Timeline's 5-second undo toast). */
  async restore(table: SyncTable, id: string, dirty: DirtyRange[] = []): Promise<void> {
    const stamp = this.stamp(table, await this.nextTime(table, id));
    const cols = Object.keys(stamp);
    await this.ex.execute(`UPDATE ${table} SET deleted_at = NULL, ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...cols.map((c) => stamp[c]), id]);
    await this.enqueue(table, id, 'upsert');
    await this.markDirty(dirty);
  }
}

export class Repo {
  constructor(readonly db: Db, readonly env: RepoEnv) {}
  /** Runs `fn` in a single transaction: either every write happens or none does. */
  async write<T>(fn: (w: Writer) => Promise<T>): Promise<T> {
    let writer: Writer | null = null;
    const result = await this.db.transaction((tx) => { writer = new Writer(tx, this.env); return fn(writer); });
    if ((writer as Writer | null)?.queued) outboxListener?.();
    return result;
  }
}
