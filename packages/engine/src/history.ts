/**
 * Pure helpers the app needs around stored engine results (spec 13.10, 14, 15.5, 15.3, 18).
 * They live here, not in the app, so the app, the portal and the simulator all use the same rules.
 *  - dayAheadSnapshotDue: the calibration snapshot rule (13.10)
 *  - evaluablePredictions / healthFor / reliabilityHeadline: Model Health inputs (18)
 *  - alertMetrics: alert outcome counts and hit rate (15.5)
 *  - weeklyFits / effectHistory: "how the estimate changed over time" (trigger detail chart 2, 9.5)
 *  - dayOutlook: which blocks are higher-chance, for the morning outlook (15.3)
 */
import { DAY_MS, type AlertResponseKind, type LabelStatus, type RiskLevel } from '@emolens/shared';
import { modelHealth, type HealthMetrics } from './health';
import { effectSummary } from './insights';
import type { Fit } from './logistic';
import type { ReliabilityBin } from './calibration';
import { addDays, localDateOf, zonedToUtc } from './features/time';

/** Local hour after which the evening forecast for tomorrow counts as the "day-ahead" forecast. */
export const DAY_AHEAD_HOUR = 18;

/**
 * Spec 13.10: a block's one `day_ahead` prediction is the first forecast made at or after 18:00 local on the day
 * before the block (and before the block starts). Callers store it only if none exists yet (never overwritten).
 */
export function dayAheadSnapshotDue(blockStart: number, madeAt: number, tz: string): boolean {
  const eveBefore = zonedToUtc(addDays(localDateOf(blockStart, tz), -1), DAY_AHEAD_HOUR * 60, tz);
  return madeAt >= eveBefore && madeAt < blockStart;
}

export interface StoredPrediction { blockStart: number; p: number; pBaseline: number; }

/** Day-ahead predictions whose block is labeled positive or negative_confirmed (spec 18); others are left out. */
export function evaluablePredictions(preds: StoredPrediction[], labels: Map<number, LabelStatus>, from = -Infinity, to = Infinity) {
  const out: { blockStart: number; p: number; pBaseline: number; y: 0 | 1 }[] = [];
  for (const p of preds) {
    if (p.blockStart < from || p.blockStart >= to) continue;
    const l = labels.get(p.blockStart);
    if (l === 'positive' || l === 'negative_confirmed') out.push({ ...p, y: l === 'positive' ? 1 : 0 });
  }
  return out;
}

/** Model Health for the last 28 days and all time (spec 18). */
export function healthFor(preds: StoredPrediction[], labels: Map<number, LabelStatus>, now: number): { last28: HealthMetrics; allTime: HealthMetrics } {
  return {
    last28: modelHealth(evaluablePredictions(preds, labels, now - 28 * DAY_MS, now)),
    allTime: modelHealth(evaluablePredictions(preds, labels, -Infinity, now)),
  };
}

/**
 * The reliability bin to quote in the sentence "When EmoLens said about 15%, hard moments happened 13% of the time":
 * the bin with the most predictions (ties: the higher bin, which is the more interesting one). null if all are empty.
 */
export function reliabilityHeadline(bins: ReliabilityBin[]): ReliabilityBin | null {
  let best: ReliabilityBin | null = null;
  for (const b of bins) if (b.n > 0 && (!best || b.n >= best.n)) best = b;
  return best;
}

export interface AlertForMetrics { id: string; blockStart: number; scheduledFor: number; status: 'scheduled' | 'delivered' | 'cancelled' | 'suppressed'; }
export interface ResponseForMetrics { alertId: string; response: AlertResponseKind; respondedAt: number; }
export interface AlertMetrics {
  delivered: number; happened: number; steppedIn: number; calm: number; noAnswer: number;
  /** happened / (happened + calm); null when neither answer exists yet. */
  hitRate: number | null;
  /** stepped_in / answered; null when nothing was answered. */
  steppedShare: number | null;
}

/**
 * Spec 15.5. An alert counts as delivered once its fire time has passed (status scheduled or delivered).
 * Each alert's latest answer counts. Only alerts whose block starts in [from, to) are counted.
 */
export function alertMetrics(alerts: AlertForMetrics[], responses: ResponseForMetrics[], now: number, from = -Infinity, to = Infinity): AlertMetrics {
  const latest = new Map<string, ResponseForMetrics>();
  for (const r of responses) { const prev = latest.get(r.alertId); if (!prev || r.respondedAt >= prev.respondedAt) latest.set(r.alertId, r); }
  const m: AlertMetrics = { delivered: 0, happened: 0, steppedIn: 0, calm: 0, noAnswer: 0, hitRate: null, steppedShare: null };
  for (const a of alerts) {
    if (a.blockStart < from || a.blockStart >= to) continue;
    if (!(a.status === 'delivered' || (a.status === 'scheduled' && a.scheduledFor <= now))) continue;
    m.delivered++;
    const r = latest.get(a.id)?.response;
    if (r === 'happened') m.happened++;
    else if (r === 'stepped_in') m.steppedIn++;
    else if (r === 'calm') m.calm++;
    else m.noAnswer++;
  }
  const answered = m.happened + m.steppedIn + m.calm;
  if (m.happened + m.calm > 0) m.hitRate = m.happened / (m.happened + m.calm);
  if (answered > 0) m.steppedShare = m.steppedIn / answered;
  return m;
}

/** One stored model fit (a row of `model_fits`). */
export interface FitPoint { at: number; keys: string[]; fit: Fit; priorSd: number[]; }

/**
 * One fit per week, counting back from the newest: the newest fit, then the newest fit at least 7 days older, and so
 * on. Returned oldest first. Chart 2 of the trigger detail plots these ("per weekly refit", spec 9.5).
 */
export function weeklyFits<T extends { at: number }>(points: T[]): T[] {
  const sorted = [...points].sort((a, b) => b.at - a.at);
  const out: T[] = [];
  for (const p of sorted) if (!out.length || out[out.length - 1].at - p.at >= 7 * DAY_MS - 60 * 60 * 1000) out.push(p);
  return out.reverse();
}

export interface EffectPoint { at: number; or: number; orLo: number; orHi: number; confidence: number; }

/** Effect (odds ratio per meaningful change u, with its 80% range) of feature `key` in each fit that includes it. */
export function effectHistory(points: FitPoint[], key: string, unit: number): EffectPoint[] {
  const out: EffectPoint[] = [];
  for (const p of points) {
    const j = p.keys.indexOf(key);
    if (j < 0) continue;
    const e = effectSummary(p.fit, j, unit, p.fit.tau * p.priorSd[j]);
    out.push({ at: p.at, or: e.or, orLo: e.orLo, orHi: e.orHi, confidence: e.confidence });
  }
  return out;
}

export interface OutlookBlock { start: number; end: number; localDate: string; index: number; level: RiskLevel; p: number; }

/**
 * The morning outlook (spec 15.3): "mostly calm; higher chance 2-4 pm". Returns the high blocks of `date`
 * (or, if none, the moderate ones), in time order; `calm` is true when there are none of either.
 */
export function dayOutlook(blocks: OutlookBlock[], date: string): { calm: boolean; level: 'high' | 'moderate' | null; blocks: OutlookBlock[] } {
  const day = blocks.filter((b) => b.localDate === date).sort((a, b) => a.start - b.start);
  const high = day.filter((b) => b.level === 'high');
  if (high.length) return { calm: false, level: 'high', blocks: high };
  const moderate = day.filter((b) => b.level === 'moderate');
  if (moderate.length) return { calm: false, level: 'moderate', blocks: moderate };
  return { calm: true, level: null, blocks: [] };
}
