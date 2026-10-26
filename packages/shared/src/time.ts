/**
 * Reading times from the cloud (Postgres "timestamptz"), shared by the phone's sync and the portal.
 * Postgres writes e.g. "2026-09-30T14:05:00.123456+00:00" or "2026-09-30 14:05:00+00". Parsed by hand: the phone's
 * JavaScript engine (Hermes) doesn't reliably read 6 decimal places or a "+00" offset.
 */
const PG_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/;

/** Epoch milliseconds of a Postgres (or ISO) time; throws on anything else. */
export function serverTimeMs(v: unknown): number {
  const m = PG_TIME.exec(String(v));
  if (!m) throw new Error('bad time value');
  const [, date, clock, frac, zone] = m;
  const hms = clock.length === 5 ? `${clock}:00` : clock;
  const ms = (frac ?? '').padEnd(3, '0').slice(0, 3);
  let offset = zone ?? 'Z';
  if (offset !== 'Z') offset = offset.length === 3 ? `${offset}:00` : offset.includes(':') ? offset : `${offset.slice(0, 3)}:${offset.slice(3)}`;
  const t = Date.parse(`${date}T${hms}.${ms}${offset}`);
  if (Number.isNaN(t)) throw new Error('bad time value');
  return t;
}
