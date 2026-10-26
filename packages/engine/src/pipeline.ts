/**
 * One full engine run: blocks -> features -> labels -> fit (with tau selection) -> insights ->
 * forecasts. Pure: same dataset + same state + same `now` gives the same result.
 * The mobile app, the portal and the simulator all call this.
 */
import {
  BASELINE_MODEL_KEYS, DAY_MS, FEATURE_COPY, FEATURE_REGISTRY, TAU_GRID, TAU_SELECTION_MIN_DAYS,
  type Block, type ChildDataset, type LabelStatus, type Lang, type RiskLevel,
} from '@emolens/shared';
import { betaPosterior } from './betabinomial';
import { awakeBlocksBetween, awakeIndices } from './features/blocks';
import { buildIndex, computeFeatures, type DatasetIndex, type FeatureResult } from './features/build';
import { enabledFeatureKeys, enabledRequirements, type EnabledMap } from './features/enable';
import { worthWatching, type WatchItem } from './features/items';
import { buildLabelIndex, labelBlock, type LabelPolicy } from './features/labels';
import { buildPrior, childBaseRate, labeledStats, toVector, trainingRows, type LabeledBlock } from './features/model';
import { addDays, localDateOf } from './features/time';
import {
  applyHysteresis, classifyStatus, effectSentence, effectSummary, exposureCounts,
  type EffectSummary, type ExposureCounts, type InsightStatus, type StatusHistoryEntry,
} from './insights';
import { displayLevel, isLearningPeriod } from './levels';
import { FitError, fitLogistic, type Fit, type Prior } from './logistic';
import { contributions, predict } from './predict';
import { buildReasons, type Reason } from './reasons';
import { selectTau } from './shrinkage';
import { hash32 } from './stats';

export interface EngineState {
  statusHistory: Record<string, StatusHistoryEntry>;
  tau: number | null;
  tauSelectedAt: number | null;
  tauLabeledBlocks: number;
  lastFit: { keys: string[]; fit: Fit } | null;
}
export const emptyEngineState = (): EngineState => ({ statusHistory: {}, tau: null, tauSelectedAt: null, tauLabeledBlocks: 0, lastFit: null });

export interface StoredDayAhead { blockStart: number; p: number; }

export interface EngineOptions {
  lang?: Lang;
  labelPolicy?: LabelPolicy;
  state?: EngineState;
  /** Actual-mode feature cache keyed by block start. Safe because features only use data before the block. */
  featureCache?: Map<number, FeatureResult>;
  /** Stored day-ahead predictions (for p0_child). */
  dayAheadHistory?: StoredDayAhead[];
  /** 'auto' = spec behavior; a number fixes tau (simulator experiment E3). */
  tauMode?: 'auto' | number;
  /** Replace every trigger prior sd (simulator experiment E3 "weak prior"). */
  triggerPriorSdOverride?: number;
  /** Which local dates to forecast. Default: today (remaining blocks) + tomorrow. */
  forecastDates?: string[];
  /** Skip the (slower) worth-watching analysis. */
  skipWorthWatching?: boolean;
  /** Skip hysteresis/state updates (read-only preview). */
  dryRun?: boolean;
  /** Only use data starting at this local date (default: first logged date, max 400 days back). */
  startDate?: string;
}

export interface InsightRow extends EffectSummary, ExposureCounts {
  key: string; status: InsightStatus; rawStatus: InsightStatus; unit: number; sentence: string; beta: number; sd: number;
}
export interface ForecastRow {
  block: Block; p: number; pLo: number; pHi: number; pBaseline: number; level: RiskLevel;
  timesUsual: number; reasons: Reason[]; protective: Reason | null; estimated: string[]; values: Record<string, number>;
}
export interface TimeOfDayRow { index: number; n: number; k: number; rate: number; lo80: number; hi80: number; }

export interface EngineResult {
  now: number;
  keys: string[];
  enabled: EnabledMap;
  fit: Fit;
  baselineFit: Fit;
  prior: Prior;
  labeledDays: number;
  labeledBlocks: number;
  positives: number;
  learning: boolean;
  p0Child: number;
  insights: InsightRow[];
  forecasts: ForecastRow[];
  worthWatching: WatchItem[];
  worthWatchingTested: number;
  timeOfDay: TimeOfDayRow[];
  history: LabeledBlock[];
  state: EngineState;
  fitError: string | null;
}

/** First local date with any logged data (at most 400 days back): where time blocks start. */
export function firstDataDate(ds: ChildDataset, now: number): string {
  const tz = ds.child.homeTz;
  let t = now;
  const consider = (x: number) => { if (x < t) t = x; };
  ds.episodes.forEach((e) => consider(e.startedAt));
  ds.meals.forEach((m) => consider(m.eatenAt));
  ds.sleep.forEach((s) => consider(s.sleepEnd));
  ds.visits.forEach((v) => consider(v.arrivedAt));
  ds.doses.forEach((d) => d.scheduledFor != null && consider(d.scheduledFor));
  ds.dayClosures.forEach((c) => consider(c.closedAt));
  t = Math.max(t, now - 400 * DAY_MS);
  return localDateOf(t, tz);
}

