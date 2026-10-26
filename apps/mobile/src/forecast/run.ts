/**
 * One forecast run on the phone (SPEC 13.10): load the data -> recompute blocks -> run the ENGINE (fit, patterns,
 * forecasts) -> save what the screens and Model Health need:
 *  - `model_fits`: the fit (one kept per local day, plus today's newest), used for "how the estimate changed";
 *  - `predictions`: the calibration snapshot rule (the first forecast made at/after 18:00 the day before a block is its
 *    one `day_ahead` prediction, never overwritten) and the latest `in_block` forecast for the next block;
 *  - `block_features` (forecast mode) for upcoming blocks;
 *  - `engine_snapshots`: the result for the screens + the engine's state for next time;
 *  - settings `insight_status_history` (SPEC 14.3 hysteresis).
 * Nothing here decides anything about the child: every number comes from `runEngine`.
 */
import { DAY_MS, FEATURE_BY_KEY, FEATURE_VERSION, type ChildProfile } from '@emolens/shared';
import {
  addDays, dayAheadSnapshotDue, emptyEngineState, localDateOf, rangeSentence, runEngine, zonedToUtc,
  type EngineResult, type EngineState,
} from '@emolens/engine';
import { all, one } from '../db/types';
import { iso, ms, newId } from '../db/time';
import { recordError, safeMessage } from '../db/repo/errors';
import { getAllSettings, setSetting, type Settings } from '../db/repo/settings';
import type { Repo } from '../db/repo/writer';
import { loadDataset } from './dataset';
import { featureFingerprint, recompute, type RecomputeResult } from './recompute';
import { readSnapshot, type ForecastSnapshot, type SnapReason } from './snapshot';

/** Worth watching (4,000 draws per item) is slower, so it is refreshed at most this often (or when asked). */
const WORTH_WATCHING_EVERY_MS = 6 * 3_600_000;

/** `fingerprint` null = unknown (the demo builder saves the simulated engine state before any blocks exist). */
interface StoredState { engine: Omit<EngineState, 'statusHistory'>; fingerprint: string | null; }

export interface ForecastRun {
  snapshot: ForecastSnapshot;
  result: EngineResult | null;
  recompute: RecomputeResult | null;
  settings: Settings;
}

export interface RunOptions { now?: number; forceWorthWatching?: boolean; clock?: () => number; }

async function loadState(repo: Repo, childId: string): Promise<StoredState | null> {
  const r = await one<{ state_json: string }>(repo.db, 'SELECT state_json FROM engine_snapshots WHERE child_id = ?', [childId]);
  if (!r) return null;
  try { return JSON.parse(r.state_json) as StoredState; } catch { return null; }
}

const reason = (r: { key: string; text: string; estimated: boolean; contribution: number }): SnapReason =>
  ({ key: r.key, text: r.text, estimated: r.estimated, contribution: r.contribution });

