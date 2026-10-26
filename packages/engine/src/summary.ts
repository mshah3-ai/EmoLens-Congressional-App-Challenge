/**
 * Summaries over a date range, for the PDF report (spec 22.2) and the weekly digest (spec 21):
 *  - episodeSummary: hard moments per type, per day and per part of the day, average intensity, total time
 *  - adherence: medication doses taken on time or late out of all scheduled doses (spec 21 "Medications")
 *  - sleepSummary: average hours asleep vs the child's usual (sleepRef)
 *  - digestStats: everything the weekly digest shows, as plain numbers (the `stats_json` of a `digests` row)
 * Pure and language-free: screens and the report turn these numbers into words. Dates are local 'YYYY-MM-DD' strings
 * in the child's home time zone; ranges include both end dates.
 */
import { type DoseStatus, type EpisodeType, type Strategy, type StrategyUse } from '@emolens/shared';
import { isDoseMissed } from './doses';
import { sleepReference } from './features/build';
import { addDays, daysBetween, isoWeekday, localDateOf, localMinuteOf, zonedToUtc } from './features/time';
import type { AlertForMetrics, ResponseForMetrics } from './history';
import { alertMetrics } from './history';
import type { InsightStatus } from './insights';

export type TodGroup = 'morning' | 'midday' | 'afternoon' | 'evening';
export const TOD_GROUPS: TodGroup[] = ['morning', 'midday', 'afternoon', 'evening'];

/** The same parts of the day as the model's time-of-day features (tod_midday 10-14, tod_afternoon 14-18, tod_evening 18+). */
export function todGroupOfHour(hour: number): TodGroup {
  if (hour >= 18) return 'evening';
  if (hour >= 14) return 'afternoon';
  if (hour >= 10) return 'midday';
  return 'morning';
}

/** Every local date from `from` to `to`, both included. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** [start, end) in epoch ms of the local dates from..to (both included). DST-safe: each end is local midnight. */
export function rangeBounds(from: string, to: string, tz: string): [number, number] {
  return [zonedToUtc(from, 0, tz), zonedToUtc(addDays(to, 1), 0, tz)];
}

export interface EpisodeLite { startedAt: number; durationMin: number | null; type: EpisodeType; intensity: number | null; }

export interface EpisodeSummary {
  total: number;
  byType: Record<EpisodeType, number>;
  /** Mean of the intensities that were logged (null when none were). */
  avgIntensity: number | null;
  /** Sum of the durations that were logged, in minutes. */
  totalDurationMin: number;
  /** One entry per local date in the range, including days with none. */
  perDay: { date: string; count: number }[];
  byTod: Record<TodGroup, number>;
  /** The day with the most hard moments (the earliest one on a tie); null when there were none. */
  busiestDay: { date: string; count: number } | null;
}

export function episodeSummary(episodes: EpisodeLite[], from: string, to: string, tz: string): EpisodeSummary {
  const perDay = new Map(datesBetween(from, to).map((d) => [d, 0]));
  const byType: Record<EpisodeType, number> = { meltdown: 0, shutdown: 0, other: 0 };
  const byTod: Record<TodGroup, number> = { morning: 0, midday: 0, afternoon: 0, evening: 0 };
  let total = 0, intensitySum = 0, intensityN = 0, duration = 0;
  for (const e of episodes) {
    const date = localDateOf(e.startedAt, tz);
    const n = perDay.get(date);
    if (n === undefined) continue;
    perDay.set(date, n + 1);
    total++;
    byType[e.type]++;
    byTod[todGroupOfHour(Math.floor(localMinuteOf(e.startedAt, tz) / 60))]++;
    if (e.intensity != null) { intensitySum += e.intensity; intensityN++; }
    if (e.durationMin != null) duration += e.durationMin;
  }
  const days = [...perDay.entries()].map(([date, count]) => ({ date, count }));
  let busiest: { date: string; count: number } | null = null;
  for (const d of days) if (d.count > 0 && (!busiest || d.count > busiest.count)) busiest = d;
  return {
    total, byType, avgIntensity: intensityN ? intensitySum / intensityN : null, totalDurationMin: duration,
    perDay: days, byTod, busiestDay: busiest,
  };
}

