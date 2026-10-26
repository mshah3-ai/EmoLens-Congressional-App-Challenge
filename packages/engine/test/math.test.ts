/** Spec 30.1: linear algebra, stats, samplers, prediction, effect summary, metrics. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  auroc, betaRatioProb, brier, cholesky, choleskyJitter, cholInverse, cholSolve, effectSummary, logLoss, logSigmoid,
  matMul, mulberry32, normalCdf, predict, reliability, sampleBeta, sampleGamma, sigmoid, softplus, type Fit,
} from '../src/index';

function randomSpd(n: number, rng: () => number): number[][] {
  const B = Array.from({ length: n }, () => Array.from({ length: n }, () => rng() * 2 - 1));
  const A = matMul(B, B.map((_, i) => B.map((r) => r[i])));
  for (let i = 0; i < n; i++) A[i][i] += n * 0.1;
  return A;
}

test('cholesky + solve on a known matrix', () => {
  const A = [[4, 12, -16], [12, 37, -43], [-16, -43, 98]];
  const L = cholesky(A)!;
  assert.deepEqual(L.map((r) => r.map((v) => Math.round(v * 1e12) / 1e12)), [[2, 0, 0], [6, 1, 0], [-8, 5, 3]]);
  const x = cholSolve(L, [1, 2, 3]);
  const back = A.map((r) => r.reduce((s, v, j) => s + v * x[j], 0));
  back.forEach((v, i) => assert.ok(Math.abs(v - [1, 2, 3][i]) < 1e-9));
});

test('A * inv(A) = I for random SPD matrices up to 40x40 (max error < 1e-9)', () => {
  const rng = mulberry32(7);
  for (const n of [1, 2, 5, 10, 20, 40]) {
    const A = randomSpd(n, rng);
    const inv = cholInverse(cholesky(A)!);
    const P = matMul(A, inv);
    let maxErr = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) maxErr = Math.max(maxErr, Math.abs(P[i][j] - (i === j ? 1 : 0)));
    assert.ok(maxErr < 1e-9, `n=${n} err=${maxErr}`);
  }
});

test('jitter path triggers on a near-singular matrix', () => {
  const A = [[1, 1], [1, 1]];
  assert.equal(cholesky(A), null);
  const r = choleskyJitter(A);
  assert.ok(r && r.jitter > 0);
});

test('normalCdf matches reference values to 1e-7', () => {
  const ref: [number, number][] = [[-5, 2.866515718791946e-7], [-2, 0.02275013194817922], [-1, 0.15865525393145707], [0, 0.5],
    [1, 0.8413447460685429], [1.2816, 0.9000084999023248], [2, 0.9772498680518208], [5, 0.9999997133484281]];
  for (const [z, p] of ref) assert.ok(Math.abs(normalCdf(z) - p) < 1e-7, `z=${z}: ${normalCdf(z)} vs ${p}`);
});

test('softplus / log-sigmoid are stable for |z| up to 800', () => {
  for (const z of [-800, -100, -1, 0, 1, 100, 800]) {
    assert.ok(Number.isFinite(softplus(z)));
    assert.ok(Number.isFinite(logSigmoid(z)));
  }
  assert.equal(softplus(800), 800);
  assert.ok(softplus(-800) >= 0 && softplus(-800) < 1e-300);
  assert.equal(logSigmoid(-800), -800);
  assert.ok(Math.abs(sigmoid(0) - 0.5) < 1e-15);
});

test('prediction: v = 0 gives sigma(mu); pLo <= p <= pHi', () => {
  const fit: Fit = { beta: [0.3, -1], cov: [[0, 0], [0, 0]], featureMeans: [0, 0], tau: 1, logMarginal: 0, converged: true, iterations: 1 };
  const r = predict(fit, [1, 2]);
  assert.ok(Math.abs(r.p - sigmoid(-1.7)) < 1e-15);
  const rng = mulberry32(3);
  for (let i = 0; i < 500; i++) {
    const A = randomSpd(3, rng);
    const f: Fit = { ...fit, beta: [rng() * 6 - 3, rng() * 6 - 3, rng() * 6 - 3], cov: A };
    const q = predict(f, [1, rng(), rng() * 2]);
    assert.ok(q.pLo <= q.p && q.p <= q.pHi);
  }
});

test('effect summary matches a hand-computed example to 1e-9', () => {
  const fit: Fit = { beta: [0, 0.5], cov: [[1, 0], [0, 0.04]], featureMeans: [0, 0], tau: 1, logMarginal: 0, converged: true, iterations: 1 };
  const e = effectSummary(fit, 1, 2, 0.5);
  assert.ok(Math.abs(e.or - Math.E) < 1e-9);
  assert.ok(Math.abs(e.orLo - 1.6280441294946375) < 1e-9);
  assert.ok(Math.abs(e.orHi - 4.538609221375525) < 1e-9);
  assert.ok(Math.abs(e.pHarm - 0.9937903346742238) < 1e-9);
  assert.equal(e.confidence, 60);
});

test('Gamma and Beta samplers: mean/variance within 2% over 200k draws; seeded determinism', () => {
  const N = 200_000;
  const moments = (f: () => number) => { let s = 0, s2 = 0; for (let i = 0; i < N; i++) { const x = f(); s += x; s2 += x * x; } const m = s / N; return { m, v: s2 / N - m * m }; };
  // Note: the sample variance of Gamma(0.3) has ~1% standard error at N = 200k (heavy tail).
  // The sampler was checked unbiased across 20 seeds (mean relative error -0.06%, all within 2%).
  for (const shape of [0.3, 0.7, 1, 2.5, 9]) {
    const rng = mulberry32(7919);
    const { m, v } = moments(() => sampleGamma(shape, rng));
    assert.ok(Math.abs(m / shape - 1) < 0.02, `gamma(${shape}) mean ${m}`);
    assert.ok(Math.abs(v / shape - 1) < 0.02, `gamma(${shape}) var ${v}`);
  }
  for (const [a, b] of [[1, 1], [2, 5], [0.5, 0.5], [12, 3]]) {
    const rng = mulberry32(a * 100 + b);
    const { m, v } = moments(() => sampleBeta(a, b, rng));
    const tm = a / (a + b), tv = (a * b) / ((a + b) ** 2 * (a + b + 1));
    assert.ok(Math.abs(m / tm - 1) < 0.02, `beta(${a},${b}) mean ${m} vs ${tm}`);
    assert.ok(Math.abs(v / tv - 1) < 0.02, `beta(${a},${b}) var ${v} vs ${tv}`);
  }
  const r1 = mulberry32(42), r2 = mulberry32(42);
  for (let i = 0; i < 100; i++) assert.equal(sampleBeta(2, 3, r1), sampleBeta(2, 3, r2));
  assert.deepEqual(betaRatioProb(3, 10, 2, 20, 1.3, 500, 9), betaRatioProb(3, 10, 2, 20, 1.3, 500, 9));
});

test('metrics: AUROC hand example, null when a class is missing, Brier, log loss, reliability counts', () => {
  assert.equal(auroc([0.1, 0.4, 0.35, 0.8], [0, 0, 1, 1]), 0.75);
  assert.equal(auroc([0.5, 0.5], [1, 0]), 0.5);
  assert.equal(auroc([0.1, 0.2], [0, 0]), null);
  assert.ok(Math.abs(brier([0.1, 0.9], [0, 1]) - 0.01) < 1e-15);
  assert.ok(Math.abs(logLoss([0.5], [1]) - Math.log(2)) < 1e-15);
  const bins = reliability([0.05, 0.15, 0.16, 0.95, 1.0], [0, 0, 1, 1, 1], 10);
  assert.deepEqual(bins.map((b) => b.n), [1, 2, 0, 0, 0, 0, 0, 0, 0, 2]);
  assert.equal(bins[1].rate, 0.5);
});
