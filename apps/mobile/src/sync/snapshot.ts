/**
 * What the family's forecasting phone shares with the team after a forecast run (SPEC 7.2, 23.3):
 *  - `insight_snapshots` (once per local day): patterns, worth watching, strategy statistics, Model Health and the
 *    time-of-day chart, so the clinician portal can show them. The portal can't compute them itself: it has no
 *    weather, sound or calendar data (those never leave the phone).
 *  - `school_forecasts` (whenever today's levels change): the forecast levels of today's school-hours blocks, with no
 *    reasons (a reason can mention sleep or medications), for the teacher's phone (SPEC 7.1).
 * Both only from the primary forecasting phone, only with Care Team on, and never in demo mode.
 */
import { SCHOOL_HOURS, type ChildProfile } from '@emolens/shared';
import { isoWeekday, localDateOf, zonedToUtc } from '@emolens/engine';
import type { Settings } from '../db/repo/settings';
import type { Repo } from '../db/repo/writer';
import { iso } from '../db/time';
import type { CloudApi } from '../cloud/api';
import type { ForecastSnapshot } from '../forecast/snapshot';
import { loadHealth } from '../forecast/health';
import { loadStrategyView } from '../forecast/useForecast';


export interface SchoolBlock { start: string; end: string; level: string; }

/** Today's blocks that overlap school hours on a school day: times and level only. */
export function schoolBlocks(profile: ChildProfile, snap: ForecastSnapshot, now: number): { date: string; blocks: SchoolBlock[] } {
  const date = localDateOf(now, profile.homeTz);
  if (!profile.schoolDays.includes(isoWeekday(date))) return { date, blocks: [] };
  const from = zonedToUtc(date, SCHOOL_HOURS.start, profile.homeTz);
  const to = zonedToUtc(date, SCHOOL_HOURS.end, profile.homeTz);
  const blocks = snap.forecasts.filter((f) => f.localDate === date && f.start < to && f.end > from)
    .map((f) => ({ start: iso(f.start), end: iso(f.end), level: f.level }));
  return { date, blocks };
}

/** The insight snapshot row for the cloud. */
export async function insightRow(repo: Repo, profile: ChildProfile, snap: ForecastSnapshot, now: number): Promise<Record<string, unknown>> {
  const [health, view] = await Promise.all([loadHealth(repo.db, profile.id, now), loadStrategyView(repo.db, profile.id)]);
  const names = new Map(view.rows.map((r) => [r.id, r.name]));
  return {
    child_id: profile.id,
    computed_at: iso(snap.computedAt),
    fit_summary: {
      lang: snap.lang, learning: snap.learning, labeledDays: snap.labeledDays, labeledBlocks: snap.labeledBlocks,
      positives: snap.positives, tau: snap.tau, converged: snap.converged, fitError: snap.fitError,
    },
    insights: snap.insights,
    worth_watching: snap.worthWatching.filter((w) => w.shown),
    strategies: view.stats.filter((s) => s.uses > 0).map((s) => ({ ...s, name: names.get(s.strategyId) ?? '' })),
    model_health: health,
    time_of_day: snap.timeOfDay,
  };
}

let lastSchoolKey = '';

/** Called after every forecast pass; uploads what is due. Errors only mean "try again next run". */
export async function shareAfterForecast(repo: Repo, profile: ChildProfile, settings: Settings, snap: ForecastSnapshot,
  now: number, api: CloudApi | null, lastSnapshotDate: string | null): Promise<{ snapshot: boolean; school: boolean }> {
  const out = { snapshot: false, school: false };
  if (!api || !settings.care_team_enabled || !settings.primary_forecaster || !settings.care_team_pushed || snap.fitError) return out;
  const today = localDateOf(now, profile.homeTz);
  if (lastSnapshotDate !== today) {
    const res = await api.upsert('insight_snapshots', [await insightRow(repo, profile, snap, now)], 'child_id,computed_at');
    out.snapshot = !res.error;
  }
  const school = schoolBlocks(profile, snap, now);
  const key = JSON.stringify(school);
  if (school.blocks.length && key !== lastSchoolKey) {
    const res = await api.upsert('school_forecasts', [{ child_id: profile.id, local_date: school.date, blocks: school.blocks, computed_at: iso(now) }],
      'child_id,local_date');
    if (!res.error) { lastSchoolKey = key; out.school = true; }
  }
  return out;
}
