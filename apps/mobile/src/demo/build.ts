/**
 * Fills the demo profile (SPEC 9.10): "populated by running the simulator's default scenario for one synthetic family
 * (120 days, fixed seed) through the same engine".
 *
 *  1. The simulator makes up one family's world (sleep, school, meals, medication, weather, noise ...) and lives
 *     through it day by day up to YESTERDAY. Every evening at 18:00 the REAL engine refits and forecasts the next day,
 *     and the REAL alert rules decide alerts; a simulated parent logs, answers alerts and does the end-of-day check.
 *     We wait a moment between days so the progress screen can update.
 *  2. What the app could know right now (`observedView`) is copied into `emolens-demo.db`, together with each
 *     evening's day-ahead forecasts and fits, so Model Health and "how the estimate changed" work right away.
 *  3. A weekly digest for every full simulated week (SPEC 9.10: the digest must be demonstrable), using the pattern
 *     statuses the engine showed on each digest evening.
 *  4. One live forecast run, exactly like the real profile's, makes today's forecast at the real current time (and the
 *     current week's digest if it is due).
 * It runs only when the demo database is empty (the first time, or after "Regenerate demo data").
 */
import { DEFAULT_STRATEGIES, SUSPECTED_TRIGGERS, type Lang } from '@emolens/shared';
import { addDays, isoWeekday, localDateOf, zonedToUtc, type EngineResult, type EngineState, type InsightStatus } from '@emolens/engine';
import {
  DEMO_FAMILY, DEMO_SUSPECTED, demoEpisodeDetails, demoScenario, demoStrategyUses, generateWorld, observedView, prepareDemoWorld, simulateSteps, type Scenario,
} from '@emolens/simulator';
import defaultScenario from '@emolens/simulator/scenarios/default.json';
import { iso, newId, nowIso } from '../db/time';
import { getChild, toChildProfile } from '../db/repo/children';
import { SETTING_DEFAULTS, setSettings, type DemoInfo, type Settings } from '../db/repo/settings';
import type { Repo } from '../db/repo/writer';
import { computeDigest, saveDigest } from '../digest/generate';
import { updateForecast } from '../forecast/update';
import type { IntegrationId } from '../integrations/types';

export const DEMO_NICKNAME = { en: 'Sam (demo)', es: 'Sam (demo)' };
/** Onboarding "what helps" favorites of the demo parent (indexes into DEFAULT_STRATEGIES). */
const DEMO_FAVORITES = [0, 1, 8];

export interface DemoProgress { phase: 'simulating' | 'saving' | 'forecasting'; day: number; days: number; }

export interface BuildOptions {
  lang: Lang;
  tz: string;
  now?: number;
  onProgress?: (p: DemoProgress) => void;
  /** Tests only: fewer simulated days. */
  days?: number;
  /** Let the screen update between simulated days (off in tests). */
  yieldToUi?: boolean;
}

interface DayCapture { madeAt: number; fitId: string; res: Pick<EngineResult, 'keys' | 'prior' | 'fit' | 'labeledBlocks' | 'positives' | 'labeledDays' | 'forecasts'>; }

/** The simulator's menu (packages/simulator generate.ts) in Spanish, so the Spanish demo shows no English food names. */
const FOOD_NAMES_ES: Record<string, string> = {
  oatmeal: 'avena', toast: 'pan tostado', cereal: 'cereal', eggs: 'huevos', sandwich: 'sándwich', pasta: 'pasta',
  'rice bowl': 'tazón de arroz', apple: 'manzana', crackers: 'galletas saladas', yogurt: 'yogur',
  'chicken and rice': 'pollo con arroz', tacos: 'tacos', soup: 'sopa', cookies: 'galletas', candy: 'dulces',
  'juice pouch': 'jugo en bolsita',
};
const foodName = (name: string, lang: Lang) => (lang === 'es' ? FOOD_NAMES_ES[name] ?? name : name);

const PLACE_NAMES: Record<string, { en: string; es: string }> = {
  home: { en: 'Home', es: 'Casa' }, school: { en: 'School', es: 'Escuela' }, therapy: { en: 'Therapy', es: 'Terapia' },
  store: { en: 'Grocery store', es: 'Supermercado' }, relative: { en: "Grandma's", es: 'Casa de la abuela' },
};
/** Short notes the demo parent wrote on some hard moments (`noteIndex` from demoEpisodeDetails). Neutral wording
 * with no sleep, home or medication words, so they would be fine in any report. */
