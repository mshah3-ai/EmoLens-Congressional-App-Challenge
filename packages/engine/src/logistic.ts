/**
 * Bayesian logistic regression: MAP estimate by Newton-Raphson with backtracking, plus the
 * Laplace approximation (posterior covariance and log marginal likelihood). Spec 13.2-13.6.
 */
import { MAX_NEWTON_ITERS, NEWTON_TOL } from '@emolens/shared';
import { choleskyJitter, cholSolve, cholInverse, cholLogDet, dot, type Matrix } from './linalg';
import { logSigmoid, log1mSigmoid, sigmoid } from './stats';

export interface TrainingRow { x: number[]; y: 0 | 1; w: number; }
/** Prior beta_j ~ Normal(mean_j, sd_eff_j^2), where sd_eff = tau * sd if scaled[j] else sd. */
export interface Prior { mean: number[]; sd: number[]; scaled: boolean[]; }
export interface Fit {
  beta: number[]; cov: number[][]; featureMeans: number[];
  tau: number; logMarginal: number; converged: boolean; iterations: number;
}

export class FitError extends Error {}

export function effectivePriorSd(prior: Prior, tau: number): number[] {
  return prior.sd.map((s, j) => (prior.scaled[j] ? tau * s : s));
}

/** Weighted log likelihood l(beta) = sum w_i [y log p + (1-y) log(1-p)]. */
export function logLikelihood(rows: TrainingRow[], beta: number[]): number {
  let l = 0;
  for (const r of rows) {
    if (r.w <= 0) continue;
    const z = dot(r.x, beta);
    l += r.w * (r.y === 1 ? logSigmoid(z) : log1mSigmoid(z));
  }
  return l;
}

/** Log posterior L(beta) up to a constant. */
export function logPosterior(rows: TrainingRow[], prior: Prior, tau: number, beta: number[]): number {
  const s = effectivePriorSd(prior, tau);
  let pen = 0;
  for (let j = 0; j < beta.length; j++) { const d = beta[j] - prior.mean[j]; pen += (d * d) / (s[j] * s[j]); }
  return logLikelihood(rows, beta) - 0.5 * pen;
}

/** Gradient g(beta) = X^T W (y - p) - Lambda (beta - m). */
export function gradient(rows: TrainingRow[], prior: Prior, tau: number, beta: number[]): number[] {
  const d = beta.length;
  const s = effectivePriorSd(prior, tau);
  const g = new Array<number>(d).fill(0);
  for (const r of rows) {
    if (r.w <= 0) continue;
    const res = r.w * (r.y - sigmoid(dot(r.x, beta)));
    for (let j = 0; j < d; j++) if (r.x[j] !== 0) g[j] += res * r.x[j];
  }
  for (let j = 0; j < d; j++) g[j] -= (beta[j] - prior.mean[j]) / (s[j] * s[j]);
  return g;
}

/** Negative Hessian A(beta) = X^T diag(w p (1-p)) X + Lambda. */
export function negHessian(rows: TrainingRow[], prior: Prior, tau: number, beta: number[]): Matrix {
  const d = beta.length;
  const s = effectivePriorSd(prior, tau);
  const A: Matrix = Array.from({ length: d }, () => new Array<number>(d).fill(0));
  const nz: number[] = [];
  for (const r of rows) {
    if (r.w <= 0) continue;
    const p = sigmoid(dot(r.x, beta));
    const h = r.w * p * (1 - p);
    if (h === 0) continue;
    nz.length = 0;
    for (let j = 0; j < d; j++) if (r.x[j] !== 0) nz.push(j);
    for (let a = 0; a < nz.length; a++) {
      const ia = nz[a];
      const ha = h * r.x[ia];
      const Aa = A[ia];
      for (let b = 0; b <= a; b++) Aa[nz[b]] += ha * r.x[nz[b]];
    }
  }
  for (let i = 0; i < d; i++) { for (let j = 0; j < i; j++) A[j][i] = A[i][j]; A[i][i] += 1 / (s[i] * s[i]); }
  return A;
}

function weightedMeans(rows: TrainingRow[], d: number): number[] {
  const m = new Array<number>(d).fill(0);
  let W = 0;
  for (const r of rows) { if (r.w <= 0) continue; W += r.w; for (let j = 0; j < d; j++) m[j] += r.w * r.x[j]; }
  return W > 0 ? m.map((v) => v / W) : m;
}

/** MAP fit + Laplace posterior for a fixed tau. Throws FitError if the Hessian can't be factored. */
export function fitLogistic(rows: TrainingRow[], prior: Prior, tau: number): Fit {
  const d = prior.mean.length;
  const s = effectivePriorSd(prior, tau);
  const logDetLambda = s.reduce((acc, v) => acc - 2 * Math.log(v), 0);
  const featureMeans = weightedMeans(rows, d);
  const active = rows.some((r) => r.w > 0);
  if (!active) {
    // No data: posterior = prior.
    return {
      beta: [...prior.mean],
      cov: s.map((v, i) => s.map((_, j) => (i === j ? v * v : 0))),
      featureMeans, tau, logMarginal: 0, converged: true, iterations: 0,
    };
  }
  let beta = [...prior.mean];
  let converged = false;
  let iterations = 0;
  let current = logPosterior(rows, prior, tau, beta);
  for (let it = 1; it <= MAX_NEWTON_ITERS; it++) {
    iterations = it;
    const g = gradient(rows, prior, tau, beta);
    const A = negHessian(rows, prior, tau, beta);
    const ch = choleskyJitter(A);
    if (!ch) throw new FitError('Hessian not positive definite');
    const delta = cholSolve(ch.L, g);
    let t = 1;
    let next = beta.map((b, j) => b + t * delta[j]);
    let nextVal = logPosterior(rows, prior, tau, next);
    // Relative tolerance: near the optimum, L changes by less than floating-point noise, and an
    // absolute 1e-12 test would reject good Newton steps and stall short of the true MAP.
    const tol = 1e-12 * Math.max(1, Math.abs(current));
    while (nextVal < current - tol && t > 1e-4) {
      t /= 2;
      next = beta.map((b, j) => b + t * delta[j]);
      nextVal = logPosterior(rows, prior, tau, next);
    }
    let maxStep = 0;
    for (let j = 0; j < d; j++) maxStep = Math.max(maxStep, Math.abs(t * delta[j]));
    beta = next;
    current = nextVal;
    if (maxStep < NEWTON_TOL) { converged = true; break; }
  }
  const A = negHessian(rows, prior, tau, beta);
  const ch = choleskyJitter(A);
  if (!ch) throw new FitError('Hessian not positive definite at the MAP');
  const cov = cholInverse(ch.L);
  // Laplace log marginal: l(b) - 1/2 (b-m)^T Lambda (b-m) + 1/2 log|Lambda| - 1/2 log|A|
  const logMarginal = current + 0.5 * logDetLambda - 0.5 * cholLogDet(ch.L);
  return { beta, cov, featureMeans, tau, logMarginal, converged, iterations };
}
