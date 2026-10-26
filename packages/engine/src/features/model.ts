/** Priors (spec 13.3) and training-row assembly. */
import { FEATURE_BY_KEY, SUSPECTED_PRIOR_NUDGE, type ChildProfile, type LabelStatus } from '@emolens/shared';
import type { Prior, TrainingRow } from '../logistic';
import { clamp, logit } from '../stats';
import type { FeatureValues } from './build';
import { labelWeight } from './labels';

/** p0 = clamp(episodes_per_week / (7 * awake blocks per day), 0.005, 0.5). */
export function childBaseRate(child: ChildProfile, awakeBlocksPerDay: number): number {
  return clamp(child.episodesPerWeekEstimate / (7 * awakeBlocksPerDay), 0.005, 0.5);
}

export function buildPrior(keys: string[], child: ChildProfile, awakeBlocksPerDay: number): Prior {
  const suspected = new Set(child.suspectedFeatures);
  return {
    mean: keys.map((k) => (k === 'intercept'
      ? logit(childBaseRate(child, awakeBlocksPerDay))
      : FEATURE_BY_KEY[k].priorMean + (suspected.has(k) ? SUSPECTED_PRIOR_NUDGE : 0))),
    sd: keys.map((k) => FEATURE_BY_KEY[k].priorSd),
    scaled: keys.map((k) => FEATURE_BY_KEY[k].isTrigger),
  };
}

export interface LabeledBlock { start: number; localDate: string; label: LabelStatus; values: FeatureValues; }

export function toVector(values: FeatureValues, keys: string[]): number[] { return keys.map((k) => values[k] ?? 0); }

export function trainingRows(blocks: LabeledBlock[], keys: string[], now: number, halfLifeDays: number): TrainingRow[] {
  const rows: TrainingRow[] = [];
  for (const b of blocks) {
    const w = labelWeight(b.label, b.start, now, halfLifeDays);
    if (w <= 0) continue;
    rows.push({ x: toVector(b.values, keys), y: b.label === 'positive' ? 1 : 0, w });
  }
  return rows;
}

/** Distinct local dates with >= 1 positive or negative_confirmed block, and positive count. */
export function labeledStats(blocks: LabeledBlock[]): { labeledDays: number; positives: number; labeledBlocks: number } {
  const days = new Set<string>();
  let positives = 0, labeledBlocks = 0;
  for (const b of blocks) {
    if (b.label === 'positive' || b.label === 'negative_confirmed') { days.add(b.localDate); labeledBlocks++; }
    if (b.label === 'positive') positives++;
  }
  return { labeledDays: days.size, positives, labeledBlocks };
}