export async function runForecast(repo: Repo, profile: ChildProfile, opts: RunOptions = {}): Promise<ForecastRun> {
  const now = opts.now ?? Date.now();
  const clock = opts.clock ?? (() => Date.now());
  const settings = await getAllSettings(repo.db);
  const childId = profile.id;
  const previous = await readSnapshot(repo.db, childId);
  const stored = await loadState(repo, childId);

  const ds = await loadDataset(repo.db, profile, settings, now);
  const fingerprint = featureFingerprint(ds);
  const fingerprintChanged = stored?.fingerprint != null && stored.fingerprint !== fingerprint;
  const t0 = clock();
  let rc: RecomputeResult;
  let res: EngineResult;
  try {
    rc = await recompute(repo, ds, now, fingerprintChanged);
    const dayAhead = await all<{ block_start: string; p: number }>(repo.db,
      "SELECT block_start, p FROM predictions WHERE child_id = ? AND kind = 'day_ahead' AND block_start >= ?", [childId, iso(now - 28 * DAY_MS)]);
    const state: EngineState = { ...emptyEngineState(), ...(stored?.engine ?? {}), statusHistory: settings.insight_status_history };
    // A saved fit is only reusable with the same feature list; after a fingerprint change start fresh.
    if (fingerprintChanged) state.lastFit = null;
    const doWorth = opts.forceWorthWatching || !previous?.worthWatchingAt || now - previous.worthWatchingAt >= WORTH_WATCHING_EVERY_MS
      || previous.lang !== settings.language;
    res = runEngine(ds, now, {
      lang: settings.language, state, featureCache: rc.cache, skipWorthWatching: !doWorth,
      dayAheadHistory: dayAhead.map((d) => ({ blockStart: ms(d.block_start), p: d.p })),
    });
    const engineMs = clock() - t0;

    const snapshot: ForecastSnapshot = {
      version: 1, computedAt: now, lang: settings.language, fitError: res.fitError,
      learning: res.learning, labeledDays: res.labeledDays, labeledBlocks: res.labeledBlocks, positives: res.positives,
      p0Child: res.p0Child, tau: res.fit.tau, converged: res.fit.converged, modelFitId: null, enabled: res.enabled,
      forecasts: res.forecasts.map((f) => ({
        start: f.block.start, end: f.block.end, localDate: f.block.localDate, index: f.block.index,
        p: f.p, pLo: f.pLo, pHi: f.pHi, pBaseline: f.pBaseline, level: f.level, timesUsual: f.timesUsual,
        reasons: f.reasons.map(reason), protective: f.protective ? reason(f.protective) : null, estimated: f.estimated,
      })),
      insights: res.insights.map((r) => ({
        key: r.key, status: r.status, rawStatus: r.rawStatus, requires: FEATURE_BY_KEY[r.key].requires,
        sentence: r.sentence, range: r.status === 'hidden' ? '' : rangeSentence(r.orLo, r.orHi, settings.language), unit: r.unit,
        or: r.or, orLo: r.orLo, orHi: r.orHi, pHarm: r.pHarm, confidence: r.confidence,
        exposed: r.exposed, exposedPos: r.exposedPos, unexposed: r.unexposed, unexposedPos: r.unexposedPos,
      })),
      timeOfDay: res.timeOfDay,
      worthWatching: doWorth ? res.worthWatching : previous?.worthWatching ?? [],
      worthWatchingTested: doWorth ? res.worthWatchingTested : previous?.worthWatchingTested ?? 0,
      worthWatchingAt: doWorth ? now : previous?.worthWatchingAt ?? null,
      engineMs,
    };
    snapshot.modelFitId = await persist(repo, profile, res, snapshot, { engine: withoutHistory(res.state), fingerprint }, now);
    return { snapshot, result: res, recompute: rc, settings };
  } catch (e) {
    // SPEC 29: keep the last good forecast, show "Forecast temporarily unavailable", record the error (no personal data).
    await recordError(repo.db, 'engine', e);
    const snapshot: ForecastSnapshot = previous
      ? { ...previous, fitError: safeMessage(e) }
      : emptySnapshot(now, settings, safeMessage(e));
    await repo.db.execute(
      `INSERT INTO engine_snapshots (child_id, computed_at, result_json, state_json) VALUES (?, ?, ?, ?)
       ON CONFLICT(child_id) DO UPDATE SET result_json = excluded.result_json`,
      [childId, iso(now), JSON.stringify(snapshot), JSON.stringify(stored ?? { engine: withoutHistory(emptyEngineState()), fingerprint })]);
    return { snapshot, result: null, recompute: null, settings };
  }
}

function withoutHistory(s: EngineState): Omit<EngineState, 'statusHistory'> {
  return { tau: s.tau, tauSelectedAt: s.tauSelectedAt, tauLabeledBlocks: s.tauLabeledBlocks, lastFit: s.lastFit };
}

function emptySnapshot(now: number, settings: Settings, fitError: string): ForecastSnapshot {
  return {
    version: 1, computedAt: now, lang: settings.language, fitError, learning: true, labeledDays: 0, labeledBlocks: 0, positives: 0,
    p0Child: 0, tau: 1, converged: false, modelFitId: null, enabled: {} as ForecastSnapshot['enabled'], forecasts: [], insights: [],
    timeOfDay: [], worthWatching: [], worthWatchingTested: 0, worthWatchingAt: null, engineMs: 0,
  };
}

