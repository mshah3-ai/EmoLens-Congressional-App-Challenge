/**
 * Ask EmoLens tools that read what the engine computed (SPEC Appendix A.2): patterns, "worth watching" items, the
 * forecast, strategy statistics and model health. They reuse the engine's saved results (the same numbers the
 * Insights screens show), so the AI can only repeat the app's own statuses and confidence values, never invent them.
 */
import { featureLabel } from '@emolens/engine';
import { all } from '../../db/types';
import { parseJson } from '../../db/rows';
import { readSnapshot } from '../../forecast/snapshot';
import { loadHealth } from '../../forecast/health';
import { loadStrategyView } from '../../forecast/useForecast';
import { dateArg, localDay, localStamp, round, type ToolEnv, type ToolOutput } from './common';

type In = Record<string, unknown>;
const none = (result: unknown): ToolOutput => ({ result, refs: [] });
const NO_MODEL = { available: false, note: 'No forecast model yet: patterns appear after about 2 weeks of logging.' };

export async function getPatterns(_input: In, env: ToolEnv): Promise<ToolOutput> {
  const snap = await readSnapshot(env.repo.db, env.profile.id);
  if (!snap) return none(NO_MODEL);
  const rows = snap.insights.filter((i) => i.status !== 'hidden').map((i) => ({
    feature: featureLabel(i.key, 'en'), key: i.key, status: i.status, confidence_0_100: Math.round(i.confidence),
    odds_ratio: round(i.or), odds_ratio_80pct_range: [round(i.orLo), round(i.orHi)], summary: i.sentence,
    evidence: { blocks_with_factor: i.exposed, hard_moments_with_factor: i.exposedPos, blocks_without: i.unexposed, hard_moments_without: i.unexposedPos },
  }));
  return none({ computed_at: localStamp(snap.computedAt, env.profile.homeTz), learning: snap.learning, labeled_days: snap.labeledDays, patterns: rows,
    statuses_explained: 'strong/likely/possible = more hard moments when present (with that much evidence); protective = fewer; not_enough_data / no_link otherwise' });
}

export async function getWorthWatching(_input: In, env: ToolEnv): Promise<ToolOutput> {
  const snap = await readSnapshot(env.repo.db, env.profile.id);
  if (!snap) return none(NO_MODEL);
  return none({
    items: snap.worthWatching.filter((w) => w.shown).map((w) => ({
      kind: w.kind, item: w.label, times_present: w.nExposed, hard_moments_when_present: w.kExposed,
      chance_linked_to_more_hard_moments: round(w.pAbove), rate_ratio_median: round(w.median), rate_ratio_80pct_range: [round(w.lo80), round(w.hi80)],
    })),
    tested: snap.worthWatchingTested,
  });
}

export async function getForecast(input: In, env: ToolEnv): Promise<ToolOutput> {
  const date = dateArg(input, 'date')!;
  const tz = env.profile.homeTz;
  const snap = await readSnapshot(env.repo.db, env.profile.id);
  const live = (snap?.forecasts ?? []).filter((f) => f.localDate === date);
  if (live.length > 0) {
    return none({ date: localDay(date), learning: snap!.learning, blocks: live.map((f) => ({
      from: localStamp(f.start, tz), to: localStamp(f.end, tz), level: f.level, chance: round(f.p), times_usual: round(f.timesUsual, 1),
      reasons: f.reasons.map((r) => r.text), protective: f.protective?.text ?? null,
    })) });
  }
  // a past day: the forecasts made the day before (if any), with what actually happened in each block
  const rows = await all<{ block_start: string; p: number; level: string; reasons_json: string; label_status: string | null }>(env.repo.db,
    `SELECT p.block_start, p.p, p.level, p.reasons_json, b.label_status FROM predictions p
     LEFT JOIN blocks b ON b.child_id = p.child_id AND b.block_start = p.block_start
     WHERE p.child_id = ? AND p.kind = 'day_ahead' AND b.local_date = ? ORDER BY p.block_start`, [env.profile.id, date]);
  if (rows.length === 0) return none({ date: localDay(date), available: false, note: 'Forecasts exist only for today, tomorrow and past days the app forecast.' });
  return none({ date: localDay(date), blocks: rows.map((r) => {
    const reasons = parseJson<{ raising?: { text?: string }[] }>(r.reasons_json, {});
    return { from: localStamp(r.block_start, tz), level: r.level, chance: round(r.p), reasons: (reasons.raising ?? []).map((x) => x.text).filter(Boolean),
      what_happened: r.label_status === 'positive' ? 'hard moment' : r.label_status === 'negative_confirmed' ? 'calm' : r.label_status === 'intervened' ? 'stepped in' : 'unknown' };
  }) });
}

export async function getStrategyStats(input: In, env: ToolEnv): Promise<ToolOutput> {
  const context = input.context === 'proactive' || input.context === 'during' ? input.context : 'both';
  const view = await loadStrategyView(env.repo.db, env.profile.id);
  const names = new Map(view.rows.map((r) => [r.id, r.name]));
  const rows = view.stats.filter((s) => s.uses > 0 && (context === 'both' || s.context === context)).map((s) => ({
    strategy: names.get(s.strategyId) ?? '', context: s.context, times_used: s.uses,
    success_estimate: round(s.mean), success_80pct_range: [round(s.lo80), round(s.hi80)], last_used: localStamp(s.lastUsed, env.profile.homeTz),
  }));
  return none({ rows, note: 'success = "helped" during a hard moment, or "averted" when used ahead of time' });
}

export async function getModelHealth(_input: In, env: ToolEnv): Promise<ToolOutput> {
  const h = await loadHealth(env.repo.db, env.profile.id, env.now);
  const m = h.health.last28;
  if (!m.enough) return none({ available: false, evaluable_predictions: m.n, note: 'Model health appears after about 3 weeks of logging (20 checked forecasts).' });
  const a = h.alerts.last28;
  return none({
    last_28_days: {
      checked_forecasts: m.n, skill_score: round(m.skill), brier_score: round(m.brier, 3), brier_baseline: round(m.brierBaseline, 3), auroc: round(m.auroc),
      calibration: m.reliability.filter((b) => b.n > 0).map((b) => ({ predicted: round(b.meanP), observed: round(b.rate), n: b.n })),
    },
    alerts_last_28_days: { delivered: a.delivered, happened: a.happened, stepped_in: a.steppedIn, calm: a.calm, hit_rate: round(a.hitRate) },
  });
}
