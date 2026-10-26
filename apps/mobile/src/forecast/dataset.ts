/**
 * SQLite -> ChildDataset (SPEC 12: "The mobile app queries SQLite into a ChildDataset; the simulator generates one
 * directly"). This file only COPIES data into the engine's shape: ISO strings become epoch milliseconds, JSON columns
 * are parsed, soft-deleted rows are left out. Every decision about what the data means is made by the engine.
 * Only the last 400 days are loaded (the engine never looks further back).
 */
import { DAY_MS, type ChildDataset, type ChildProfile, type DatasetSettings, type DoseStatus, type EpisodeType,
  type CalendarTag, type PlaceType, type StrategyOutcome, type VisitPlaceType, type VisitSource } from '@emolens/shared';
import { localDateOf } from '@emolens/engine';
import { all, type Executor } from '../db/types';
import { iso, ms } from '../db/time';
import { parseJson, type MedSchedule } from '../db/rows';
import type { Settings } from '../db/repo/settings';

const HISTORY_DAYS = 400;
const msOrNull = (s: string | null | undefined) => (s == null ? null : ms(s));

export function datasetSettings(settings: Settings): DatasetSettings {
  return {
    noiseThresholdDb: settings.noise_threshold_db,
    recencyHalfLifeDays: settings.recency_half_life_days,
    sensitivity: settings.alert_sensitivity,
    maxAlertsPerDay: settings.max_alerts_per_day,
    quietHours: settings.quiet_hours,
    earlyAlertsEnabled: settings.early_alerts_enabled,
    hasHomeCoordinates: settings.weather_lat != null || settings.simulated_sources,
    calendarConnected: !!settings.integration_state.calendar?.enabled || settings.simulated_sources,
  };
}

