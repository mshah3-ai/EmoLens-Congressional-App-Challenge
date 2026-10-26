/**
 * Simulates one family day by day (spec 26.2): the child lives through each day (hard moments drawn
 * from the true chance, lowered when a parent steps in after an alert), the simulated caregiver logs
 * and answers, and every evening at 18:00 the REAL engine (`runEngine`) refits on what was observed
 * and forecasts tomorrow, and the REAL alert rules (`planAlerts`) decide tomorrow's alerts.
 * Pure TypeScript (no Node APIs), so demo mode can run it too.
 */
import { CONFIRM_DELAY_MIN, FEATURE_BY_KEY, MINUTE_MS, type AlertResponseKind, type RiskLevel } from '@emolens/shared';
import {
  addDays, emptyEngineState, localDateOf, parseHHMM, planAlerts, runEngine, zonedToUtc,
  type EngineResult, type EngineState, type FeatureResult, type InsightStatus, type StoredDayAhead,
} from '@emolens/engine';
import { emptyLog, generateWorld, observedView, uniformFor, type SimBlock, type SimLog, type World } from './generate';
import { calibrationBins, windowMetrics, type CalibrationRow, type PredRow } from './metrics';
import type { Scenario } from './scenario';

/** Days (1-based) at which coefficients are recorded (spec 26.3). */
export const COEF_DAYS = [30, 45, 60, 90, 120];
/** Metrics start on this day (spec 26.3). */
export const FIRST_METRIC_DAY = 7;
/** End-of-day check time (settings default) and the next-morning follow-up time. */
const EOD_TIME = '20:30', MORNING_TIME = '07:30', EVENING_RUN = '18:00';

export interface DailyRow {
  family: number;
  /** 1-based: day 1 is the first simulated date; the engine ran at 18:00 on this day. */
  day: number;
  date: string;
  learning: number;
  labeledDays: number;
  labeledBlocks: number;
  positives: number;
  tau: number;
  fitConverged: number;
  nPlanted: number;
  nNull: number;
  /** Share of planted triggers shown as likely/strong. */
  detection: number | null;
  /** Share of truly-null (enabled) triggers shown as possible, and as likely/strong. */
  nullPossible: number | null;
  nullLikelyStrong: number | null;
  /** Mean estimated beta over planted triggers (for the intervention-trap experiment). */
  meanPlantedBeta: number | null;
  meanPlantedBetaRatio: number | null;
  alerts7: number;
  happened7: number;
  calm7: number;
  stepped7: number;
  /** Forecast quality of day-ahead predictions for the next 7 days. */
  auroc7: number | null;
  brier7: number | null;
  brierBase7: number | null;
  skill7: number | null;
  expectedSkill7: number | null;
  oracleSkill7: number | null;
  oracleRealizedSkill7: number | null;
  n7: number;
  pos7: number;
  statuses: Record<string, InsightStatus>;
  betas: Record<string, number | null>;
}

export interface CoefRow {
  family: number; day: number; key: string; enabled: number; planted: number;
  trueBeta: number; beta: number | null; sd: number | null; status: InsightStatus; confidence: number;
}

export interface AlertRow {
  family: number; day: number; date: string; index: number; blockStart: number; fireAt: number;
  status: 'created' | 'suppressed'; reason: string; p: number; level: RiskLevel; pTrue: number;
  intervened: number; episode: number; logged: number; response: AlertResponseKind | '';
}

export interface FamilyResult {
  family: number;
  effects: Record<string, number>;
  daily: DailyRow[];
  coefs: CoefRow[];
  alerts: AlertRow[];
  calibration: (CalibrationRow & { family: number })[];
  preds: PredRow[];
  /** Total simulated hard moments, and how many were logged. */
  episodes: number;
  loggedEpisodes: number;
  engineMs: number;
}

export interface SimulateOptions {
  /** Called after every simulated day (demo mode can show progress). */
  onDay?: (day: number, result: EngineResult) => void;
  /** Clock used only to report engine time (pass performance.now in Node). */
  clock?: () => number;
  /**
   * Simulate only the first N days of the world (default: all `scenario.days`). Demo mode generates a world that
   * reaches into tomorrow (planned calendar, forecast weather) but lives through the days only up to yesterday.
   */
  simulateDays?: number;
}

