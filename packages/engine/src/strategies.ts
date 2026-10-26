/** Strategy effectiveness (spec Section 17) and proactive outcome resolution (10.2). */
import { MINUTE_MS, type Strategy, type StrategyContext, type StrategyUse } from '@emolens/shared';
import { betaPosterior, thompsonRank, type BetaSummary } from './betabinomial';
import { hash32 } from './stats';

/** Proactive use: episode within 90 min after -> not_averted; else averted if its block is labeled. */
export function resolveProactiveOutcome(use: StrategyUse, episodeTimes: number[], blockLabeled: boolean, now: number): StrategyUse['outcome'] {
  if (use.context !== 'proactive' || use.outcome !== 'pending') return use.outcome;
  if (episodeTimes.some((t) => t >= use.usedAt && t <= use.usedAt + 90 * MINUTE_MS)) return 'not_averted';
  if (now < use.usedAt + 90 * MINUTE_MS || !blockLabeled) return 'pending';
  return 'averted';
}

export interface StrategyStat extends BetaSummary { strategyId: string; context: StrategyContext; uses: number; lastUsed: number | null; }

export function strategyStats(strategies: Strategy[], uses: StrategyUse[]): StrategyStat[] {
  const out: StrategyStat[] = [];
  for (const st of strategies) for (const context of ['proactive', 'during'] as StrategyContext[]) {
    const mine = uses.filter((u) => u.strategyId === st.id && u.context === context);
    const s = mine.filter((u) => u.outcome === (context === 'proactive' ? 'averted' : 'helped')).length;
    const f = mine.filter((u) => u.outcome === (context === 'proactive' ? 'not_averted' : 'not_helped')).length;
    const last = mine.reduce<number | null>((m, u) => (m == null || u.usedAt > m ? u.usedAt : m), null);
    out.push({ ...betaPosterior(s, f, hash32(`${st.id}|${context}`)), strategyId: st.id, context, uses: s + f, lastUsed: last });
  }
  return out;
}

export interface Suggestion { strategyId: string; kind: 'proven' | 'favorite' | 'new'; stat?: StrategyStat; }

/** "Ideas that have helped": >= 3 uses ranked by posterior mean, filled with onboarding favorites. */
export function suggestStrategies(strategies: Strategy[], stats: StrategyStat[], context: StrategyContext, discovery: boolean, rng: () => number): Suggestion[] {
  const active = strategies.filter((s) => s.active);
  const ctx = stats.filter((s) => s.context === context);
  if (discovery) {
    const order = thompsonRank(active.map((a) => { const st = ctx.find((c) => c.strategyId === a.id); return { id: a.id, s: st?.successes ?? 0, f: st?.failures ?? 0 }; }), rng);
    return order.slice(0, 2).map((id) => { const st = ctx.find((c) => c.strategyId === id); return { strategyId: id, kind: st && st.uses > 0 ? 'proven' : 'new', stat: st }; });
  }
  const proven = ctx.filter((c) => c.uses >= 3 && active.some((a) => a.id === c.strategyId)).sort((a, b) => b.mean - a.mean).slice(0, 2)
    .map((st): Suggestion => ({ strategyId: st.strategyId, kind: 'proven', stat: st }));
  for (const fav of active.filter((a) => a.onboardingFavorite)) {
    if (proven.length >= 2) break;
    if (!proven.some((p) => p.strategyId === fav.id)) proven.push({ strategyId: fav.id, kind: 'favorite' });
  }
  return proven;
}