const EPISODE_NOTES: { en: string; es: string }[] = [
  { en: 'Calmed down after some quiet time.', es: 'Se calmó después de un rato tranquilo.' },
  { en: 'Started when the plan changed.', es: 'Empezó cuando cambió el plan.' },
  { en: 'Wanted to keep playing.', es: 'Quería seguir jugando.' },
  { en: 'Hands over ears the whole time.', es: 'Se tapó los oídos todo el rato.' },
  { en: 'Better once we gave a 5-minute warning.', es: 'Mejor cuando avisamos 5 minutos antes.' },
  { en: 'Seemed hungry beforehand.', es: 'Parecía tener hambre antes.' },
  { en: 'Very loud room.', es: 'La sala estaba muy ruidosa.' },
  { en: 'Recovered quickly this time.', es: 'Se recuperó rápido esta vez.' },
];
/** Calendar titles by the simulator's event id prefix (titles are local-only, like real ones). */
const EVENT_TITLES: Record<string, { en: string; es: string }> = {
  ts: { en: 'School drop-off', es: 'Llegada a la escuela' }, te: { en: 'School pickup', es: 'Salida de la escuela' },
  tx: { en: 'Change of activity', es: 'Cambio de actividad' }, ap: { en: 'Dentist', es: 'Dentista' },
  un: { en: 'Visitors coming', es: 'Vienen visitas' }, ns: { en: 'No school', es: 'No hay clases' },
};

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function buildDemo(repo: Repo, opts: BuildOptions): Promise<DemoInfo> {
  const started = Date.now();
  const now = opts.now ?? Date.now();
  const { lang, tz } = opts;
  const today = localDateOf(now, tz);
  // JSON boundary: the scenario file has exactly the Scenario shape (checked by the simulator's own tests).
  const plan = demoScenario(defaultScenario as unknown as Scenario, today, tz, opts.days);
  const world = prepareDemoWorld(generateWorld(plan.scenario, DEMO_FAMILY));
  world.child.nickname = DEMO_NICKNAME[lang];

  // 1. live through the days, keeping each evening's forecasts and fit
  const captures: DayCapture[] = [];
  let lastState: EngineState | null = null;
  // pattern statuses shown on each digest evening (Sunday), for that week's digest
  const digestDay = SETTING_DEFAULTS.digest_day_time.weekday;
  const weekStatuses = new Map<string, Record<string, InsightStatus>>();
  const steps = simulateSteps(world, {
    simulateDays: plan.simulateDays,
    onDay: (_day, res) => {
      captures.push({ madeAt: res.now, fitId: newId(), res: { keys: res.keys, prior: res.prior, fit: res.fit, labeledBlocks: res.labeledBlocks,
        positives: res.positives, labeledDays: res.labeledDays, forecasts: res.forecasts } });
      lastState = res.state;
      const date = localDateOf(res.now, tz);
      if (isoWeekday(date) === digestDay) weekStatuses.set(date, Object.fromEntries(res.insights.map((r) => [r.key, r.status])));
    },
  });
  let step = steps.next();
  while (!step.done) {
    opts.onProgress?.({ phase: 'simulating', day: step.value, days: plan.simulateDays });
    if (opts.yieldToUi !== false) await pause();
    step = steps.next();
  }
  const run = step.value;
  opts.onProgress?.({ phase: 'saving', day: plan.simulateDays, days: plan.simulateDays });
  if (opts.yieldToUi !== false) await pause();

  // 2. copy what the app could know right now into the demo database
  const ds = observedView(world, run.log, now);
  const lastDate = localDateOf(now - 86_400_000, tz);
  const info: DemoInfo = { builtAt: nowIso(), lastDate, days: plan.simulateDays, buildMs: 0 };
  await repo.write(async (w) => {
    const ex = w.ex;
    const c = world.child;
    const childId = await w.insert('children', {
      nickname: c.nickname, birth_year: 2017, home_tz: tz, communication: 'some_words', wake_start: c.wakeStart, wake_end: c.wakeEnd,
      typical_sleep_hours: c.typicalSleepHours, episodes_per_week_estimate: c.episodesPerWeekEstimate,
      modeled_episode_types: JSON.stringify(c.modeledEpisodeTypes), min_modeled_intensity: c.minModeledIntensity, school_days: JSON.stringify(c.schoolDays),
    });

    const strategyIds: string[] = [];
    for (const [i, s] of DEFAULT_STRATEGIES.entries()) {
      strategyIds.push(await w.insert('strategies', { child_id: childId, name: s.name[lang], category: s.category, is_default: 1, active: 1,
        onboarding_favorite: DEMO_FAVORITES.includes(i) ? 1 : 0 }));
    }
    const placeId = new Map<string, string>();
    for (const p of ds.places) {
      placeId.set(p.id, await w.insert('places', { child_id: childId, label: (PLACE_NAMES[p.id] ?? { en: p.label, es: p.label })[lang], type: p.type,
        latitude: null, longitude: null, radius_m: 150, geofence_enabled: 0 }));
    }
    const medId = new Map<string, string>();
    for (const m of ds.medications) {
      const id = await w.insert('medications', { child_id: childId, name: lang === 'es' ? 'Medicamento A' : 'Medication A', rxcui: null, strength: '5 mg',
        form: 'tablet', schedule: JSON.stringify({ times: m.scheduleTimes, days: m.scheduleDays }), as_needed: 0, reminders_enabled: 0,
        active_from: m.activeFrom, active_to: m.activeTo, notes: null });
      medId.set(m.id, id);
      await w.insert('medication_changes', { medication_id: id, changed_at: iso(Date.parse(`${m.activeFrom}T12:00:00Z`)), change_type: 'start', old_value: null, new_value: '5 mg' });
    }
    for (const ch of ds.medicationChanges) {
      await w.insert('medication_changes', { medication_id: medId.get(ch.medicationId) as string, changed_at: iso(ch.changedAt), change_type: ch.changeType, old_value: '5 mg', new_value: '7.5 mg' });
    }
    for (const d of ds.doses) {
      await w.insert('med_doses', { medication_id: medId.get(d.medicationId) as string, scheduled_for: d.scheduledFor == null ? null : iso(d.scheduledFor),
        taken_at: d.takenAt == null ? null : iso(d.takenAt), status: d.status, dose_text: '5 mg' });
    }
    // What the parent typed about each hard moment. Episodes without a "during" strategy use are the busy-day ones
    // with no details (same choice as demoStrategyUses), so the two always agree.
    const strategyUses = demoStrategyUses(world, run.log, run.alerts, strategyIds);
    const withUses = new Set(strategyUses.filter((u) => u.context === 'during' && u.episodeId).map((u) => u.episodeId as string));
    const details = demoEpisodeDetails(world, ds.episodes, new Set(ds.episodes.filter((e) => !withUses.has(e.id)).map((e) => e.id)));
    const episodeId = new Map<string, string>();
    for (const e of ds.episodes) {
      const fast = e.id.endsWith('-fast');
      const d = details.get(e.id);
      episodeId.set(e.id, await w.insert('episodes', { child_id: childId, started_at: iso(e.startedAt), duration_min: d ? d.durationMin : e.durationMin,
        type: e.type, intensity: e.intensity, place_id: d?.placeId ? placeId.get(d.placeId) ?? null : null, place_type: d?.placeType ?? null,
        antecedent_tags: JSON.stringify(d?.antecedentTags ?? []), antecedent_note: null, behavior_tags: JSON.stringify(d?.behaviorTags ?? []),
        safety_concern: 0, notes: d?.noteIndex != null ? EPISODE_NOTES[d.noteIndex][lang] : null,
        details_complete: d ? (d.detailsComplete ? 1 : 0) : fast ? 0 : 1, source: fast ? 'alert_confirm' : 'manual' }));
    }
    for (const m of ds.meals) {
      await w.insert('meals', { child_id: childId, eaten_at: iso(m.eatenAt), meal_type: m.mealType,
        items: JSON.stringify(m.items.map((i) => ({ name: foodName(i.name, lang), source: 'custom', code: null, tags: i.tags }))), amount: 'most', notes: null });
    }
    for (const s of ds.sleep) {
      await w.insert('sleep_entries', { child_id: childId, sleep_start: iso(s.sleepStart), sleep_end: iso(s.sleepEnd), duration_min: s.durationMin,
        quality: null, night_wakings: s.nightWakings, source: 'manual', external_id: null });
    }
    for (const v of ds.visits) {
      await w.insert('place_visits', { child_id: childId, place_id: v.placeId ? placeId.get(v.placeId) ?? null : null, place_type: v.placeType,
        arrived_at: iso(v.arrivedAt), departed_at: v.departedAt == null ? null : iso(v.departedAt), source: v.source });
    }
    for (const i of ds.illness) {
      await w.insert('illness_logs', { child_id: childId, started_at: iso(i.startedAt), ended_at: i.endedAt == null ? null : iso(i.endedAt), kind: i.kind, severity: i.severity, notes: null });
    }
    for (const e of ds.calendar) {
      const title = EVENT_TITLES[e.id.split('-')[0]] ?? EVENT_TITLES.tx;
      await ex.execute('INSERT INTO calendar_events (id, external_id, calendar_id, title, start_at, end_at, all_day, tags, ignored, user_tagged) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)',
        [newId(), `demo:${e.id}`, 'demo', title[lang], iso(e.startAt), iso(e.endAt), e.allDay ? 1 : 0, JSON.stringify(e.tags)]);
    }
    const fetchedAt = iso(now);
    for (const h of ds.weather) {
      await ex.execute(`INSERT INTO weather_hourly (time, temperature_c, pressure_hpa, humidity, precipitation_mm, us_aqi, pm2_5, pollen_index, is_forecast, fetched_at)
        VALUES (?, ?, ?, NULL, NULL, ?, NULL, ?, ?, ?)`, [iso(h.time), h.temperatureC, h.pressureHpa, h.usAqi, h.pollenIndex, h.isForecast ? 1 : 0, fetchedAt]);
    }
    for (const s of ds.sound) {
      await ex.execute('INSERT INTO sound_samples (id, measured_at, level_db, duration_s, source, place_id) VALUES (?, ?, ?, ?, ?, ?)',
        [newId(), iso(s.start), s.db ?? 0, Math.round(s.minutes * 60), 'phone', s.placeId ? placeId.get(s.placeId) ?? null : null]);
    }

    // Alerts up to yesterday. Today's are planned again by the live run below, which also schedules their notifications.
    const alertId = new Map<string, string>();
    for (const a of ds.alerts) {
      if (localDateOf(a.blockStart, tz) >= today) continue;
      alertId.set(a.id, await w.insert('alerts', { child_id: childId, block_start: iso(a.blockStart), prediction_id: null, scheduled_for: iso(a.scheduledFor),
        notification_id: null, confirm_notification_id: null, status: a.status === 'scheduled' ? 'delivered' : a.status }));
    }
    for (const r of ds.alertResponses) {
      const id = alertId.get(r.alertId);
      if (id) await w.insert('alert_responses', { alert_id: id, response: r.response, responded_at: iso(r.respondedAt), followup_done: 1 });
    }
    const closures = new Map<string, number>();
    for (const cl of ds.dayClosures) if (cl.allLogged) closures.set(cl.localDate, Math.max(closures.get(cl.localDate) ?? 0, cl.closedAt));
    for (const [date, closedAt] of closures) {
      await w.insert('day_closures', { child_id: childId, local_date: date, all_logged: 1, closed_at: iso(closedAt) });
    }
    for (const u of strategyUses) {
      if (u.usedAt > now) continue;
      const alert = u.alertId ? alertId.get(u.alertId) : null;
      if (u.alertId && !alert) continue;
      await w.insert('strategy_uses', { child_id: childId, strategy_id: u.strategyId, context: u.context, episode_id: u.episodeId ? episodeId.get(u.episodeId) ?? null : null,
        alert_id: alert ?? null, outcome: u.outcome, used_at: iso(u.usedAt) });
    }

    // each evening's fit and its day-ahead forecasts (SPEC 13.10), for Model Health and the estimate-over-time chart
    for (const cap of captures) {
      const r = cap.res;
      await ex.execute(`INSERT INTO model_fits (id, child_id, fitted_at, feature_keys, prior_mean, prior_sd, beta, cov, feature_means, tau, log_marginal,
        n_blocks, n_positive, labeled_days, converged, iterations) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cap.fitId, childId, iso(cap.madeAt), JSON.stringify(r.keys), JSON.stringify(r.prior.mean), JSON.stringify(r.prior.sd), JSON.stringify(r.fit.beta),
        JSON.stringify(r.fit.cov), JSON.stringify(r.fit.featureMeans), r.fit.tau, Number.isFinite(r.fit.logMarginal) ? r.fit.logMarginal : 0,
        r.labeledBlocks, r.positives, r.labeledDays, r.fit.converged ? 1 : 0, r.fit.iterations]);
      for (const f of r.forecasts) {
        await ex.execute(`INSERT INTO predictions (id, child_id, block_start, made_at, kind, p, p_lo, p_hi, p_baseline, level, reasons_json, model_fit_id)
          VALUES (?, ?, ?, ?, 'day_ahead', ?, ?, ?, ?, ?, ?, ?)`,
        [newId(), childId, iso(f.block.start), iso(cap.madeAt), f.p, f.pLo, f.pHi, f.pBaseline, f.level,
          JSON.stringify({ raising: f.reasons, protective: f.protective }), cap.fitId]);
      }
    }

    // settings: onboarding done, the simulated sources count as connected, real syncs stay off in the demo
    const off: Settings['integration_state'] = {};
    for (const id of ['weather', 'location', 'calendar', 'health', 'sound'] as IntegrationId[]) {
      off[id] = { enabled: false, lastSyncAt: null, lastSuccessAt: null, lastError: null };
    }
    const state = lastState as EngineState | null;
    await setSettings(ex, {
      language: lang, mode: 'local_only', units: lang === 'es' ? 'metric' : 'imperial',
      suspected_triggers: SUSPECTED_TRIGGERS.filter((t) => DEMO_SUSPECTED.includes(t.id)).map((t) => t.id),
      location_tracking: 'manual', with_child_default: false, integration_state: off, calendar_ids: [],
      alert_sensitivity: world.settings.sensitivity, max_alerts_per_day: world.settings.maxAlertsPerDay, quiet_hours: world.settings.quietHours,
      early_alerts_enabled: world.settings.earlyAlertsEnabled, noise_threshold_db: world.settings.noiseThresholdDb,
      simulated_sources: true, onboarding_complete: true, demo_info: info,
      insight_status_history: state?.statusHistory ?? {},
      // Patterns found during the simulated months are not announced again.
      notified_insights: Object.entries(state?.statusHistory ?? {}).filter(([, h]) => h.displayed === 'likely' || h.displayed === 'strong').map(([k]) => k),
    });
    if (state) {
      await ex.execute('INSERT INTO engine_snapshots (child_id, computed_at, result_json, state_json) VALUES (?, ?, ?, ?)',
        [childId, iso(now), 'null', JSON.stringify({ engine: { tau: state.tau, tauSelectedAt: state.tauSelectedAt, tauLabeledBlocks: state.tauLabeledBlocks, lastFit: state.lastFit }, fingerprint: null })]);
    }
  });

  const childRow = await getChild(repo.db);
  if (!childRow) throw new Error('demo child missing');
  const profile = toChildProfile(childRow, SUSPECTED_TRIGGERS.filter((t) => DEMO_SUSPECTED.includes(t.id)).map((t) => t.id));

  // 3. one digest per full simulated week, oldest first (each one reports what changed since the one before)
  const firstDay = captures.length ? localDateOf(captures[0].madeAt, tz) : today;
  for (const [sunday, statuses] of [...weekStatuses.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const weekStart = addDays(sunday, -6);
    if (weekStart < firstDay) continue;
    const [h, m] = SETTING_DEFAULTS.digest_day_time.time.split(':').map(Number);
    const madeAt = zonedToUtc(sunday, h * 60 + m, tz);
    // "worth watching" is only worked out for today, so past weeks don't claim a list (null)
    await saveDigest(repo.db, profile.id, await computeDigest(repo.db, profile, weekStart, madeAt, { statuses, watch: null }));
  }

  // 4. today's forecast, made live by the same code as for a real child
  opts.onProgress?.({ phase: 'forecasting', day: plan.simulateDays, days: plan.simulateDays });
  if (opts.yieldToUi !== false) await pause();
  await updateForecast(repo, profile, { now, quiet: true, forceWorthWatching: true });
  info.buildMs = Date.now() - started;
  await setSettings(repo.db, { demo_info: info });
  return info;
}
