/** Beta-binomial models: exposed-vs-unexposed rate ratios (14.5) and strategy effectiveness (Section 17). */
import { mulberry32, quantile, sampleBeta } from './stats';

/** Monte Carlo summary of theta_E / theta_U with theta ~ Beta. */
export function betaRatioProb(aE: number, bE: number, aU: number, bU: number, threshold: number, draws: number, seed: number):
  { pAbove: number; median: number; lo80: number; hi80: number } {
  const rng = mulberry32(seed);
  const ratios = new Array<number>(draws);
  let above = 0;
  for (let i = 0; i < draws; i++) {
    const r = sampleBeta(aE, bE, rng) / sampleBeta(aU, bU, rng);
    ratios[i] = r;
    if (r > threshold) above++;
  }
  ratios.sort((a, b) => a - b);
  return { pAbove: above / draws, median: quantile(ratios, 0.5), lo80: quantile(ratios, 0.1), hi80: quantile(ratios, 0.9) };
}

export interface BetaSummary { mean: number; lo80: number; hi80: number; successes: number; failures: number; }

/** Posterior Beta(1 + s, 1 + f); 80% interval from 4,000 seeded draws. */
export function betaPosterior(s: number, f: number, seed: number, draws = 4000): BetaSummary {
  const rng = mulberry32(seed);
  const xs = new Array<number>(draws);
  for (let i = 0; i < draws; i++) xs[i] = sampleBeta(1 + s, 1 + f, rng);
  xs.sort((a, b) => a - b);
  return { mean: (1 + s) / (2 + s + f), lo80: quantile(xs, 0.1), hi80: quantile(xs, 0.9), successes: s, failures: f };
}

/** Thompson sampling: one posterior draw per option; returns ids ordered by draw (discovery mode). */
export function thompsonRank(options: { id: string; s: number; f: number }[], rng: () => number): string[] {
  return options.map((o) => ({ id: o.id, t: sampleBeta(1 + o.s, 1 + o.f, rng) }))
    .sort((a, b) => b.t - a.t).map((o) => o.id);
}