/** The range of the same length just before from..to (the report's "vs the previous period"). */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const len = daysBetween(from, to) + 1;
  return { from: addDays(from, -len), to: addDays(from, -1) };
}

export interface DoseLite { medicationId: string; scheduledFor: number | null; status: DoseStatus; }

export interface Adherence {
  /** Scheduled doses whose time has come (as-needed doses and doses still in their window are left out). */
  scheduled: number;
  taken: number; late: number; missed: number; skipped: number;
  /** (taken + late) / scheduled; null when nothing was scheduled. */
  rate: number | null;
}

/**
 * Spec 21: adherence = (taken + late) / scheduled. A dose still marked pending 4 hours after its time counts as missed,
 * by the same rule that marks it missed in the app (`isDoseMissed`).
 */
export function adherence(doses: DoseLite[], from: number, to: number, now: number): Adherence {
  const a: Adherence = { scheduled: 0, taken: 0, late: 0, missed: 0, skipped: 0, rate: null };
  for (const d of doses) {
    if (d.scheduledFor == null || d.scheduledFor < from || d.scheduledFor >= to || d.scheduledFor > now) continue;
    const status: DoseStatus = isDoseMissed(d.status, d.scheduledFor, now) ? 'missed' : d.status;
    if (status === 'pending') continue;
    a.scheduled++;
    a[status]++;
  }
  if (a.scheduled) a.rate = (a.taken + a.late) / a.scheduled;
  return a;
}

export interface SleepLite { sleepEnd: number; durationMin: number; }

export interface SleepSummary { nights: number; avgHours: number | null; refHours: number; }

/**
 * Nights that ended on a date in from..to, their average hours asleep, and the usual amount to compare with: the median
 * of the 28 nights before `from` (the same rule as the model's sleep_deficit feature), or the onboarding answer.
 */
export function sleepSummary(sleep: SleepLite[], from: string, to: string, tz: string, typicalHours: number): SleepSummary {
  const before = addDays(from, -28);
  const inRange: number[] = [], last28: number[] = [];
  for (const s of sleep) {
    const d = localDateOf(s.sleepEnd, tz);
    if (d >= from && d <= to) inRange.push(s.durationMin / 60);
    else if (d >= before && d < from) last28.push(s.durationMin / 60);
  }
  return {
    nights: inRange.length,
    avgHours: inRange.length ? inRange.reduce((a, b) => a + b, 0) / inRange.length : null,
    refHours: sleepReference(last28, typicalHours),
  };
}

/** Consecutive days ending at `lastDate` (going back) on which the end-of-day check was done. */
export function loggingStreak(closedDates: Iterable<string>, lastDate: string): number {
  const closed = new Set(closedDates);
  let n = 0;
  for (let d = lastDate; closed.has(d); d = addDays(d, -1)) n++;
  return n;
}

// ---------------------------------------------------------------------------------------------------------------------
// Weekly digest (spec 21)

/** Statuses the digest reports changes between (a move from or to "not enough data" / "still checking" isn't news). */
const REPORTED: InsightStatus[] = ['strong', 'likely', 'possible', 'protective', 'no_clear_link'];

export interface WatchLite { id: string; kind: string; label: string; }

