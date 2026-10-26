/**
 * Pull (SPEC 23.3): download what other phones changed. For each synced table, ask for this child's rows that the
 * server received after our bookmark (`sync_state.last_pulled_at`), 1000 at a time, oldest first:
 *  - a row we don't have is added; a row we have is replaced only if the incoming edit wins last-writer-wins;
 *  - the forecast blocks the row touches are marked for recomputing (SPEC 12.6);
 *  - pulled rows are NOT put in the outbox (they came from the cloud; sending them back would loop forever).
 * The bookmark starts 10 seconds early each time. Rows saved by a slow request can arrive at the server a moment
 * "in the past"; looking back a little catches them, and seeing a row twice is harmless (last-writer-wins).
 */
import { all, one, type Db, type Executor, type Row } from '../db/types';
import { around, everything, medChangeRange, Writer, type DirtyRange } from '../db/repo/writer';
import { iso, ms } from '../db/time';
import type { CloudApi, CloudError } from '../cloud/api';
import { fromCloud, phoneTime } from './convert';
import { incomingWins } from './merge';
import { SYNC_SPECS, childColumn, type SyncSpec } from './tables';

export const PULL_PAGE = 1000;
export const PULL_OVERLAP_MS = 10_000;
const EPOCH = '1970-01-01T00:00:00.000Z';

export interface PullResult {
  /** Rows added or replaced on this phone, per local table. */
  applied: Record<string, number>;
  /** Ids of the rows added or replaced, per local table. */
  ids: Record<string, string[]>;
  error: CloudError | null;
}

const columnCache = new Map<string, string[]>();
async function localColumns(ex: Executor, table: string): Promise<string[]> {
  const hit = columnCache.get(table);
  if (hit) return hit;
  const cols = (await all<{ name: string }>(ex, `PRAGMA table_info(${table})`)).map((c) => c.name);
  columnCache.set(table, cols);
  return cols;
}

/** Pulls every synced table for one child. Stops at the first error (the next sync continues from the bookmarks). */
export async function pull(db: Db, api: CloudApi, childId: string): Promise<PullResult> {
  const result: PullResult = { applied: {}, ids: {}, error: null };
  for (const spec of SYNC_SPECS) {
    const cursor = (await one<{ last_pulled_at: string | null }>(db, 'SELECT last_pulled_at FROM sync_state WHERE table_name = ?', [spec.cloud]))?.last_pulled_at;
    let since = cursor ? iso(ms(phoneTime(cursor) as string) - PULL_OVERLAP_MS) : EPOCH;
    for (;;) {
      const page = await api.pullPage(spec.cloud, childColumn(spec.cloud), childId, since, PULL_PAGE);
      if (page.error) { result.error = page.error; return result; }
      const rows = page.data;
      if (!rows.length) break;
      const last = String(rows[rows.length - 1].server_received_at);
      const ids = await db.transaction(async (tx) => {
        const applied = await applyRows(tx, spec, rows);
        const newest = cursor && cursor > last ? cursor : last;
        await tx.execute('INSERT INTO sync_state (table_name, last_pulled_at) VALUES (?, ?) ON CONFLICT(table_name) DO UPDATE SET last_pulled_at = excluded.last_pulled_at',
          [spec.cloud, newest]);
        return applied;
      });
      if (ids.length) {
        result.applied[spec.local] = (result.applied[spec.local] ?? 0) + ids.length;
        result.ids[spec.local] = [...(result.ids[spec.local] ?? []), ...ids];
      }
      if (rows.length < PULL_PAGE) break;
      since = last;
    }
  }
  return result;
}

/** Applies pulled rows of one table by last-writer-wins. Returns the ids of the rows that changed this phone. */
export async function applyRows(tx: Executor, spec: SyncSpec, rows: Record<string, unknown>[]): Promise<string[]> {
  const cols = await localColumns(tx, spec.local);
  const writer = new Writer(tx, { deviceId: '', createdBy: '' }); // only used for markDirty (never enqueues)
  const applied: string[] = [];
  for (const cloudRow of rows) {
    const row = fromCloud(spec, cloudRow, cols);
    if (!row.id) continue;
    const local = spec.naturalKey
      ? await one<Row>(tx, `SELECT * FROM ${spec.local} WHERE ${spec.naturalKey.map((k) => `${k} = ?`).join(' AND ')}`, spec.naturalKey.map((k) => row[k]))
      : await one<Row>(tx, `SELECT * FROM ${spec.local} WHERE id = ?`, [row.id]);
    const version = (r: Row) => ({ updated_at: String(r.updated_at), device_id: spec.standard ? (r.device_id as string | null) : null });
    if (!incomingWins(local ? version(local) : null, version(row))) continue;
    // another phone's row for the same day replaces ours (a different id, same natural key)
    if (local && spec.naturalKey && local.id !== row.id) await tx.execute(`DELETE FROM ${spec.local} WHERE id = ?`, [local.id]);
    const names = Object.keys(row);
    const updates = names.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
    await tx.execute(`INSERT INTO ${spec.local} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})
      ON CONFLICT(id) DO UPDATE SET ${updates}`, names.map((c) => row[c]));
    applied.push(String(row.id));
    await writer.markDirty(await dirtyRanges(tx, spec, row, local));
  }
  return applied;
}

/** Blocks to recompute for a pulled row (and for where it was before, if it moved). */
async function dirtyRanges(ex: Executor, spec: SyncSpec, row: Row, before: Row | null): Promise<DirtyRange[]> {
  const rule = spec.dirty;
  if (rule === 'none') return [];
  const childId = spec.local === 'children' ? String(row.id) : await childOf(ex, spec, row);
  if (!childId) return [];
  if (rule === 'everything') return [everything(childId)];
  const ranges: DirtyRange[] = [];
  for (const r of [row, before]) {
    const v = r?.[rule.column];
    if (v == null) continue;
    if (rule.range === 'around') ranges.push(around(childId, String(v)));
    else if (rule.range === 'medChange') ranges.push(medChangeRange(childId, String(v)));
    else if (rule.range === 'date') ranges.push(around(childId, `${String(v)}T12:00:00.000Z`));
    else {
      const alert = await one<{ block_start: string }>(ex, 'SELECT block_start FROM alerts WHERE id = ?', [String(v)]);
      if (alert) ranges.push(around(childId, alert.block_start));
    }
  }
  return ranges;
}

async function childOf(ex: Executor, spec: SyncSpec, row: Row): Promise<string | null> {
  if (row.child_id != null) return String(row.child_id);
  if (!spec.childFrom) return null;
  const p = await one<{ child_id: string }>(ex, `SELECT child_id FROM ${spec.childFrom.parent} WHERE id = ?`, [String(row[spec.childFrom.column])]);
  return p?.child_id ?? null;
}
