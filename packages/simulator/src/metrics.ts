/**
 * Validation metrics (spec 26.3) and small statistics helpers: forecast quality over a window of
 * day-ahead predictions, means with 95% intervals across families, and a seeded bootstrap.
 * Pure TypeScript; the heavy lifting (AUROC, Brier) comes from the engine.
 */
import { RELIABILITY_EDGES } from '@emolens/shared';
import { auroc, brier, mulberry32 } from '@emolens/engine';

/** One stored day-ahead prediction plus what really happened in that block. */
export interface PredRow {
  /** 0-based day of the block being predicted. */
  blockDay: number;
  blockStart: number;
  index: number;
  p: number;
  pBase: number;
  pTrue: number;
  /** A hard moment really happened (logged or not). */
  y: 0 | 1;
  /** The parent stepped in after an alert (excluded from forecast evaluation, spec 26.3). */
  intervened: boolean;
}

export interface WindowMetrics {
  n: number; positives: number;
  auroc: number | null; brier: number | null; brierBase: number | null; skill: number | null;
  /** Skill using expected Brier against the true chance (removes coin-flip noise of rare events). */
  expectedSkill: number | null;
  /** Expected skill of an oracle that forecasts the true chance itself (the ceiling for any forecaster). */
  oracleSkill: number | null;
  /** Realized skill of that oracle on the actual outcomes (how noisy a 7-day skill score is even for a perfect model). */
  oracleRealizedSkill: number | null;
}

/** Forecast quality of predictions (already filtered to a window), against true outcomes. */
export function windowMetrics(preds: PredRow[]): WindowMetrics {
  const ev = preds.filter((r) => !r.intervened);
  const n = ev.length;
  if (n === 0) return { n: 0, positives: 0, auroc: null, brier: null, brierBase: null, skill: null, expectedSkill: null, oracleSkill: null, oracleRealizedSkill: null };
  const p = ev.map((r) => r.p), pb = ev.map((r) => r.pBase), y = ev.map((r) => r.y);
  const b = brier(p, y), bb = brier(pb, y);
  // expected Brier E[(p - Y)^2] with Y ~ Bernoulli(pTrue)
  let eb = 0, ebb = 0, eo = 0;
  for (const r of ev) {
    const v = r.pTrue * (1 - r.pTrue);
    eb += (r.p - r.pTrue) ** 2 + v; ebb += (r.pBase - r.pTrue) ** 2 + v; eo += v;
  }
  return {
    n, positives: y.reduce<number>((a, v) => a + v, 0), auroc: auroc(p, y), brier: b, brierBase: bb,
    skill: bb > 0 ? 1 - b / bb : null, expectedSkill: ebb > 0 ? 1 - eb / ebb : null, oracleSkill: ebb > 0 ? 1 - eo / ebb : null,
    oracleRealizedSkill: bb > 0 ? 1 - brier(ev.map((r) => r.pTrue), y) / bb : null,
  };
}

export interface CalibrationRow { bin: number; binLo: number; binHi: number; n: number; meanP: number | null; meanPTrue: number | null; rate: number | null; }

/** Reliability bins (spec 18 edges): mean predicted vs the true chance and the observed rate. */
export function calibrationBins(preds: PredRow[]): CalibrationRow[] {
  const edges = RELIABILITY_EDGES;
  const acc = edges.slice(0, -1).map((lo, i) => ({ bin: i, binLo: lo, binHi: Math.min(1, edges[i + 1]), n: 0, sp: 0, st: 0, sy: 0 }));
  for (const r of preds) {
    if (r.intervened) continue;
    let i = acc.findIndex((a, k) => r.p >= a.binLo && (r.p < edges[k + 1]));
    if (i < 0) i = acc.length - 1;
    const a = acc[i];
    a.n++; a.sp += r.p; a.st += r.pTrue; a.sy += r.y;
  }
  return acc.map((a) => ({ bin: a.bin, binLo: a.binLo, binHi: a.binHi, n: a.n,
    meanP: a.n ? a.sp / a.n : null, meanPTrue: a.n ? a.st / a.n : null, rate: a.n ? a.sy / a.n : null }));
}

export interface MeanCI { mean: number | null; lo: number | null; hi: number | null; n: number; }

/** Mean with a normal-approximation 95% interval (1.96 standard errors); nulls are skipped. */
export function meanCI(values: (number | null | undefined)[]): MeanCI {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v));
  const n = xs.length;
  if (n === 0) return { mean: null, lo: null, hi: null, n: 0 };
  const m = xs.reduce((a, b) => a + b, 0) / n;
  if (n === 1) return { mean: m, lo: m, hi: m, n };
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
  const h = (1.96 * sd) / Math.sqrt(n);
  return { mean: m, lo: m - h, hi: m + h, n };
}

/** Percentile bootstrap 95% interval of the mean (resampling families), seeded. */
export function bootstrapMeanCI(values: number[], seed: number, reps = 4000): MeanCI {
  const n = values.length;
  if (n === 0) return { mean: null, lo: null, hi: null, n: 0 };
  const rng = mulberry32(seed);
  const means: number[] = [];
  for (let r = 0; r < reps; r++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += values[Math.floor(rng() * n)];
    means.push(s / n);
  }
  means.sort((a, b) => a - b);
  return { mean: values.reduce((a, b) => a + b, 0) / n, lo: means[Math.floor(0.025 * reps)], hi: means[Math.ceil(0.975 * reps) - 1], n };
}

export function fraction(xs: boolean[]): number | null { return xs.length ? xs.filter(Boolean).length / xs.length : null; }