export interface DigestInput {
  /** First day of the week (local date); the week is 7 days. */
  weekStart: string;
  tz: string;
  now: number;
  /** The first local date EmoLens has data for; weeks that end before it don't count in "vs last week" or the 4-week average. */
  dataSince: string;
  /** Hard moments from at least 4 weeks before weekStart up to the end of the week. */
  episodes: EpisodeLite[];
  /** Local dates with the end-of-day check done ("nothing else happened"). */
  closedDates: string[];
  alerts: AlertForMetrics[];
  responses: ResponseForMetrics[];
  /** Model Health skill over the last 28 days, or null when there aren't enough checked forecasts yet. */
  skill28: number | null;
  /** Displayed pattern status per feature now, and in the previous digest (null = there is no previous digest). */
  statuses: Record<string, InsightStatus>;
  prevStatuses: Record<string, InsightStatus> | null;
  /**
   * "Worth watching" items shown now (null = not known for this week, e.g. the demo's simulated past weeks), and the ids
   * the previous digest showed (null = no previous digest, or it didn't know).
   */
  watch: WatchLite[] | null;
  prevWatchIds: string[] | null;
  strategies: Strategy[];
  uses: StrategyUse[];
  medications: { id: string; name: string }[];
  doses: DoseLite[];
  medChanges: { medicationId: string; changedAt: number; changeType: 'start' | 'stop' | 'dose_change' | 'time_change' }[];
  sleep: SleepLite[];
  typicalSleepHours: number;
}

export interface DigestStats {
  version: 1;
  weekStart: string;
  weekEnd: string;
  episodes: EpisodeSummary;
  /** Last week's total, or null if EmoLens had no data yet then. */
  prevWeekTotal: number | null;
  /** Average weekly total over the 4 weeks before (only weeks with data), or null if there were none. */
  avg4Weeks: number | null;
  logging: { daysClosed: number; streak: number };
  forecasts: { delivered: number; happened: number; steppedIn: number; calm: number; noAnswer: number; hitRate: number | null; skill28: number | null };
  insights: {
    statuses: Record<string, InsightStatus>;
    changes: { key: string; from: InsightStatus | null; to: InsightStatus }[];
    /** null when this week's list isn't known. */
    watchIds: string[] | null;
    newWatch: WatchLite[];
  };
  strategies: {
    mostUsed: { strategyId: string; name: string; uses: number } | null;
    /** The strategy that worked best this week: highest success share with at least 2 answered uses. */
    best: { strategyId: string; name: string; successes: number; total: number } | null;
  };
  medications: {
    perMed: ({ medicationId: string; name: string } & Adherence)[];
    overall: number | null;
    changes: { medicationId: string; name: string; changeType: string; at: number }[];
  };
  sleep: SleepSummary;
}

const SUCCESS: Partial<Record<StrategyUse['outcome'], true>> = { helped: true, averted: true };
const FAILURE: Partial<Record<StrategyUse['outcome'], true>> = { not_helped: true, not_averted: true };