/** Saves one run in a single transaction. Returns the id of the model fit the predictions came from. */
async function persist(repo: Repo, profile: ChildProfile, res: EngineResult, snapshot: ForecastSnapshot, state: StoredState, now: number): Promise<string> {
  const childId = profile.id;
  const tz = profile.homeTz;
  const today = localDateOf(now, tz);
  const madeAt = iso(now);
  return repo.write(async (w) => {
    const ex = w.ex;
    // model fit: a reused fit (fitError) is not stored again
    let fitId: string;
    const latest = await one<{ id: string }>(ex, 'SELECT id FROM model_fits WHERE child_id = ? ORDER BY fitted_at DESC LIMIT 1', [childId]);
    if (res.fitError && latest) {
      fitId = latest.id;
    } else {
      fitId = newId();
      const dayStart = iso(zonedToUtc(today, 0, tz)), dayEnd = iso(zonedToUtc(addDays(today, 1), 0, tz));
      // keep one fit per local day: today's newest replaces today's earlier ones (predictions keep their old id as a label)
      await ex.execute('DELETE FROM model_fits WHERE child_id = ? AND fitted_at >= ? AND fitted_at < ?', [childId, dayStart, dayEnd]);
      await ex.execute(
        `INSERT INTO model_fits (id, child_id, fitted_at, feature_keys, prior_mean, prior_sd, beta, cov, feature_means, tau, log_marginal,
         n_blocks, n_positive, labeled_days, converged, iterations) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [fitId, childId, madeAt, JSON.stringify(res.keys), JSON.stringify(res.prior.mean), JSON.stringify(res.prior.sd), JSON.stringify(res.fit.beta),
          JSON.stringify(res.fit.cov), JSON.stringify(res.fit.featureMeans), res.fit.tau, finite(res.fit.logMarginal),
          res.labeledBlocks, res.positives, res.labeledDays, res.fit.converged ? 1 : 0, res.fit.iterations]);
    }

    // predictions (SPEC 13.10)
    const haveDayAhead = new Set((await all<{ block_start: string }>(ex,
      "SELECT block_start FROM predictions WHERE child_id = ? AND kind = 'day_ahead' AND block_start >= ?", [childId, iso(now)])).map((r) => r.block_start));
    const next = res.forecasts.find((f) => f.block.start > now);
    for (const f of res.forecasts) {
      const start = iso(f.block.start);
      const values = [f.p, f.pLo, f.pHi, f.pBaseline, f.level, JSON.stringify({ raising: f.reasons.map(reason), protective: f.protective ? reason(f.protective) : null }), fitId];
      if (dayAheadSnapshotDue(f.block.start, now, tz) && !haveDayAhead.has(start)) {
        await ex.execute(`INSERT INTO predictions (id, child_id, block_start, made_at, kind, p, p_lo, p_hi, p_baseline, level, reasons_json, model_fit_id)
          VALUES (?, ?, ?, ?, 'day_ahead', ?, ?, ?, ?, ?, ?, ?)`, [newId(), childId, start, madeAt, ...values]);
      }
      if (next && f.block.start === next.block.start) {
        await ex.execute("DELETE FROM predictions WHERE child_id = ? AND block_start = ? AND kind = 'in_block'", [childId, start]);
        await ex.execute(`INSERT INTO predictions (id, child_id, block_start, made_at, kind, p, p_lo, p_hi, p_baseline, level, reasons_json, model_fit_id)
          VALUES (?, ?, ?, ?, 'in_block', ?, ?, ?, ?, ?, ?, ?)`, [newId(), childId, start, madeAt, ...values]);
      }
      await ex.execute(
        `INSERT INTO block_features (child_id, block_start, feature_version, mode, values_json, estimated_json, computed_at) VALUES (?, ?, ?, 'forecast', ?, ?, ?)
         ON CONFLICT(child_id, block_start, mode) DO UPDATE SET feature_version = excluded.feature_version, values_json = excluded.values_json,
         estimated_json = excluded.estimated_json, computed_at = excluded.computed_at`,
        [childId, start, FEATURE_VERSION, JSON.stringify(f.values), JSON.stringify(f.estimated), madeAt]);
    }

    snapshot.modelFitId = fitId;
    await ex.execute(
      `INSERT INTO engine_snapshots (child_id, computed_at, result_json, state_json) VALUES (?, ?, ?, ?)
       ON CONFLICT(child_id) DO UPDATE SET computed_at = excluded.computed_at, result_json = excluded.result_json, state_json = excluded.state_json`,
      [childId, madeAt, JSON.stringify(snapshot), JSON.stringify(state)]);
    await setSetting(ex, 'insight_status_history', res.state.statusHistory);
    return fitId;
  });
}

/** SQLite REAL columns cannot hold NaN/Infinity. */
const finite = (x: number) => (Number.isFinite(x) ? x : 0);