export async function loadDataset(ex: Executor, child: ChildProfile, settings: Settings, now: number): Promise<ChildDataset> {
  const id = child.id;
  const since = iso(now - HISTORY_DAYS * DAY_MS);
  const q = <T>(sql: string, params: (string | number)[] = []) => all<T>(ex, sql, params);

  const [episodes, meds, changes, doses, meals, sleep, places, visits, calendar, routines, illness, weather, sound, health,
    alerts, responses, closures, strategies, uses] = await Promise.all([
    q<{ id: string; started_at: string; duration_min: number | null; type: EpisodeType; intensity: number | null; place_type: string | null }>(
      'SELECT id, started_at, duration_min, type, intensity, place_type FROM episodes WHERE child_id = ? AND deleted_at IS NULL AND started_at >= ? ORDER BY started_at', [id, since]),
    q<{ id: string; name: string; schedule: string; as_needed: number; active_from: string; active_to: string | null }>(
      'SELECT id, name, schedule, as_needed, active_from, active_to FROM medications WHERE child_id = ? AND deleted_at IS NULL', [id]),
    q<{ medication_id: string; changed_at: string; change_type: 'start' | 'stop' | 'dose_change' | 'time_change' }>(
      `SELECT c.medication_id, c.changed_at, c.change_type FROM medication_changes c JOIN medications m ON m.id = c.medication_id
       WHERE m.child_id = ? AND c.deleted_at IS NULL AND c.changed_at >= ? ORDER BY c.changed_at`, [id, since]),
    q<{ id: string; medication_id: string; scheduled_for: string | null; taken_at: string | null; status: DoseStatus }>(
      `SELECT d.id, d.medication_id, d.scheduled_for, d.taken_at, d.status FROM med_doses d JOIN medications m ON m.id = d.medication_id
       WHERE m.child_id = ? AND d.deleted_at IS NULL AND COALESCE(d.scheduled_for, d.taken_at) >= ? ORDER BY COALESCE(d.scheduled_for, d.taken_at)`, [id, since]),
    q<{ id: string; eaten_at: string; meal_type: ChildDataset['meals'][number]['mealType']; items: string }>(
      'SELECT id, eaten_at, meal_type, items FROM meals WHERE child_id = ? AND deleted_at IS NULL AND eaten_at >= ? ORDER BY eaten_at', [id, since]),
    q<{ id: string; sleep_start: string; sleep_end: string; duration_min: number; night_wakings: number | null; quality: number | null }>(
      'SELECT id, sleep_start, sleep_end, duration_min, night_wakings, quality FROM sleep_entries WHERE child_id = ? AND deleted_at IS NULL AND sleep_end >= ? ORDER BY sleep_end', [id, since]),
    q<{ id: string; label: string; type: PlaceType }>('SELECT id, label, type FROM places WHERE child_id = ? AND deleted_at IS NULL', [id]),
    q<{ id: string; place_id: string | null; place_type: VisitPlaceType; arrived_at: string; departed_at: string | null; source: VisitSource }>(
      `SELECT id, place_id, place_type, arrived_at, departed_at, source FROM place_visits
       WHERE child_id = ? AND deleted_at IS NULL AND (departed_at IS NULL OR departed_at >= ?) ORDER BY arrived_at`, [id, since]),
    q<{ id: string; start_at: string; end_at: string; all_day: number; tags: string; ignored: number }>(
      'SELECT id, start_at, end_at, all_day, tags, ignored FROM calendar_events WHERE end_at >= ? ORDER BY start_at', [since]),
    q<{ id: string; local_date: string; start_at: string | null; severity: number }>(
      'SELECT id, local_date, start_at, severity FROM routine_changes WHERE child_id = ? AND deleted_at IS NULL', [id]),
    q<{ id: string; started_at: string; ended_at: string | null; severity: number; kind: string }>(
      'SELECT id, started_at, ended_at, severity, kind FROM illness_logs WHERE child_id = ? AND deleted_at IS NULL AND (ended_at IS NULL OR ended_at >= ?) ORDER BY started_at', [id, since]),
    q<{ time: string; temperature_c: number | null; pressure_hpa: number | null; us_aqi: number | null; pollen_index: number | null; is_forecast: number }>(
      'SELECT time, temperature_c, pressure_hpa, us_aqi, pollen_index, is_forecast FROM weather_hourly WHERE time >= ? ORDER BY time', [since]),
    q<{ measured_at: string; level_db: number; duration_s: number; place_id: string | null }>(
      'SELECT measured_at, level_db, duration_s, place_id FROM sound_samples WHERE measured_at >= ? ORDER BY measured_at', [since]),
    q<{ type: string; start_at: string; value: number }>(
      'SELECT type, start_at, value FROM health_samples WHERE start_at >= ? ORDER BY start_at', [since]),
    q<{ id: string; block_start: string; scheduled_for: string; status: ChildDataset['alerts'][number]['status'] }>(
      'SELECT id, block_start, scheduled_for, status FROM alerts WHERE child_id = ? AND deleted_at IS NULL AND block_start >= ?', [id, since]),
    q<{ alert_id: string; response: ChildDataset['alertResponses'][number]['response']; responded_at: string }>(
      `SELECT r.alert_id, r.response, r.responded_at FROM alert_responses r JOIN alerts a ON a.id = r.alert_id
       WHERE a.child_id = ? AND r.deleted_at IS NULL ORDER BY r.responded_at`, [id]),
    q<{ local_date: string; all_logged: number; closed_at: string | null; created_at: string }>(
      'SELECT local_date, all_logged, closed_at, created_at FROM day_closures WHERE child_id = ? AND deleted_at IS NULL', [id]),
    q<{ id: string; name: string; category: string; active: number; onboarding_favorite: number }>(
      'SELECT id, name, category, active, onboarding_favorite FROM strategies WHERE child_id = ? AND deleted_at IS NULL', [id]),
    q<{ id: string; strategy_id: string; context: 'proactive' | 'during'; outcome: StrategyOutcome; used_at: string; episode_id: string | null; alert_id: string | null }>(
      'SELECT id, strategy_id, context, outcome, used_at, episode_id, alert_id FROM strategy_uses WHERE child_id = ? AND deleted_at IS NULL ORDER BY used_at', [id]),
  ]);

  // Daily resting heart rate, HRV and steps by local date (latest value of the day; steps are summed).
  const tz = child.homeTz;
  const daily = new Map<string, { localDate: string; restingHr: number | null; hrv: number | null; steps: number | null }>();
  const day = (d: string) => { let x = daily.get(d); if (!x) { x = { localDate: d, restingHr: null, hrv: null, steps: null }; daily.set(d, x); } return x; };
  const heart: ChildDataset['heart'] = [];
  for (const h of health) {
    const t = ms(h.start_at);
    if (h.type === 'heart_rate') heart.push({ time: t, bpm: h.value });
    else if (h.type === 'resting_hr') day(localDateOf(t, tz)).restingHr = h.value;
    else if (h.type === 'hrv_sdnn' || h.type === 'hrv_rmssd') day(localDateOf(t, tz)).hrv = h.value;
    else if (h.type === 'steps') { const d = day(localDateOf(t, tz)); d.steps = (d.steps ?? 0) + h.value; }
  }

  return {
    child,
    settings: datasetSettings(settings),
    episodes: episodes.map((e) => ({ id: e.id, startedAt: ms(e.started_at), durationMin: e.duration_min, type: e.type, intensity: e.intensity, placeType: e.place_type })),
    medications: meds.map((m) => {
      const sch = parseJson<MedSchedule>(m.schedule, { times: [], days: [1, 2, 3, 4, 5, 6, 7] });
      return { id: m.id, name: m.name, scheduleTimes: sch.times, scheduleDays: sch.days, asNeeded: !!m.as_needed, activeFrom: m.active_from, activeTo: m.active_to };
    }),
    medicationChanges: changes.map((c) => ({ medicationId: c.medication_id, changedAt: ms(c.changed_at), changeType: c.change_type })),
    doses: doses.map((d) => ({ id: d.id, medicationId: d.medication_id, scheduledFor: msOrNull(d.scheduled_for), takenAt: msOrNull(d.taken_at), status: d.status })),
    meals: meals.map((m) => ({ id: m.id, eatenAt: ms(m.eaten_at), mealType: m.meal_type,
      items: parseJson<{ name: string; tags?: string[] }[]>(m.items, []).map((i) => ({ name: i.name, tags: i.tags ?? [] })) })),
    sleep: sleep.map((s) => ({ id: s.id, sleepStart: ms(s.sleep_start), sleepEnd: ms(s.sleep_end), durationMin: s.duration_min, nightWakings: s.night_wakings, quality: s.quality })),
    places: places.map((p) => ({ id: p.id, label: p.label, type: p.type })),
    visits: visits.map((v) => ({ id: v.id, placeId: v.place_id, placeType: v.place_type, arrivedAt: ms(v.arrived_at), departedAt: msOrNull(v.departed_at), source: v.source })),
    calendar: calendar.map((e) => ({ id: e.id, startAt: ms(e.start_at), endAt: ms(e.end_at), allDay: !!e.all_day, tags: parseJson<CalendarTag[]>(e.tags, []), ignored: !!e.ignored })),
    routineChanges: routines.map((r) => ({ id: r.id, localDate: r.local_date, startAt: msOrNull(r.start_at), severity: r.severity })),
    illness: illness.map((i) => ({ id: i.id, startedAt: ms(i.started_at), endedAt: msOrNull(i.ended_at), severity: i.severity, kind: i.kind })),
    weather: weather.map((w) => ({ time: ms(w.time), temperatureC: w.temperature_c, pressureHpa: w.pressure_hpa, usAqi: w.us_aqi, pollenIndex: w.pollen_index, isForecast: !!w.is_forecast })),
    sound: sound.map((s) => ({ start: ms(s.measured_at), minutes: s.duration_s / 60, db: s.level_db, tempC: null, placeId: s.place_id, source: 'phone' as const })),
    heart,
    dailyHealth: [...daily.values()].sort((a, b) => a.localDate.localeCompare(b.localDate)),
    alerts: alerts.map((a) => ({ id: a.id, blockStart: ms(a.block_start), scheduledFor: ms(a.scheduled_for), status: a.status })),
    alertResponses: responses.map((r) => ({ alertId: r.alert_id, response: r.response, respondedAt: ms(r.responded_at) })),
    dayClosures: closures.map((c) => ({ localDate: c.local_date, allLogged: !!c.all_logged, closedAt: ms(c.closed_at ?? c.created_at) })),
    strategies: strategies.map((s) => ({ id: s.id, name: s.name, category: s.category, active: !!s.active, onboardingFavorite: !!s.onboarding_favorite })),
    strategyUses: uses.map((u) => ({ id: u.id, strategyId: u.strategy_id, context: u.context, outcome: u.outcome, usedAt: ms(u.used_at), episodeId: u.episode_id, alertId: u.alert_id })),
  };
}
