/**
 * Builds one report's data (SPEC 22.1, 22.2) from plain rows, with the audience rules. The phone reads the rows from
 * SQLite (apps/mobile/src/reports/data.ts); the portal reads them from the cloud. Both call this, so a report looks
 * the same wherever it's made. The numbers come from the engine (episodeSummary, adherence, sleepSummary).
 *  - Clinician: everything.
 *  - School: no medications, sleep, health or body-signal (physiology) data, and nothing about places outside school
 *    (no place names, no "where" for each hard moment, no therapy/medical or relatives' places, no place items in
 *    worth watching). The data is left out here, before the report is drawn, so it can't appear anywhere by mistake.
 *    By default a School report also has only school-time hard moments (school.ts, BUGS #23): the filter runs first,
 *    so the table, summary, trend, calendar and time-of-day chart all count the same hard moments.
 *  - Family: everything, in simpler words (the template's choice).
 */
import { FEATURE_BY_KEY, type EpisodeType, type PlaceType } from '@emolens/shared';
import {
  STATUS_SORT, adherence, episodeSummary, previousPeriod, rangeBounds, sleepSummary,
  type AlertMetrics, type HealthMetrics, type TimeOfDayRow, type WatchItem,
} from '@emolens/engine';
import type { ReportData, ReportEpisode, ReportOptions, SnapInsight } from './types';
import { DEFAULT_SCHOOL_DAYS, isSchoolTime, schoolBlockIndices } from './school';

/** Pattern groups a school report leaves out (SPEC 7.1: teachers never see medications, sleep, health). */
const SCHOOL_HIDDEN_GROUPS = new Set(['sleep', 'medication', 'health', 'physiology']);
/** Place patterns that would tell a teacher about health visits or home life. */
const SCHOOL_HIDDEN_KEYS = new Set(['place_therapy_medical', 'place_other']);
/** Patterns worth listing in a report: the ones EmoLens has something to say about. */
const REPORTED = new Set(['strong', 'likely', 'possible', 'protective', 'no_clear_link']);

export interface ReportProfile { id: string; nickname: string; homeTz: string; typicalSleepHours: number; schoolDays?: number[]; }

export interface InputEpisode {
  id: string; startedAt: number; durationMin: number | null; type: EpisodeType; intensity: number | null;
  placeId: string | null; placeType: string | null; antecedentTags: string[]; antecedentNote: string | null; behaviorTags: string[];
}
export interface InputUse { strategyId: string; name: string; context: 'proactive' | 'during'; outcome: string; episodeId: string | null; usedAt?: number; }
export interface InputMedication {
  id: string; name: string; strength: string | null; form: string | null; rxcui: string | null; asNeeded: boolean;
  times: string[]; activeFrom: string; activeTo: string | null;
}
export interface InputDose { medicationId: string; scheduledFor: number | null; status: 'pending' | 'taken' | 'late' | 'missed' | 'skipped'; }
export interface InputChange { medicationId: string; at: number; changeType: string; oldValue: string | null; newValue: string | null; }

export interface ReportInputs {
  profile: ReportProfile;
  /** Hard moments from the start of the previous equal-length period (for the trend) to the end of the range. */
  episodes: InputEpisode[];
  places: { id: string; label: string; type: PlaceType }[];
  /** Strategy uses in the range. */
  uses: InputUse[];
  /** For a school-only report, built from school-day blocks only (the phone); otherwise any rows (they're narrowed here). */
  timeOfDay: TimeOfDayRow[];
  patterns: SnapInsight[];
  watch: WatchItem[];
  health: HealthMetrics;
  alerts: AlertMetrics;
  /** Medications active in the range, their doses and changes in the range (not needed for School). */
  medications: { meds: InputMedication[]; doses: InputDose[]; changes: InputChange[] };
  /** Sleep entries ending from 29 days before the range to its end (the "usual sleep" needs the month before). */
  sleep: { sleepEnd: number; durationMin: number }[];
  /** The notes the parent picked. */
  notes: { id: string; at: number; text: string }[];
}

