/**
 * Checks a share-create request before anything is stored (pure, unit-tested).
 * The phone builds the report snapshot; the server double-checks the parts that protect privacy, so even a modified
 * app can't publish medications or sleep in a School link, and nobody can store huge blobs.
 */
import { SHARE_DAYS, SHARE_MAX_BYTES } from './ratelimit.ts';

export type Audience = 'clinician' | 'school' | 'family';

export interface ShareRequest {
  childId: string;
  audience: Audience;
  from: string;
  to: string;
  days: (typeof SHARE_DAYS)[number];
  snapshot: Record<string, unknown>;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ShareCheck = { ok: true; value: ShareRequest } | { ok: false; error: 'bad_request' | 'too_large' };

export function checkShareRequest(body: Record<string, unknown>): ShareCheck {
  const { child_id, audience, from, to, expires_in_days, snapshot } = body;
  if (typeof child_id !== 'string' || !UUID.test(child_id)) return { ok: false, error: 'bad_request' };
  if (audience !== 'clinician' && audience !== 'school' && audience !== 'family') return { ok: false, error: 'bad_request' };
  if (typeof from !== 'string' || typeof to !== 'string' || !DATE.test(from) || !DATE.test(to) || from > to) return { ok: false, error: 'bad_request' };
  if (!SHARE_DAYS.includes(expires_in_days as 7 | 30)) return { ok: false, error: 'bad_request' };
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return { ok: false, error: 'bad_request' };
  if (new TextEncoder().encode(JSON.stringify(snapshot)).length > SHARE_MAX_BYTES) return { ok: false, error: 'too_large' };
  const s = snapshot as Record<string, unknown>;
  // the snapshot must describe the same report the request says it is
  if (s.audience !== audience || s.from !== from || s.to !== to) return { ok: false, error: 'bad_request' };
  if (audience === 'school' && !schoolSafe(s)) return { ok: false, error: 'bad_request' };
  return { ok: true, value: { childId: child_id, audience, from, to, days: expires_in_days as 7 | 30, snapshot: s } };
}

/**
 * Pattern keys a School report never shows: the sleep, medication, health and body-signal features, and the places
 * that tell about health visits or home life (packages/reports/src/assemble.ts; a test keeps the two lists the same).
 */
export const SCHOOL_HIDDEN_PATTERN_KEYS = [
  'sleep_deficit', 'night_wakings', 'missed_dose', 'late_dose', 'med_change_recent', 'illness', 'low_activity_yesterday',
  'resting_hr_up', 'hrv_down', 'hr_elevated_pre', 'place_therapy_medical', 'place_other',
];

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * A School snapshot has no medications, no sleep, no place for any hard moment (SPEC 22.1, DECISIONS #86), no
 * medication or place item in "worth watching", and no sleep, medication, health or private-place pattern (Phase 10
 * privacy review: before, only the first three were checked here).
 */
export function schoolSafe(s: Record<string, unknown>): boolean {
  if (s.medications != null || s.sleep != null) return false;
  if (!list(s.episodes).every((e) => rec(e) && rec(e)!.placeLabel == null && rec(e)!.placeType == null)) return false;
  if (!list(s.watch).every((w) => rec(w) && rec(w)!.kind !== 'medication' && rec(w)!.kind !== 'place')) return false;
  return list(s.patterns).every((p) => rec(p) && !SCHOOL_HIDDEN_PATTERN_KEYS.includes(String(rec(p)!.key)));
}
