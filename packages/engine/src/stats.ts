/** Numerically careful scalar statistics and a seeded random number generator. Pure, zero deps. */

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

/** Logistic function, written to never overflow. */
export function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}
export const logit = (p: number): number => Math.log(p / (1 - p));
/** softplus(z) = log(1 + e^z), stable for |z| up to at least 800. */
export const softplus = (z: number): number => Math.max(z, 0) + Math.log1p(Math.exp(-Math.abs(z)));
/** log sigma(z) and log(1 - sigma(z)), stable. */
export const logSigmoid = (z: number): number => -softplus(-z);
export const log1mSigmoid = (z: number): number => -softplus(z);

const SQRT_PI = Math.sqrt(Math.PI);

/** Complementary error function for x >= 0 (absolute error ~1e-15). */
function erfcPos(x: number): number {
  if (x < 2.5) {
    // erf(x) = 2/sqrt(pi) * e^{-x^2} * sum_n x (2x^2)^n / (1*3*...*(2n+1)); every term is positive.
    const x2 = x * x;
    let term = x;
    let sum = x;
    for (let n = 1; n < 200; n++) {
      term *= (2 * x2) / (2 * n + 1);
      sum += term;
      if (term < 1e-17 * sum) break;
    }
    return 1 - (2 / SQRT_PI) * Math.exp(-x2) * sum;
  }
  // Continued fraction: erfc(x) = e^{-x^2} / (sqrt(pi) * (x + (1/2)/(x + 1/(x + (3/2)/(x + ...)))))
  let t = x;
  for (let k = 120; k >= 1; k--) t = x + k / 2 / t;
  return Math.exp(-x * x) / (SQRT_PI * t);
}
export function erfc(x: number): number {
  return x >= 0 ? erfcPos(x) : 2 - erfcPos(-x);
}
/** Standard normal CDF Phi(z), accurate to better than 1e-7 (erfc-based). */
export const normalCdf = (z: number): number => 0.5 * erfc(-z / Math.SQRT2);

/** Mulberry32: tiny, fast, seeded 32-bit PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 32-bit FNV-1a hash of a string (used to derive deterministic seeds from item keys). */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Standard normal draw (Box-Muller; uses two uniforms per draw for simple determinism). */
export function sampleNormal(rng: () => number): number {
  let u = rng();
  while (u <= 1e-300) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Gamma(shape, 1) by Marsaglia-Tsang; shape < 1 via the boost Gamma(a+1) * U^(1/a). */
export function sampleGamma(shape: number, rng: () => number): number {
  if (!(shape > 0)) throw new Error('sampleGamma: shape must be > 0');
  if (shape < 1) {
    let u = rng();
    while (u <= 0) u = rng();
    return sampleGamma(shape + 1, rng) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = sampleNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function sampleBeta(a: number, b: number, rng: () => number): number {
  const x = sampleGamma(a, rng);
  const y = sampleGamma(b, rng);
  return x / (x + y);
}

/** Poisson draw (Knuth; fine for the small rates the simulator uses). */
export function samplePoisson(lambda: number, rng: () => number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Linear-interpolated quantile of a sample (q in [0, 1]). */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
