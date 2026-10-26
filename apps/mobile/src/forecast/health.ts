/**
 * Data for Model Health (SPEC 18) and the trigger "estimate over time" chart (SPEC 9.5). Reads the stored day-ahead
 * predictions, block labels, alerts and model fits; the metrics themselves are the engine's (healthFor, alertMetrics,
 * weeklyFits, effectHistory).
 */
import { DAY_MS, FEATURE_BY_KEY, type LabelStatus } from '@emolens/shared';
import {
  alertMetrics, effectHistory, healthFor, weeklyFits, type AlertMetrics, type EffectPoint, type FitPoint, type HealthMetrics,
} from '@emolens/engine';
import { all, type Executor } from '../db/types';
import { ms } from '../db/time';
import { parseJson } from '../db/rows';

export interface HealthData {
  health: { last28: HealthMetrics; allTime: HealthMetrics };
  alerts: { last28: AlertMetrics; allTime: AlertMetrics };
}

export async function loadHealth(ex: Executor, childId: string, now: number): Promise<HealthData> {
  const [preds, alerts, responses] = await Promise.all([
    all<{ block_start: string; p: number; p_baseline: number; label_status: LabelStatus | null }>(ex,
      `SELECT p.block_start, p.p, p.p_baseline, b.label_status FROM predictions p
       LEFT JOIN blocks b ON b.child_id = p.child_id AND b.block_start = p.block_start
       WHERE p.child_id = ? AND p.kind = 'day_ahead' AND p.block_start < ?`, [childId, new Date(now).toISOString()]),
    all<{ id: string; block_start: string; scheduled_for: string; status: 'scheduled' | 'delivered' | 'cancelled' | 'suppressed' }>(ex,
      'SELECT id, block_start, scheduled_for, status FROM alerts WHERE child_id = ? AND deleted_at IS NULL', [childId]),
    all<{ alert_id: string; response: 'happened' | 'stepped_in' | 'calm'; responded_at: string }>(ex,
      `SELECT r.alert_id, r.response, r.responded_at FROM alert_responses r JOIN alerts a ON a.id = r.alert_id
       WHERE a.child_id = ? AND r.deleted_at IS NULL`, [childId]),
  ]);
  const labels = new Map<number, LabelStatus>();
  for (const p of preds) if (p.label_status) labels.set(ms(p.block_start), p.label_status);
  const stored = preds.map((p) => ({ blockStart: ms(p.block_start), p: p.p, pBaseline: p.p_baseline }));
  const a = alerts.map((x) => ({ id: x.id, blockStart: ms(x.block_start), scheduledFor: ms(x.scheduled_for), status: x.status }));
  const r = responses.map((x) => ({ alertId: x.alert_id, response: x.response, respondedAt: ms(x.responded_at) }));
  return {
    health: healthFor(stored, labels, now),
    alerts: { last28: alertMetrics(a, r, now, now - 28 * DAY_MS, now), allTime: alertMetrics(a, r, now) },
  };
}

/** The effect of one feature per weekly fit. Reads only the fits it needs (a fit's covariance is large). */
export async function loadEffectHistory(ex: Executor, childId: string, key: string): Promise<EffectPoint[]> {
  const index = await all<{ id: string; fitted_at: string; feature_keys: string }>(ex,
    'SELECT id, fitted_at, feature_keys FROM model_fits WHERE child_id = ? ORDER BY fitted_at', [childId]);
  const withKey = index.filter((f) => parseJson<string[]>(f.feature_keys, []).includes(key));
  const picked = weeklyFits(withKey.map((f) => ({ at: ms(f.fitted_at), id: f.id })));
  if (!picked.length) return [];
  const rows = await all<{ id: string; fitted_at: string; feature_keys: string; prior_sd: string; beta: string; cov: string; tau: number }>(ex,
    `SELECT id, fitted_at, feature_keys, prior_sd, beta, cov, tau FROM model_fits WHERE id IN (${picked.map(() => '?').join(',')}) ORDER BY fitted_at`, picked.map((p) => p.id));
  const points: FitPoint[] = rows.map((f) => ({
    at: ms(f.fitted_at), keys: parseJson<string[]>(f.feature_keys, []), priorSd: parseJson<number[]>(f.prior_sd, []),
    fit: { beta: parseJson<number[]>(f.beta, []), cov: parseJson<number[][]>(f.cov, []), featureMeans: [], tau: f.tau, logMarginal: 0, converged: true, iterations: 0 },
  }));
  return effectHistory(points, key, FEATURE_BY_KEY[key]?.unit ?? 1);
}
