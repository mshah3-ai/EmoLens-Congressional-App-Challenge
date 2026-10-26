/** Predictive probability with an 80% credible range (spec 13.7) and per-feature contributions (13.8). */
import { Z80 } from '@emolens/shared';
import { dot, quadForm } from './linalg';
import type { Fit } from './logistic';
import { sigmoid } from './stats';

export function predict(fit: Fit, x: number[]): { p: number; pLo: number; pHi: number; mu: number; v: number } {
  const mu = dot(x, fit.beta);
  const v = Math.max(0, quadForm(fit.cov, x));
  const p = sigmoid(mu / Math.sqrt(1 + (Math.PI * v) / 8));
  const sd = Math.sqrt(v);
  const pLo = sigmoid(mu - Z80 * sd);
  const pHi = sigmoid(mu + Z80 * sd);
  // The probit-moderated mean can fall outside the 80% range only for extreme |mu|*sqrt(v) (> ~6);
  // clamp so the displayed range always contains the displayed probability.
  return { p: Math.min(pHi, Math.max(pLo, p)), pLo, pHi, mu, v };
}

/** c_j = beta_j * (x_j - xbar_j): how far this block pushes risk vs the child's typical block. */
export function contributions(fit: Fit, x: number[]): number[] {
  return x.map((v, j) => fit.beta[j] * (v - fit.featureMeans[j]));
}
