/**
 * Screen hooks for engine results. They read what the last run saved (never run the engine themselves), and re-read
 * whenever data changes (`dataVersion`), e.g. after a forecast run finishes.
 */
import { mulberry32, strategyStats, suggestStrategies, type StrategyStat, type Suggestion } from '@emolens/engine';
import type { Strategy, StrategyUse } from '@emolens/shared';
import { all, type Executor } from '../db/types';
import { ms } from '../db/time';
import type { StrategyRow, StrategyUseRow } from '../db/rows';
import { useDbQuery } from '../lib/useDbQuery';
import { useReady } from '../store/session';
import { readSnapshot, type ForecastSnapshot } from './snapshot';

export function useSnapshot(): { snap: ForecastSnapshot | null; loading: boolean } {
  const { repo, profile } = useReady();
  const { data, loading } = useDbQuery(() => readSnapshot(repo.db, profile.id), [profile.id], null);
  return { snap: data, loading };
}

export interface StrategyView {
  rows: StrategyRow[];
  strategies: Strategy[];
  uses: StrategyUse[];
  stats: StrategyStat[];
}

/** Every strategy (active or archived) with its Beta-posterior statistics per context (SPEC 17, engine math). */
export async function loadStrategyView(ex: Executor, childId: string): Promise<StrategyView> {
  const rows = await all<StrategyRow>(ex, 'SELECT * FROM strategies WHERE child_id = ? AND deleted_at IS NULL ORDER BY name', [childId]);
  const useRows = await all<StrategyUseRow>(ex, 'SELECT * FROM strategy_uses WHERE child_id = ? AND deleted_at IS NULL', [childId]);
  const strategies: Strategy[] = rows.map((r) => ({ id: r.id, name: r.name, category: r.category, active: !!r.active, onboardingFavorite: !!r.onboarding_favorite }));
  const uses: StrategyUse[] = useRows.map((u) => ({ id: u.id, strategyId: u.strategy_id, context: u.context, outcome: u.outcome, usedAt: ms(u.used_at), episodeId: u.episode_id, alertId: u.alert_id }));
  return { rows, strategies, uses, stats: strategyStats(strategies, uses) };
}

export interface Idea { row: StrategyRow; suggestion: Suggestion; }

/**
 * "Ideas that have helped" (SPEC 17): proven strategies first, filled with onboarding favorites; in discovery mode,
 * Thompson sampling (seeded per hour, so the list doesn't jump around on every screen refresh).
 */
export function ideasFrom(view: StrategyView, discovery: boolean, now: number): Idea[] {
  const rng = mulberry32(Math.floor(now / 3_600_000));
  return suggestStrategies(view.strategies, view.stats, 'proactive', discovery, rng)
    .map((s) => ({ row: view.rows.find((r) => r.id === s.strategyId) as StrategyRow, suggestion: s }))
    .filter((i) => i.row);
}

export function useStrategyView(): StrategyView | null {
  const { repo, profile } = useReady();
  return useDbQuery(() => loadStrategyView(repo.db, profile.id), [profile.id], null).data;
}