export function digestStats(inp: DigestInput): DigestStats {
  const { weekStart, tz, now } = inp;
  const weekEnd = addDays(weekStart, 6);
  const [from, to] = rangeBounds(weekStart, weekEnd, tz);
  const episodes = episodeSummary(inp.episodes, weekStart, weekEnd, tz);

  const weekTotal = (k: number): number | null => {
    const s = addDays(weekStart, -7 * k);
    if (addDays(s, 6) < inp.dataSince) return null;
    return episodeSummary(inp.episodes, s, addDays(s, 6), tz).total;
  };
  const prior = [1, 2, 3, 4].map(weekTotal).filter((x): x is number => x != null);

  const weekDates = new Set(datesBetween(weekStart, weekEnd));
  const closed = inp.closedDates.filter((d) => weekDates.has(d));
  const am = alertMetrics(inp.alerts, inp.responses, now, from, to);

  const changes: DigestStats['insights']['changes'] = [];
  if (inp.prevStatuses) {
    for (const [key, to] of Object.entries(inp.statuses)) {
      const was = inp.prevStatuses[key] ?? null;
      const wasReported = was != null && REPORTED.includes(was);
      // "Sugar: now no clear link" is news only when it used to be a possible link or stronger.
      if (was === to || !REPORTED.includes(to) || (to === 'no_clear_link' && !wasReported)) continue;
      changes.push({ key, from: wasReported ? was : null, to });
    }
    const rank = (s: InsightStatus) => REPORTED.indexOf(s);
    changes.sort((a, b) => rank(a.to) - rank(b.to) || a.key.localeCompare(b.key));
  }
  const prevWatch = inp.prevWatchIds ? new Set(inp.prevWatchIds) : null;

  // strategies used this week
  const weekUses = inp.uses.filter((u) => u.usedAt >= from && u.usedAt < to);
  const name = (id: string) => inp.strategies.find((s) => s.id === id)?.name ?? '';
  const per = new Map<string, { uses: number; s: number; f: number }>();
  for (const u of weekUses) {
    const c = per.get(u.strategyId) ?? { uses: 0, s: 0, f: 0 };
    c.uses++;
    if (SUCCESS[u.outcome]) c.s++;
    if (FAILURE[u.outcome]) c.f++;
    per.set(u.strategyId, c);
  }
  const entries = [...per.entries()].sort((a, b) => name(a[0]).localeCompare(name(b[0])));
  let mostUsed: DigestStats['strategies']['mostUsed'] = null;
  let best: DigestStats['strategies']['best'] = null;
  for (const [id, c] of entries) {
    if (!mostUsed || c.uses > mostUsed.uses) mostUsed = { strategyId: id, name: name(id), uses: c.uses };
    const total = c.s + c.f;
    if (total < 2 || c.s === 0) continue;
    if (!best || c.s / total > best.successes / best.total || (c.s / total === best.successes / best.total && c.s > best.successes)) {
      best = { strategyId: id, name: name(id), successes: c.s, total };
    }
  }

  // medications
  const perMed = inp.medications.map((m) => ({ medicationId: m.id, name: m.name,
    ...adherence(inp.doses.filter((d) => d.medicationId === m.id), from, to, now) })).filter((m) => m.scheduled > 0);
  const sched = perMed.reduce((a, m) => a + m.scheduled, 0);
  const ok = perMed.reduce((a, m) => a + m.taken + m.late, 0);
  const medChanges = inp.medChanges.filter((c) => c.changedAt >= from && c.changedAt < to)
    .map((c) => ({ medicationId: c.medicationId, name: inp.medications.find((m) => m.id === c.medicationId)?.name ?? '', changeType: c.changeType, at: c.changedAt }))
    .sort((a, b) => a.at - b.at);

  return {
    version: 1, weekStart, weekEnd, episodes,
    prevWeekTotal: weekTotal(1),
    avg4Weeks: prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : null,
    logging: { daysClosed: closed.length, streak: loggingStreak(inp.closedDates, weekEnd) },
    forecasts: { delivered: am.delivered, happened: am.happened, steppedIn: am.steppedIn, calm: am.calm, noAnswer: am.noAnswer,
      hitRate: am.hitRate, skill28: inp.skill28 },
    insights: {
      statuses: inp.statuses, changes,
      watchIds: inp.watch ? inp.watch.map((w) => w.id) : null,
      newWatch: prevWatch && inp.watch ? inp.watch.filter((w) => !prevWatch.has(w.id)) : [],
    },
    strategies: { mostUsed, best },
    medications: { perMed, overall: sched ? ok / sched : null, changes: medChanges },
    sleep: sleepSummary(inp.sleep, weekStart, weekEnd, tz, inp.typicalSleepHours),
  };
}

/**
 * The week the latest digest covers at `now` (spec 21: made at `digest_day_time`, default Sunday 18:00). The digest
 * moment is the most recent `weekday` (ISO, 7 = Sunday) at `time` (local 'HH:MM') that has passed; its week is the
 * 7 days ending that day. Returns the week's first day and the moment the digest became due.
 */
export function latestDigestWeek(now: number, tz: string, weekday: number, time: string): { weekStart: string; readyAt: number } {
  const today = localDateOf(now, tz);
  const [h, m] = time.split(':').map(Number);
  const minutes = h * 60 + m;
  const wdToday = isoWeekday(today);
  let day = addDays(today, -((wdToday - weekday + 7) % 7));
  let readyAt = zonedToUtc(day, minutes, tz);
  if (readyAt > now) { day = addDays(day, -7); readyAt = zonedToUtc(day, minutes, tz); }
  return { weekStart: addDays(day, -6), readyAt };
}
