/** Calming strategies and their uses (SPEC 10.2, 17; defaults from Appendix B.1). */
import { DEFAULT_STRATEGIES, type Lang } from '@emolens/shared';
import { all, one, type Executor } from '../types';
import type { StrategyCategory, StrategyOutcome, StrategyRow, StrategyUseRow } from '../rows';
import { around, type Repo, type Writer } from './writer';

/** Adds the 17 default strategies in the chosen language, marking the onboarding favorites. */
export async function seedDefaultStrategies(w: Writer, childId: string, lang: Lang, favoriteIndexes: number[] = []): Promise<void> {
  for (const [i, s] of DEFAULT_STRATEGIES.entries()) {
    await w.insert('strategies', {
      child_id: childId, name: s.name[lang], category: s.category, is_default: 1, active: 1,
      onboarding_favorite: favoriteIndexes.includes(i) ? 1 : 0,
    });
  }
}

export function listStrategies(ex: Executor, childId: string): Promise<StrategyRow[]> {
  return all<StrategyRow>(ex, 'SELECT * FROM strategies WHERE child_id = ? AND deleted_at IS NULL AND active = 1 ORDER BY onboarding_favorite DESC, is_default ASC, name', [childId]);
}

export function addStrategy(repo: Repo, childId: string, name: string, category: StrategyCategory = 'other', favorite = false): Promise<string> {
  return repo.write((w) => w.insert('strategies', {
    child_id: childId, name: name.trim(), category, is_default: 0, active: 1, onboarding_favorite: favorite ? 1 : 0,
  }));
}

export function setFavorite(repo: Repo, id: string, favorite: boolean): Promise<void> {
  return repo.write((w) => w.update('strategies', id, { onboarding_favorite: favorite ? 1 : 0 }));
}

/**
 * "We're trying this" (SPEC 10.2): a proactive use whose outcome is resolved later (averted / not averted)
 * by the recompute job in Phase 5, so it starts as 'pending'.
 */
export function logProactiveUse(repo: Repo, childId: string, strategyId: string, usedAt: string, alertId: string | null = null): Promise<string> {
  return repo.write((w) => w.insert('strategy_uses', {
    child_id: childId, strategy_id: strategyId, context: 'proactive', episode_id: null, alert_id: alertId, outcome: 'pending', used_at: usedAt,
  }, [around(childId, usedAt)]));
}

export function updateUse(repo: Repo, childId: string, id: string, strategyId: string, usedAt: string, outcome?: StrategyOutcome): Promise<void> {
  return repo.write((w) => w.update('strategy_uses', id, { strategy_id: strategyId, used_at: usedAt, ...(outcome ? { outcome } : {}) }, [around(childId, usedAt)]));
}

/** Top favorites for the Today card: "You said this helps" (SPEC 17 fills with onboarding favorites). */
export function favoriteStrategies(ex: Executor, childId: string, limit = 2): Promise<StrategyRow[]> {
  return all<StrategyRow>(ex, 'SELECT * FROM strategies WHERE child_id = ? AND deleted_at IS NULL AND active = 1 AND onboarding_favorite = 1 ORDER BY name LIMIT ?', [childId, limit]);
}

export const getUse = (ex: Executor, id: string) => one<StrategyUseRow>(ex, 'SELECT * FROM strategy_uses WHERE id = ?', [id]);

/** Strategies screen (SPEC 9.6): rename, or archive (hidden from pickers; its history keeps counting). */
export function renameStrategy(repo: Repo, id: string, name: string): Promise<void> {
  return repo.write((w) => w.update('strategies', id, { name: name.trim() }));
}
export function archiveStrategy(repo: Repo, id: string): Promise<void> {
  return repo.write((w) => w.update('strategies', id, { active: 0 }));
}
