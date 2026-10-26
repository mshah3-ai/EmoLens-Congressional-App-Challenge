/** Block labels (spec 12.2), evaluated in priority order, and training weights. */
import { DAY_MS, type Block, type ChildDataset, type LabelStatus } from '@emolens/shared';
import { isQualifyingEpisode } from './build';

/**
 * 'emolens' = spec rules. 'naive' = treats "we stepped in" as a calm block, which the simulator
 * uses to demonstrate the intervention trap (spec 26.1).
 */
export type LabelPolicy = 'emolens' | 'naive';

export interface LabelIndex {
  episodeTimes: number[];
  responseByBlock: Map<number, string>;   // latest alert response per block start
  closures: Map<string, { allLogged: boolean; closedAt: number }>;
}

export function buildLabelIndex(ds: ChildDataset): LabelIndex {
  const alertBlock = new Map(ds.alerts.filter((a) => a.status !== 'cancelled').map((a) => [a.id, a.blockStart]));
  const responses = [...ds.alertResponses].sort((a, b) => a.respondedAt - b.respondedAt);
  const responseByBlock = new Map<number, string>();
  for (const r of responses) { const b = alertBlock.get(r.alertId); if (b != null) responseByBlock.set(b, r.response); }
  const closures = new Map<string, { allLogged: boolean; closedAt: number }>();
  for (const c of ds.dayClosures) {
    const prev = closures.get(c.localDate);
    if (!prev || c.closedAt > prev.closedAt) closures.set(c.localDate, { allLogged: c.allLogged, closedAt: c.closedAt });
  }
  return {
    episodeTimes: ds.episodes.filter((e) => isQualifyingEpisode(ds, e)).map((e) => e.startedAt).sort((a, b) => a - b),
    responseByBlock, closures,
  };
}

function anyIn(sorted: number[], a: number, b: number): boolean {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < a) lo = m + 1; else hi = m; }
  return lo < sorted.length && sorted[lo] < b;
}

export function labelBlock(li: LabelIndex, block: Block, policy: LabelPolicy = 'emolens', now = Infinity): LabelStatus {
  if (anyIn(li.episodeTimes, block.start, Math.min(block.end, now))) return 'positive';
  const resp = li.responseByBlock.get(block.start);
  if (resp === 'stepped_in') return policy === 'naive' ? 'negative_confirmed' : 'intervened';
  if (resp === 'calm') return 'negative_confirmed';
  const c = li.closures.get(block.localDate);
  if (c && c.allLogged && c.closedAt >= block.end && c.closedAt <= now) return 'negative_confirmed';
  return 'unknown';
}

/** w = 0.5^(age_days / H) for positive and negative_confirmed; 0 otherwise. */
export function labelWeight(status: LabelStatus, blockStart: number, now: number, halfLifeDays: number): number {
  if (status !== 'positive' && status !== 'negative_confirmed') return 0;
  const age = Math.max(0, (now - blockStart) / DAY_MS);
  return Math.pow(0.5, age / halfLifeDays);
}