/** Label + feature all elapsed-or-started awake blocks. */
export function buildHistory(idx: DatasetIndex, ds: ChildDataset, now: number, policy: LabelPolicy,
  cache?: Map<number, FeatureResult>, startDate?: string): LabeledBlock[] {
  const tz = ds.child.homeTz;
  const from = startDate ?? firstDataDate(ds, now);
  const to = localDateOf(now, tz);
  const li = buildLabelIndex(ds);
  const out: LabeledBlock[] = [];
  for (const b of awakeBlocksBetween(from, to, ds.child)) {
    if (b.start >= now) break;
    let fr = cache?.get(b.start);
    if (!fr) { fr = computeFeatures(idx, b, { mode: 'actual' }); cache?.set(b.start, fr); }
    const label: LabelStatus = labelBlock(li, b, policy, now);
    out.push({ start: b.start, localDate: b.localDate, label, values: fr.values });
  }
  return out;
}

export function runEngine(ds: ChildDataset, now: number, opts: EngineOptions = {}): EngineResult {
  const lang = opts.lang ?? 'en';
  const policy = opts.labelPolicy ?? 'emolens';
  const prevState = opts.state ?? emptyEngineState();
  const state: EngineState = { ...prevState, statusHistory: { ...prevState.statusHistory } };
  const tz = ds.child.homeTz;
  const today = localDateOf(now, tz);
  const idx = buildIndex(ds);
  const nAwake = awakeIndices(ds.child).length;

  // 1. history: features + labels
  const history = buildHistory(idx, ds, now, policy, opts.featureCache, opts.startDate);
  const { labeledDays, positives, labeledBlocks } = labeledStats(history);
  const learning = isLearningPeriod(labeledDays, positives);

  // 2. enabled features and training rows
  const enabled = enabledRequirements(idx, now);
  const keys = enabledFeatureKeys(enabled);
  const rows = trainingRows(history, keys, now, ds.settings.recencyHalfLifeDays);
  const prior = buildPrior(keys, ds.child, nAwake);
  if (opts.triggerPriorSdOverride != null) prior.sd = prior.sd.map((s, j) => (prior.scaled[j] ? opts.triggerPriorSdOverride as number : s));

  // 3. fit (tau fixed at 1 until 30 labeled days; re-select weekly or on +20% labeled blocks)
  let fit: Fit;
  let fitError: string | null = null;
  try {
    if (typeof opts.tauMode === 'number') {
      fit = fitLogistic(rows, prior, opts.tauMode);
    } else if (labeledDays < TAU_SELECTION_MIN_DAYS) {
      fit = fitLogistic(rows, prior, 1);
    } else {
      const due = state.tau == null || state.tauSelectedAt == null || now - state.tauSelectedAt >= 7 * DAY_MS
        || labeledBlocks >= 1.2 * state.tauLabeledBlocks;
      if (due) {
        fit = selectTau(rows, prior, TAU_GRID);
        state.tau = fit.tau; state.tauSelectedAt = now; state.tauLabeledBlocks = labeledBlocks;
      } else {
        fit = fitLogistic(rows, prior, state.tau as number);
      }
    }
    state.lastFit = { keys, fit };
  } catch (err) {
    if (!(err instanceof FitError) || !prevState.lastFit || prevState.lastFit.keys.join() !== keys.join()) throw err;
    fitError = err.message;
    fit = prevState.lastFit.fit; // keep the last good fit
  }

  // baseline model: intercept + time of day + weekend
  const bKeys = BASELINE_MODEL_KEYS;
  const bRows = trainingRows(history, bKeys, now, ds.settings.recencyHalfLifeDays);
  const baselineFit = fitLogistic(bRows, buildPrior(bKeys, ds.child, nAwake), 1);

  // 4. insights
  const insights: InsightRow[] = [];
  for (const def of FEATURE_REGISTRY) {
    if (!def.isTrigger) continue;
    const j = keys.indexOf(def.key);
    let row: InsightRow;
    if (j < 0) {
      row = { key: def.key, status: 'hidden', rawStatus: 'hidden', unit: def.unit, sentence: '', beta: 0, sd: 0,
        or: 1, orLo: 1, orHi: 1, pHarm: 0.5, confidence: 0, exposed: 0, exposedPos: 0, unexposed: 0, unexposedPos: 0 };
    } else {
      const eff = effectSummary(fit, j, def.unit, fit.tau * prior.sd[j]);
      const exp = exposureCounts(rows, j, def.signed);
      const raw = classifyStatus({ ...eff, ...exp, enabled: true, labeledDays });
      row = { key: def.key, status: raw, rawStatus: raw, unit: def.unit, sentence: effectSentence(def.key, def.unit, eff.or, lang),
        beta: fit.beta[j], sd: Math.sqrt(fit.cov[j][j]), ...eff, ...exp };
    }
    const h = applyHysteresis(state.statusHistory[def.key], row.rawStatus, today);
    if (!opts.dryRun) state.statusHistory[def.key] = h;
    row.status = h.displayed;
    insights.push(row);
  }
  const statuses = Object.fromEntries(insights.map((r) => [r.key, r.status]));

  // 5. p0_child: mean stored day-ahead p over the last 28 days (needs >= 7 days), else prior base rate
  let p0Child = childBaseRate(ds.child, nAwake);
  const recent = (opts.dayAheadHistory ?? []).filter((d) => d.blockStart >= now - 28 * DAY_MS && d.blockStart < now);
  if (new Set(recent.map((d) => localDateOf(d.blockStart, tz))).size >= 7) p0Child = recent.reduce((a, d) => a + d.p, 0) / recent.length;

  // 6. forecasts
  const dates = opts.forecastDates ?? [today, addDays(today, 1)];
  const forecasts: ForecastRow[] = [];
  for (const date of dates) for (const b of awakeBlocksBetween(date, date, ds.child)) {
    if (b.end <= now) continue;
    const fr = computeFeatures(idx, b, { mode: 'forecast', now });
    const x = toVector(fr.values, keys);
    const pr = predict(fit, x);
    const pb = predict(baselineFit, toVector(fr.values, bKeys)).p;
    const rs = buildReasons({ keys, contributions: contributions(fit, x), statuses, estimated: fr.estimated, params: fr.params, lang });
    forecasts.push({
      block: b, p: pr.p, pLo: pr.pLo, pHi: pr.pHi, pBaseline: pb,
      level: displayLevel(pr.p, p0Child, ds.settings.sensitivity, learning, ds.settings.earlyAlertsEnabled),
      timesUsual: pb > 0 ? pr.p / pb : 1, reasons: rs.raising, protective: rs.protective, estimated: fr.estimated, values: fr.values,
    });
  }

  // 7. time-of-day pattern (observed rate per block index, Beta(1+k, 1+n-k) interval)
  const blockByStart = new Map<number, Block>();
  for (const b of awakeBlocksBetween(history[0]?.localDate ?? today, today, ds.child)) blockByStart.set(b.start, b);
  const timeOfDay = timeOfDayRows(
    history.flatMap((h) => { const k = blockByStart.get(h.start)?.index; return k == null ? [] : [{ index: k, label: h.label }]; }),
    awakeIndices(ds.child));

  // 8. worth watching
  let ww: { items: WatchItem[]; tested: number } = { items: [], tested: 0 };
  if (!opts.skipWorthWatching) {
    const evalBlocks = history.filter((h) => h.label === 'positive' || h.label === 'negative_confirmed').map((h) => {
      const b = blockByStart.get(h.start) as Block;
      return { ...b, y: (h.label === 'positive' ? 1 : 0) as 0 | 1 };
    });
    ww = worthWatching(idx, evalBlocks);
  }

  return {
    now, keys, enabled, fit, baselineFit, prior, labeledDays, labeledBlocks, positives, learning, p0Child,
    insights, forecasts, worthWatching: ww.items, worthWatchingTested: ww.tested, timeOfDay, history,
    state: opts.dryRun ? prevState : state, fitError,
  };
}

/**
 * Observed hard-moment rate per block of the day (Insights "time-of-day pattern", report chart 4), with an 80% interval
 * from the Beta(1 + k, 1 + n - k) posterior. Only blocks labeled a hard moment or calm count.
 */
export function timeOfDayRows(blocks: { index: number; label: LabelStatus }[], indices: number[]): TimeOfDayRow[] {
  const byIndex = new Map<number, { n: number; k: number }>();
  for (const b of blocks) {
    if (b.label !== 'positive' && b.label !== 'negative_confirmed') continue;
    const c = byIndex.get(b.index) ?? { n: 0, k: 0 };
    c.n++; if (b.label === 'positive') c.k++;
    byIndex.set(b.index, c);
  }
  return indices.map((k) => {
    const c = byIndex.get(k) ?? { n: 0, k: 0 };
    const post = betaPosterior(c.k, c.n - c.k, hash32(`tod${k}`), 2000);
    return { index: k, n: c.n, k: c.k, rate: c.n ? c.k / c.n : 0, lo80: post.lo80, hi80: post.hi80 };
  });
}

/** Human-readable name of a feature. */
export function featureLabel(key: string, lang: Lang = 'en'): string {
  return FEATURE_COPY[key]?.label[lang] ?? key;
}
