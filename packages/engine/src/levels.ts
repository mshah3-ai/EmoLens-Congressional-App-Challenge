/** Risk levels (spec 13.9). */
import { LEARNING_PERIOD_DAYS, type RiskLevel, type Sensitivity } from '@emolens/shared';

const THRESHOLDS: Record<Sensitivity, { high: [number, number]; moderate: [number, number] }> = {
  fewer: { high: [2.5, 0.15], moderate: [1.4, 0.07] },
  balanced: { high: [2.0, 0.12], moderate: [1.3, 0.06] },
  more: { high: [1.5, 0.10], moderate: [1.2, 0.05] },
};

export function riskLevel(p: number, p0Child: number, sensitivity: Sensitivity): Exclude<RiskLevel, 'learning'> {
  const t = THRESHOLDS[sensitivity];
  if (p >= Math.max(t.high[0] * p0Child, t.high[1])) return 'high';
  if (p >= Math.max(t.moderate[0] * p0Child, t.moderate[1])) return 'moderate';
  return 'low';
}

/** Learning period: labeled_days < 14 OR positive labeled blocks < 3. */
export function isLearningPeriod(labeledDays: number, positives: number): boolean {
  return labeledDays < LEARNING_PERIOD_DAYS || positives < 3;
}

export function displayLevel(p: number, p0Child: number, sensitivity: Sensitivity, learning: boolean, earlyAlerts: boolean): RiskLevel {
  if (learning && !earlyAlerts) return 'learning';
  return riskLevel(p, p0Child, sensitivity);
}
