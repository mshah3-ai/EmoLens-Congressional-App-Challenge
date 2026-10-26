/**
 * Shared rules for the Ask EmoLens tools (SPEC 19.2 "Tool result rules"):
 *  - at most 200 rows per result, with `total` and `truncated: true` when cut;
 *  - every time is written in the child's local time with the weekday ("2026-10-05 Mon 15:20");
 *  - every row has a `ref` ("E:<id>" for a hard moment, "F:" a meal, ...) so the app can show which entries an answer
 *    was based on, and open them.
 * The tools only read the phone's database. Place coordinates are never read; calendar titles only when allowed.
 */
import type { ChildProfile, Lang } from '@emolens/shared';
import { formatHHMM, isoWeekday, localDateOf, localMinuteOf, rangeBounds } from '@emolens/engine';
import type { Repo } from '../../db/repo/writer';
import type { Settings } from '../../db/repo/settings';

export const MAX_ROWS = 200;

export interface ToolEnv { repo: Repo; profile: ChildProfile; settings: Settings; now: number; lang: Lang; }

/** A tool's answer: JSON for the model, plus the refs of the entries it contained. */
export interface ToolOutput { result: unknown; refs: string[]; }

export class ToolInputError extends Error {}

export function list<T extends { ref: string }>(rows: T[], extra: Record<string, unknown> = {}): ToolOutput {
  const shown = rows.slice(0, MAX_ROWS);
  return { result: { rows: shown, total: rows.length, truncated: rows.length > MAX_ROWS, ...extra }, refs: shown.map((r) => r.ref) };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function dateArg(input: Record<string, unknown>, key: string, required = true): string | null {
  const v = input[key];
  if (v == null && !required) return null;
  if (typeof v !== 'string' || !DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new ToolInputError(`${key} must be a date like 2026-10-05`);
  return v;
}

/** [from, to] local dates → ISO instants [start, end) for SQL comparisons. At most 400 days. */
export function rangeArgs(input: Record<string, unknown>, env: ToolEnv, a = 'start_date', b = 'end_date'): { from: string; to: string; startIso: string; endIso: string } {
  const from = dateArg(input, a)!;
  const to = dateArg(input, b)!;
  if (to < from) throw new ToolInputError(`${b} is before ${a}`);
  if (Date.parse(to) - Date.parse(from) > 400 * 86_400_000) throw new ToolInputError('the range is longer than 400 days');
  const [s, e] = rangeBounds(from, to, env.profile.homeTz);
  return { from, to, startIso: new Date(s).toISOString(), endIso: new Date(e).toISOString() };
}

const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "2026-10-05 Mon 15:20" in the child's time zone (fixed English format: the model reads it in any language). */
export function localStamp(t: string | number | null, tz: string): string | null {
  if (t == null) return null;
  const ms = typeof t === 'number' ? t : Date.parse(t);
  if (Number.isNaN(ms)) return null;
  const date = localDateOf(ms, tz);
  return `${date} ${WEEKDAY[isoWeekday(date) - 1]} ${formatHHMM(localMinuteOf(ms, tz))}`;
}

/** "2026-10-05 Mon" */
export const localDay = (date: string): string => `${date} ${WEEKDAY[isoWeekday(date) - 1]}`;

export const round = (x: number | null | undefined, digits = 2): number | null =>
  x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** digits) / 10 ** digits;
