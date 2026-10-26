/**
 * Time-zone math with the built-in Intl API (no dependencies, works in Node, browsers and Hermes).
 * Local dates are 'YYYY-MM-DD'; minutes-of-day are 0..1439 in local wall-clock time.
 */
import { DAY_MS, MINUTE_MS } from '@emolens/shared';

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

interface Wall { y: number; mo: number; d: number; h: number; mi: number; s: number; }
const wallCache = new Map<string, Wall>();

/** Local wall-clock parts of an instant. Cached per (tz, minute) because formatToParts is slow. */
function wall(ms: number, tz: string): Wall {
  const minute = Math.floor(ms / MINUTE_MS);
  const key = `${tz}|${minute}`;
  const hit = wallCache.get(key);
  if (hit) return hit;
  const parts = formatter(tz).formatToParts(new Date(minute * MINUTE_MS));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const w: Wall = { y: get('year'), mo: get('month'), d: get('day'), h: get('hour') % 24, mi: get('minute'), s: 0 };
  if (wallCache.size > 200_000) wallCache.clear();
  wallCache.set(key, w);
  return w;
}

/** Offset (local - UTC) in ms at the given instant. */
export function tzOffsetMs(ms: number, tz: string): number {
  const w = wall(ms, tz);
  const asUtc = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi);
  return asUtc - Math.floor(ms / MINUTE_MS) * MINUTE_MS;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function localDateOf(ms: number, tz: string): string {
  const w = wall(ms, tz);
  return `${w.y}-${pad(w.mo)}-${pad(w.d)}`;
}
export function localMinuteOf(ms: number, tz: string): number {
  const w = wall(ms, tz);
  return w.h * 60 + w.mi;
}

export function parseDate(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}
export function addDays(date: string, n: number): string {
  const { y, m, d } = parseDate(date);
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export function daysBetween(a: string, b: string): number {
  const pa = parseDate(a), pb = parseDate(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / DAY_MS);
}
/** ISO weekday 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: string): number {
  const { y, m, d } = parseDate(date);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}
export function parseHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + (m || 0);
}
export function formatHHMM(min: number): string { return `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`; }

/** UTC instant of a local wall-clock time (minutes may be >= 1440 to roll into the next day). */
export function zonedToUtc(date: string, minutes: number, tz: string): number {
  const { y, m, d } = parseDate(date);
  const guess = Date.UTC(y, m - 1, d) + minutes * MINUTE_MS;
  const t1 = guess - tzOffsetMs(guess, tz);
  const t2 = guess - tzOffsetMs(t1, tz);
  return t2;
}
