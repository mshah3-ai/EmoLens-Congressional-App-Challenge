/** Model Health (spec Section 18): evaluate stored day-ahead predictions against labels. */
import { MODEL_HEALTH_MIN_PREDICTIONS, RELIABILITY_EDGES } from '@emolens/shared';
import { auroc, brier, logLoss, reliabilityEdges, type ReliabilityBin } from './calibration';

export interface EvaluablePrediction { blockStart: number; p: number; pBaseline: number; y: 0 | 1; }
export interface HealthMetrics {
  n: number; positives: number; enough: boolean;
  brier: number; brierBaseline: number; skill: number; logLoss: number; auroc: number | null; reliability: ReliabilityBin[];
}

export function modelHealth(preds: EvaluablePrediction[]): HealthMetrics {
  const p = preds.map((x) => x.p), pb = preds.map((x) => x.pBaseline), y = preds.map((x) => x.y);
  const positives = y.reduce<number>((a, b) => a + b, 0);
  const b = brier(p, y), bb = brier(pb, y);
  return {
    n: preds.length, positives, enough: preds.length >= MODEL_HEALTH_MIN_PREDICTIONS,
    brier: b, brierBaseline: bb, skill: bb > 0 ? 1 - b / bb : NaN, logLoss: logLoss(p, y),
    auroc: positives >= 5 && preds.length - positives >= 5 ? auroc(p, y) : null,
    reliability: reliabilityEdges(p, y, RELIABILITY_EDGES),
  };
}
