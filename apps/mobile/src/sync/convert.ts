/**
 * Converting one row between the phone's SQLite form and the cloud's Postgres form (pure; SPEC 7.2).
 *  phone -> cloud: drop phone-only columns (coordinates, notification ids, audio paths), 0/1 -> true/false,
 *                  JSON text -> JSON, and add child_id where the cloud needs it.
 *  cloud -> phone: the reverse, with times written the phone's way ("...T14:05:00.000Z") so that comparing two
 *                  updated_at values as text gives the same answer as comparing the times.
 */
import { serverTimeMs } from '@emolens/shared';
import type { Row, SqlValue } from '../db/types';
import type { SyncSpec } from './tables';

/** The phone's time format for a cloud time: "2026-09-30T14:05:00.123Z" (see @emolens/shared serverTimeMs). */
export function phoneTime(v: unknown): string | null {
  return v == null ? null : new Date(serverTimeMs(v)).toISOString();
}

export interface ToCloudContext {
  /** The signed-in user; rows created before sign-in ('local') are credited to them. */
  userId: string;
  /** child_id of a parent row (medication or alert), for tables that don't have one on the phone. */
  childIdOf: (parentTable: string, parentId: string) => string | null;
}

/** A phone row as the cloud stores it; null if it can't be sent (its parent row is missing). */
export function toCloud(spec: SyncSpec, row: Row, ctx: ToCloudContext): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (spec.localOnly.includes(k)) continue;
    if (spec.booleans.includes(k)) out[k] = v == null ? null : Number(v) !== 0;
    else if (spec.json.includes(k)) out[k] = v == null ? null : JSON.parse(String(v));
    else out[k] = v;
  }
  if (spec.standard && (out.created_by == null || out.created_by === 'local')) out.created_by = ctx.userId;
  if (spec.childFrom) {
    const childId = ctx.childIdOf(spec.childFrom.parent, String(row[spec.childFrom.column]));
    if (!childId) return null;
    out.child_id = childId;
  }
  return out;
}

/** A cloud row as the phone stores it: only the phone's own columns, in SQLite types. */
export function fromCloud(spec: SyncSpec, row: Record<string, unknown>, localColumns: string[]): Row {
  const out: Row = {};
  for (const k of localColumns) {
    if (spec.localOnly.includes(k) || !(k in row)) continue;
    const v = row[k];
    let value: SqlValue;
    if (spec.booleans.includes(k)) value = v == null ? null : v ? 1 : 0;
    else if (spec.json.includes(k)) value = v == null ? null : JSON.stringify(v);
    else if (spec.times.includes(k)) value = phoneTime(v);
    else value = v == null ? null : typeof v === 'number' ? v : String(v);
    out[k] = value;
  }
  return out;
}
