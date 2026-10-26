/**
 * Turns the "asleep" intervals a health app reports into one sleep entry per night (SPEC 11.1):
 *  - overlapping intervals (e.g. from a watch and a phone) are combined so time is never counted twice;
 *  - intervals less than 90 minutes apart belong to the same stretch of sleep;
 *  - a stretch is a "night" if it ends between 03:00 and 13:00 local time; its date is the local date it ends.
 * Stretches ending at other times (afternoon naps) are not nights. Night wakings = gaps of 5 minutes or more inside
 * the night (DECISIONS #42).
 * Some sources only record time *in bed* (for example sleep added by hand in Apple's Health app, or older trackers).
 * SPEC 6.2 stores asleep minutes "not time in bed when available", so in-bed time is used only for a night that has no
 * asleep data at all; its wakings are then unknown (bug found in the Simulator, DECISIONS #53).
 */
import { localDateOf, localMinuteOf } from '@emolens/engine';

export interface AsleepInterval { start: number; end: number }
export interface Night { localDate: string; start: number; end: number; asleepMin: number; wakings: number | null; inBedOnly: boolean }

const MIN = 60_000;
const MERGE_GAP = 90 * MIN;
const WAKING_GAP = 5 * MIN;

/** Union of overlapping intervals, sorted by start. */
export function unionIntervals(list: AsleepInterval[]): AsleepInterval[] {
  const sorted = list.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: AsleepInterval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

export function groupNights(asleep: AsleepInterval[], tz: string, inBed: AsleepInterval[] = []): Night[] {
  const nights = new Map(nightsFrom(asleep, tz, false).map((n) => [n.localDate, n]));
  for (const n of nightsFrom(inBed, tz, true)) if (!nights.has(n.localDate)) nights.set(n.localDate, n);
  return [...nights.values()].sort((a, b) => a.start - b.start);
}

function nightsFrom(list: AsleepInterval[], tz: string, inBedOnly: boolean): Night[] {
  const parts = unionIntervals(list);
  const clusters: AsleepInterval[][] = [];
  for (const p of parts) {
    const cur = clusters[clusters.length - 1];
    if (cur && p.start - cur[cur.length - 1].end < MERGE_GAP) cur.push(p);
    else clusters.push([p]);
  }
  const nights = new Map<string, Night>();
  for (const c of clusters) {
    const end = c[c.length - 1].end;
    const minute = localMinuteOf(end, tz);
    if (minute < 3 * 60 || minute >= 13 * 60) continue;
    const night: Night = {
      localDate: localDateOf(end, tz),
      start: c[0].start,
      end,
      asleepMin: Math.round(c.reduce((s, p) => s + (p.end - p.start), 0) / MIN),
      wakings: inBedOnly ? null : c.slice(1).filter((p, i) => p.start - c[i].end >= WAKING_GAP).length,
      inBedOnly,
    };
    // Two separate stretches ending in the same morning window: keep the longer one.
    const prev = nights.get(night.localDate);
    if (!prev || night.asleepMin > prev.asleepMin) nights.set(night.localDate, night);
  }
  return [...nights.values()];
}