export function assembleReport(i: ReportInputs, o: ReportOptions): ReportData {
  const { profile } = i;
  const tz = profile.homeTz;
  const school = o.audience === 'school';
  const prev = previousPeriod(o.from, o.to);
  const [from, to] = rangeBounds(o.from, o.to, tz);

  const placeById = new Map(i.places.map((p) => [p.id, p]));
  const schoolOnly = school && o.schoolOnly !== false;
  const calendar = { homeTz: tz, schoolDays: profile.schoolDays ?? DEFAULT_SCHOOL_DAYS };
  const placeTypeOf = (e: InputEpisode) => (e.placeId ? placeById.get(e.placeId)?.type : undefined) ?? e.placeType;
  const kept = schoolOnly ? i.episodes.filter((e) => isSchoolTime(e.startedAt, placeTypeOf(e), calendar)) : i.episodes;
  const keptIds = new Set(kept.map((e) => e.id));
  const lite = kept.map((e) => ({ startedAt: e.startedAt, durationMin: e.durationMin, type: e.type, intensity: e.intensity }));
  const schoolIdx = new Set(schoolBlockIndices());
  const timeOfDay = schoolOnly ? i.timeOfDay.filter((r) => schoolIdx.has(r.index)) : i.timeOfDay;
  const helpedBy = new Map<string, ReportEpisode['helped']>();
  for (const u of i.uses) {
    if (u.context !== 'during' || !u.episodeId || !['helped', 'not_helped', 'unsure'].includes(u.outcome)) continue;
    const list = helpedBy.get(u.episodeId) ?? [];
    list.push({ name: u.name, outcome: u.outcome as 'helped' | 'not_helped' | 'unsure' });
    helpedBy.set(u.episodeId, list);
  }
  const episodes: ReportEpisode[] = kept.filter((e) => e.startedAt >= from && e.startedAt < to).map((e) => {
    const place = e.placeId ? placeById.get(e.placeId) : undefined;
    return {
      id: e.id, startedAt: e.startedAt, durationMin: e.durationMin, type: e.type, intensity: e.intensity,
      placeLabel: school ? null : place?.label ?? null, placeType: school ? null : place?.type ?? e.placeType,
      antecedentTags: e.antecedentTags, antecedentNote: e.antecedentNote, behaviorTags: e.behaviorTags, helped: helpedBy.get(e.id) ?? [],
    };
  });

  // patterns and worth watching from the model's current view
  const patterns = i.patterns
    .filter((p) => REPORTED.has(p.status) && !(school && (SCHOOL_HIDDEN_GROUPS.has(FEATURE_BY_KEY[p.key]?.group ?? '') || SCHOOL_HIDDEN_KEYS.has(p.key))))
    .sort((a, b) => STATUS_SORT.indexOf(a.status) - STATUS_SORT.indexOf(b.status) || b.confidence - a.confidence);
  const watch = i.watch.filter((w) => w.shown && !(school && (w.kind === 'medication' || w.kind === 'place')));

  // strategies: success counts by context in the range
  const strat = new Map<string, ReportData['strategies'][number]>();
  for (const u of i.uses) {
    // school-only: a strategy counts if its hard moment is in the report, or (with no hard moment) it was used at school time
    if (schoolOnly && (u.episodeId ? !keptIds.has(u.episodeId) : u.usedAt == null || !isSchoolTime(u.usedAt, null, calendar))) continue;
    const key = `${u.strategyId}|${u.context}`;
    const s = strat.get(key) ?? { name: u.name, context: u.context, successes: 0, failures: 0, unsure: 0 };
    if (u.outcome === 'helped' || u.outcome === 'averted') s.successes++;
    else if (u.outcome === 'not_helped' || u.outcome === 'not_averted') s.failures++;
    else if (u.outcome === 'unsure') s.unsure++;
    else continue;
    strat.set(key, s);
  }
  const strategies = [...strat.values()].sort((a, b) => (b.successes + b.failures) - (a.successes + a.failures) || a.name.localeCompare(b.name));

  return {
    nickname: profile.nickname, tz, lang: o.lang, audience: o.audience, from: o.from, to: o.to,
    days: Math.round((to - from) / 86_400_000), generatedAt: o.now, pageSize: o.pageSize,
    summary: episodeSummary(lite, o.from, o.to, tz),
    previous: episodeSummary(lite, prev.from, prev.to, tz),
    timeOfDay, ...(school ? { schoolOnly } : {}),
    episodes, patterns, watch,
    medications: school ? null : medicationSection(i.medications, from, to, o.now),
    sleep: school ? null : sleepSection(i.sleep, profile, o.from, o.to),
    strategies, forecast: { health: i.health, alerts: i.alerts },
    notes: i.notes,
  };
}

function medicationSection(m: ReportInputs['medications'], from: number, to: number, now: number): ReportData['medications'] {
  if (!m.meds.length) return { list: [], changes: [] };
  const name = (mid: string) => m.meds.find((x) => x.id === mid)?.name ?? '';
  const doses = m.doses.filter((d) => d.scheduledFor != null && d.scheduledFor >= from && d.scheduledFor < to);
  return {
    list: m.meds.map((x) => ({ ...x, adherence: adherence(doses.filter((d) => d.medicationId === x.id), from, to, now) })),
    changes: m.changes.filter((c) => c.at >= from && c.at < to).sort((a, b) => a.at - b.at)
      .map((c) => ({ name: name(c.medicationId), at: c.at, changeType: c.changeType, oldValue: c.oldValue, newValue: c.newValue })),
  };
}

function sleepSection(rows: ReportInputs['sleep'], profile: ReportProfile, fromDate: string, toDate: string): ReportData['sleep'] {
  const [a] = rangeBounds(fromDate, toDate, profile.homeTz);
  const s = sleepSummary(rows, fromDate, toDate, profile.homeTz, profile.typicalSleepHours);
  const hours = rows.filter((x) => x.sleepEnd >= a).map((x) => x.durationMin / 60);
  return { ...s, minHours: hours.length ? Math.min(...hours) : null, maxHours: hours.length ? Math.max(...hours) : null };
}