/** A finished run plus what the simulated caregiver and app recorded (demo mode copies this into its database). */
export interface SimulationRun extends FamilyResult { world: World; log: SimLog; }

export function simulateFamily(scenario: Scenario, family: number, opts: SimulateOptions = {}): FamilyResult {
  const world = generateWorld(scenario, family);
  return simulateWorld(world, opts);
}

export function simulateWorld(world: World, opts: SimulateOptions = {}): FamilyResult {
  const steps = simulateSteps(world, opts);
  let r = steps.next();
  while (!r.done) r = steps.next();
  const { family, effects, daily, coefs, alerts, calibration, preds, episodes, loggedEpisodes, engineMs } = r.value;
  return { family, effects, daily, coefs, alerts, calibration, preds, episodes, loggedEpisodes, engineMs };
}

/**
 * The same simulation, one day per step: `next()` simulates one more day and yields its number (1-based); the final
 * `next()` returns the finished run. The app's demo mode awaits between steps so the screen can show progress.
 */
export function* simulateSteps(world: World, opts: SimulateOptions = {}): Generator<number, SimulationRun, void> {
  const { scenario, tz, family } = world;
  const beh = scenario.behavior;
  const key = `${scenario.seed}|${family}`;
  const u = (day: number, index: number, purpose: string) => uniformFor(key, day, index, purpose);
  const at = (date: string, hhmm: string) => zonedToUtc(date, parseHHMM(hhmm), tz);
  const clock = opts.clock ?? (() => 0);

  const planted = Object.keys(scenario.trueEffects).filter((k) => FEATURE_BY_KEY[k]?.isTrigger);
  const byDay: SimBlock[][] = Array.from({ length: scenario.days }, () => []);
  for (const b of world.blocks) byDay[b.day].push(b);
  const pTrueByStart = new Map(world.blocks.map((b) => [b.block.start, b]));

  const log = emptyLog();
  let state: EngineState = emptyEngineState();
  const cache = new Map<number, FeatureResult>();
  const dayAhead: StoredDayAhead[] = [];
  const preds: PredRow[] = [];
  const alertRows: AlertRow[] = [];
  const alertByBlock = new Map<number, { id: string; row: AlertRow }>();
  const outcome = new Map<number, { y: 0 | 1; intervened: boolean }>();
  const daily: DailyRow[] = [];
  const coefs: CoefRow[] = [];
  let episodes = 0, loggedEpisodes = 0, engineMs = 0;

  const nDays = Math.min(opts.simulateDays ?? scenario.days, scenario.days);
  for (let d = 0; d < nDays; d++) {
    const date = addDays(world.startDate, d);

    // (a) the child's day: alerts for today were planned yesterday evening
    for (const sb of byDay[d]) {
      const b = sb.block;
      const alertEntry = alertByBlock.get(b.start);
      const alert = alertEntry?.row;
      const intervened = alert != null && u(d, b.index, 'intervene') < beh.interveneProbWhenAlerted;
      const p = sb.pTrue * (intervened ? beh.interventionEffect : 1);
      const y: 0 | 1 = u(d, b.index, 'episode') < p ? 1 : 0;
      let logged = false;
      if (y) {
        episodes++;
        const startedAt = b.start + Math.floor(u(d, b.index, 'time') * (b.end - b.start));
        logged = u(d, b.index, 'log') < beh.logRate;
        if (logged) {
          log.episodes.push({ episode: { id: `ep-${d}-${b.index}`, startedAt, durationMin: 15,
            type: u(d, b.index, 'type') < 0.7 ? 'meltdown' : 'shutdown', intensity: 2 + Math.floor(u(d, b.index, 'intensity') * 4) }, loggedAt: startedAt });
        }
      }
      if (alert) {
        alert.intervened = intervened ? 1 : 0;
        alert.episode = y;
        if (u(d, b.index, 'respond') < beh.alertResponseRate) {
          const response: AlertResponseKind = y ? 'happened' : intervened ? 'stepped_in' : 'calm';
          const respondedAt = b.end + CONFIRM_DELAY_MIN * MINUTE_MS;
          log.responses.push({ alertId: (alertEntry as { id: string }).id, response, respondedAt });
          alert.response = response;
          if (y && !logged) {
            // "A hard moment happened" always leaves an episode: fast-path at the block midpoint (spec 15.4)
            log.episodes.push({ episode: { id: `ep-${d}-${b.index}-fast`, startedAt: Math.round((b.start + b.end) / 2), durationMin: null,
              type: 'meltdown', intensity: null }, loggedAt: respondedAt });
            logged = true;
          }
        }
        alert.logged = logged ? 1 : 0;
      }
      if (logged) loggedEpisodes++;
      outcome.set(b.start, { y, intervened });
    }

    // (b) end-of-day check ("that's everything", even if an episode went unlogged) and next-morning follow-up
    if (u(d, -1, 'eod') < beh.eodCompletion) {
      log.closures.push({ localDate: date, allLogged: true, closedAt: at(date, EOD_TIME) });
      if (u(d, -1, 'morning') < beh.eodCompletion) {
        log.closures.push({ localDate: date, allLogged: true, closedAt: at(addDays(date, 1), MORNING_TIME) });
      }
    }

    // (c) the app's evening run: refit on observed labels, forecast tomorrow, plan tomorrow's alerts
    const now = at(date, EVENING_RUN);
    const tomorrow = addDays(date, 1);
    const ds = observedView(world, log, now);
    const t0 = clock();
    const res = runEngine(ds, now, {
      labelPolicy: scenario.labelPolicy, state, featureCache: cache, dayAheadHistory: dayAhead,
      tauMode: scenario.engine?.tauMode ?? 'auto', triggerPriorSdOverride: scenario.engine?.triggerPriorSdOverride,
      forecastDates: [tomorrow], skipWorthWatching: true,
    });
    engineMs += clock() - t0;
    state = res.state;
    opts.onDay?.(d + 1, res);

    if (d + 1 < scenario.days) {
      for (const f of res.forecasts) {
        dayAhead.push({ blockStart: f.block.start, p: f.p });
        preds.push({ blockDay: d + 1, blockStart: f.block.start, index: f.block.index, p: f.p, pBase: f.pBaseline,
          pTrue: pTrueByStart.get(f.block.start)?.pTrue ?? NaN, y: 0, intervened: false });
      }
      const plan = planAlerts({
        now, tz, blocks: res.forecasts.map((f) => ({ start: f.block.start, end: f.block.end, localDate: f.block.localDate, level: f.level })),
        existing: log.alerts.map((a) => ({ ...a.alert, localDate: localDateOf(a.alert.blockStart, tz) })),
        episodeTimes: ds.episodes.map((e) => e.startedAt), quietHours: world.settings.quietHours,
        maxPerDay: world.settings.maxAlertsPerDay, learning: res.learning, earlyAlertsEnabled: world.settings.earlyAlertsEnabled,
      });
      const fc = new Map(res.forecasts.map((f) => [f.block.start, f]));
      const row = (blockStart: number, fireAt: number, status: 'created' | 'suppressed', reason: string) => {
        const f = fc.get(blockStart);
        return { family, day: d + 2, date: tomorrow, index: f?.block.index ?? -1, blockStart, fireAt, status, reason,
          p: f?.p ?? NaN, level: f?.level ?? 'low', pTrue: pTrueByStart.get(blockStart)?.pTrue ?? NaN,
          intervened: 0, episode: 0, logged: 0, response: '' as const };
      };
      for (const c of plan.create) {
        const id = `al-${d + 1}-${fc.get(c.blockStart)?.block.index}`;
        log.alerts.push({ alert: { id, blockStart: c.blockStart, scheduledFor: c.fireAt, status: 'scheduled' }, createdAt: now });
        const r: AlertRow = row(c.blockStart, c.fireAt, 'created', '');
        alertByBlock.set(c.blockStart, { id, row: r });
        alertRows.push(r);
      }
      for (const s of plan.suppress) {
        log.alerts.push({ alert: { id: `sup-${d + 1}-${s.blockStart}`, blockStart: s.blockStart, scheduledFor: s.fireAt, status: 'suppressed' }, createdAt: now });
        alertRows.push(row(s.blockStart, s.fireAt, 'suppressed', s.reason));
      }
      for (const a of log.alerts) if (a.alert.status === 'scheduled' && a.alert.scheduledFor <= now) a.alert.status = 'delivered';
    }

    // (d) daily metrics
    const dayNum = d + 1;
    if (dayNum >= FIRST_METRIC_DAY) {
      const statuses: Record<string, InsightStatus> = {};
      const betas: Record<string, number | null> = {};
      for (const r of res.insights) { statuses[r.key] = r.status; betas[r.key] = r.status === 'hidden' ? null : r.beta; }
      const nulls = res.insights.filter((r) => r.status !== 'hidden' && !(r.key in scenario.trueEffects));
      const strongish = (s: InsightStatus) => s === 'likely' || s === 'strong';
      const plantedBetas = planted.map((k) => betas[k]).filter((b): b is number => b != null);
      const ratios = planted.filter((k) => betas[k] != null).map((k) => (betas[k] as number) / world.effects[k]);
      const recentAlerts = alertRows.filter((a) => a.status === 'created' && a.day > dayNum - 7 && a.day <= dayNum);
      daily.push({
        family, day: dayNum, date, learning: res.learning ? 1 : 0, labeledDays: res.labeledDays, labeledBlocks: res.labeledBlocks,
        positives: res.positives, tau: res.fit.tau, fitConverged: res.fit.converged ? 1 : 0, nPlanted: planted.length, nNull: nulls.length,
        detection: planted.length ? planted.filter((k) => strongish(statuses[k])).length / planted.length : null,
        nullPossible: nulls.length ? nulls.filter((r) => r.status === 'possible').length / nulls.length : null,
        nullLikelyStrong: nulls.length ? nulls.filter((r) => strongish(r.status)).length / nulls.length : null,
        meanPlantedBeta: plantedBetas.length ? plantedBetas.reduce((a, b) => a + b, 0) / plantedBetas.length : null,
        meanPlantedBetaRatio: ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null,
        alerts7: recentAlerts.length,
        happened7: recentAlerts.filter((a) => a.response === 'happened').length,
        calm7: recentAlerts.filter((a) => a.response === 'calm').length,
        stepped7: recentAlerts.filter((a) => a.response === 'stepped_in').length,
        auroc7: null, brier7: null, brierBase7: null, skill7: null, expectedSkill7: null, oracleSkill7: null, oracleRealizedSkill7: null, n7: 0, pos7: 0,
        statuses, betas,
      });
      if (COEF_DAYS.includes(dayNum)) {
        for (const r of res.insights) {
          const enabled = r.status !== 'hidden';
          coefs.push({ family, day: dayNum, key: r.key, enabled: enabled ? 1 : 0, planted: r.key in scenario.trueEffects ? 1 : 0,
            trueBeta: world.effects[r.key] ?? 0, beta: enabled ? r.beta : null, sd: enabled ? r.sd : null, status: r.status, confidence: r.confidence });
        }
      }
    }
    yield d + 1;
  }

  // outcomes and forecast quality over the next 7 days
  for (const p of preds) {
    const o = outcome.get(p.blockStart);
    if (o) { p.y = o.y; p.intervened = o.intervened; }
  }
  for (const row of daily) {
    const d0 = row.day - 1; // 0-based
    const m = windowMetrics(preds.filter((p) => p.blockDay > d0 && p.blockDay <= d0 + 7));
    Object.assign(row, { auroc7: m.auroc, brier7: m.brier, brierBase7: m.brierBase, skill7: m.skill, expectedSkill7: m.expectedSkill, oracleSkill7: m.oracleSkill, oracleRealizedSkill7: m.oracleRealizedSkill, n7: m.n, pos7: m.positives });
  }
  const calibration = calibrationBins(preds.filter((p) => p.blockDay >= 29)).map((c) => ({ family, ...c }));

  return { family, effects: world.effects, daily, coefs, alerts: alertRows, calibration, preds, episodes, loggedEpisodes, engineMs, world, log };
}
