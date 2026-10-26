/**
 * Push (SPEC 23.3): upload what changed on this phone. Every syncable write adds a row to the `outbox` table (see
 * db/repo/writer.ts). Push reads the outbox oldest first, 200 at a time:
 *  1. several queued changes of one row become one upload of the row as it is NOW (the newest version);
 *  2. rows are converted to the cloud's form and uploaded table by table, parents first;
 *  3. uploaded outbox rows are deleted.
 * If the upload fails (no internet, server trouble), nothing is lost: the rows stay queued, their `attempts` go up and
 * the next try waits 2^attempts seconds. After 10 failed attempts the app shows a sync-error banner.
 * If the database refuses a row (row-level security: e.g. a caregiver's phone trying to change the child profile),
 * retrying can't help, so that row is dropped and noted in Diagnostics; the other rows still go.
 */
import { all, type Db, type Executor, type Row } from '../db/types';
import { recordError } from '../db/repo/errors';
import { isForbidden, type CloudApi, type CloudError } from '../cloud/api';
import { toCloud } from './convert';
import { SPEC_BY_CLOUD, SYNC_ORDER, type SyncSpec } from './tables';

export const PUSH_BATCH = 200;
export const MAX_ATTEMPTS = 10;

/** How long to wait before the next try after `attempts` failures: 2, 4, 8 ... seconds (SPEC 23.3). */
export const backoffMs = (attempts: number): number => 2 ** Math.min(attempts, MAX_ATTEMPTS) * 1000;

interface OutboxRow { seq: number; table_name: string; row_id: string; payload_json: string; attempts: number; }

export interface PushContext {
  userId: string;
  /** Only the owner may write the child profile; other phones never upload it. */
  isOwner: boolean;
}

export interface PushResult {
  sent: number;
  dropped: number;
  /** Set when the upload failed and rows are still queued. */
  error: CloudError | null;
  /** Highest attempts count among the rows still queued (for the backoff and the banner). */
  attempts: number;
}

export const outboxCount = async (ex: Executor): Promise<number> =>
  Number((await all<{ n: number }>(ex, 'SELECT COUNT(*) AS n FROM outbox'))[0]?.n ?? 0);

/** Uploads the whole outbox (in batches), stopping at the first failure. */
export async function push(db: Db, api: CloudApi, ctx: PushContext): Promise<PushResult> {
  const result: PushResult = { sent: 0, dropped: 0, error: null, attempts: 0 };
  for (;;) {
    const batch = await all<OutboxRow>(db, 'SELECT seq, table_name, row_id, payload_json, attempts FROM outbox ORDER BY seq LIMIT ?', [PUSH_BATCH]);
    if (!batch.length) return result;
    const r = await pushBatch(db, api, ctx, batch);
    result.sent += r.sent;
    result.dropped += r.dropped;
    if (r.error) {
      result.error = r.error;
      await db.execute(`UPDATE outbox SET attempts = attempts + 1 WHERE seq <= ?`, [batch[batch.length - 1].seq]);
      result.attempts = Math.max(...batch.map((b) => b.attempts)) + 1;
      return result;
    }
    await db.execute('DELETE FROM outbox WHERE seq <= ?', [batch[batch.length - 1].seq]);
  }
}

async function pushBatch(db: Db, api: CloudApi, ctx: PushContext, batch: OutboxRow[]): Promise<{ sent: number; dropped: number; error: CloudError | null }> {
  // the newest queued change of each row wins; we upload the row as it is now (or the queued copy if it's gone)
  const byTable = new Map<string, Map<string, OutboxRow>>();
  for (const o of batch) {
    const m = byTable.get(o.table_name) ?? new Map<string, OutboxRow>();
    m.set(o.row_id, o);
    byTable.set(o.table_name, m);
  }
  let sent = 0, dropped = 0;
  for (const cloud of SYNC_ORDER) {
    const queued = byTable.get(cloud);
    if (!queued) continue;
    const spec = SPEC_BY_CLOUD[cloud];
    if (cloud === 'children' && !ctx.isOwner) { dropped += queued.size; continue; }
    const rows = await currentRows(db, spec, [...queued.values()]);
    const converted = await convertAll(db, spec, rows, ctx);
    dropped += rows.length - converted.length;
    if (!converted.length) continue;
    const onConflict = spec.naturalKey ? spec.naturalKey.join(',') : 'id';
    const res = await api.upsert(cloud, converted, onConflict);
    if (!res.error) { sent += converted.length; continue; }
    if (!isForbidden(res.error) || res.error.status === 401) return { sent, dropped, error: res.error };
    // Refused by row-level security: find out row by row which ones, drop those, keep the rest.
    for (const row of converted) {
      const one = await api.upsert(cloud, [row], onConflict);
      if (!one.error) { sent++; continue; }
      if (!isForbidden(one.error) || one.error.status === 401) return { sent, dropped, error: one.error };
      dropped++;
      await recordError(db, 'sync.push', new Error(`${cloud}: not allowed for this role (${one.error.code})`));
    }
  }
  return { sent, dropped, error: null };
}

/** The rows as they are on the phone now; a row that no longer exists falls back to its queued copy. */
async function currentRows(ex: Executor, spec: SyncSpec, queued: OutboxRow[]): Promise<Row[]> {
  const ids = queued.map((q) => q.row_id);
  const now = await all<Row>(ex, `SELECT * FROM ${spec.local} WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  const byId = new Map(now.map((r) => [String(r.id), r]));
  return queued.map((q) => byId.get(q.row_id) ?? (JSON.parse(q.payload_json) as Row));
}

/** Converts rows, looking up the child of medications and alerts for the tables that need it. */
export async function convertAll(ex: Executor, spec: SyncSpec, rows: Row[], ctx: PushContext): Promise<Record<string, unknown>[]> {
  const parents = new Map<string, string>();
  if (spec.childFrom) {
    const ids = [...new Set(rows.map((r) => String(r[spec.childFrom!.column])))];
    for (let i = 0; i < ids.length; i += 500) {
      const part = ids.slice(i, i + 500);
      const found = await all<{ id: string; child_id: string }>(ex,
        `SELECT id, child_id FROM ${spec.childFrom.parent} WHERE id IN (${part.map(() => '?').join(',')})`, part);
      for (const f of found) parents.set(f.id, f.child_id);
    }
  }
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    const c = toCloud(spec, r, { userId: ctx.userId, childIdOf: (_t, id) => parents.get(id) ?? null });
    if (!c) continue;
    if (spec.local === 'children') c.owner_id = ctx.userId;
    out.push(c);
  }
  return out;
}
