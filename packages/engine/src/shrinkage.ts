/** Empirical-Bayes choice of the global shrinkage tau (spec 13.6): keep the fit with the best log Z(tau). */
import { fitLogistic, type Fit, type Prior, type TrainingRow } from './logistic';

export function selectTau(rows: TrainingRow[], prior: Prior, grid: number[]): Fit {
  let best: Fit | null = null;
  for (const tau of grid) {
    const f = fitLogistic(rows, prior, tau);
    if (!best || f.logMarginal > best.logMarginal) best = f;
  }
  if (!best) throw new Error('selectTau: empty grid');
  return best;
}
