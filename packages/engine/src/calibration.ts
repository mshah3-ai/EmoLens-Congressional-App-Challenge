/** Forecast-quality metrics (spec Section 18). */

export function brier(p: number[], y: number[]): number {
  if (p.length === 0) return NaN;
  let s = 0;
  for (let i = 0; i < p.length; i++) s += (p[i] - y[i]) ** 2;
  return s / p.length;
}

export function logLoss(p: number[], y: number[]): number {
  if (p.length === 0) return NaN;
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const q = Math.min(1 - 1e-15, Math.max(1e-15, p[i]));
    s -= y[i] ? Math.log(q) : Math.log(1 - q);
  }
  return s / p.length;
}

/** Rank-based AUROC (Mann-Whitney U with average ranks for ties). null if a class is missing. */
export function auroc(p: number[], y: number[]): number | null {
  const n = p.length;
  let nPos = 0;
  for (const v of y) if (v) nPos++;
  const nNeg = n - nPos;
  if (nPos === 0 || nNeg === 0) return null;
  const idx = p.map((_, i) => i).sort((a, b) => p[a] - p[b]);
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && p[idx[j + 1]] === p[idx[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k]] = avg;
    i = j + 1;
  }
  let sumPos = 0;
  for (let k = 0; k < n; k++) if (y[k]) sumPos += ranks[k];
  return (sumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

export interface ReliabilityBin { binLo: number; binHi: number; meanP: number; rate: number; n: number; }

/** Reliability with explicit bin edges (last bin closed on the right). */
export function reliabilityEdges(p: number[], y: number[], edges: number[]): ReliabilityBin[] {
  const bins = edges.slice(0, -1).map((lo, i) => ({ binLo: lo, binHi: edges[i + 1], sp: 0, sy: 0, n: 0 }));
  for (let i = 0; i < p.length; i++) {
    let b = bins.findIndex((bb, k) => p[i] >= bb.binLo && (p[i] < bb.binHi || (k === bins.length - 1 && p[i] <= bb.binHi)));
    if (b < 0) b = p[i] < edges[0] ? 0 : bins.length - 1;
    bins[b].sp += p[i]; bins[b].sy += y[i]; bins[b].n++;
  }
  return bins.map((b) => ({ binLo: b.binLo, binHi: Math.min(1, b.binHi), meanP: b.n ? b.sp / b.n : NaN, rate: b.n ? b.sy / b.n : NaN, n: b.n }));
}

/** Reliability with `bins` equal-width bins over [0, 1]. */
export function reliability(p: number[], y: number[], bins: number): ReliabilityBin[] {
  const edges = Array.from({ length: bins + 1 }, (_, i) => i / bins);
  return reliabilityEdges(p, y, edges);
}

/** Skill score 1 - Brier_model / Brier_baseline. */
export function skillScore(p: number[], pBase: number[], y: number[]): number {
  const bb = brier(pBase, y);
  return bb > 0 ? 1 - brier(p, y) / bb : NaN;
}
