/** Spec 30.1: logistic fit (7 properties) and empirical-Bayes tau selection. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitLogistic, gradient, logPosterior, mulberry32, selectTau, sigmoid, type Prior, type TrainingRow } from '../src/index';

function synth(n: number, beta: number[], seed: number, pOn = 0.3): TrainingRow[] {
  const rng = mulberry32(seed);
  const rows: TrainingRow[] = [];
  for (let i = 0; i < n; i++) {
    const x = [1, ...beta.slice(1).map((_, j) => (j % 2 === 0 ? (rng() < pOn ? 1 : 0) : rng() * 2 - 1))];
    const p = sigmoid(x.reduce((s, v, j) => s + v * beta[j], 0));
    rows.push({ x, y: rng() < p ? 1 : 0, w: 1 });
  }
  return rows;
}
const weakPrior = (d: number): Prior => ({ mean: new Array(d).fill(0), sd: new Array(d).fill(10), scaled: new Array(d).fill(false) });

test('1. no data: posterior equals the prior', () => {
  const prior: Prior = { mean: [-2, 0.3], sd: [1, 0.5], scaled: [false, true] };
  const f = fitLogistic([], prior, 0.75);
  assert.deepEqual(f.beta, [-2, 0.3]);
  assert.ok(Math.abs(f.cov[0][0] - 1) < 1e-15 && Math.abs(f.cov[1][1] - 0.375 ** 2) < 1e-15 && f.cov[0][1] === 0);
  const g = fitLogistic([{ x: [1, 1], y: 1, w: 0 }], prior, 1);
  assert.deepEqual(g.beta, [-2, 0.3]);
});

test('2. recovers known coefficients (n = 20,000, d = 6, weak priors)', () => {
  const truth = [-1.5, 0.8, -0.6, 1.2, 0.4, -1.0];
  const f = fitLogistic(synth(20_000, truth, 11), weakPrior(6), 1);
  f.beta.forEach((b, j) => assert.ok(Math.abs(b - truth[j]) < 0.1, `beta[${j}] = ${b} vs ${truth[j]}`));
  assert.ok(f.converged);
});

test('3. perfectly separable data: finite estimates, converged', () => {
  const rows: TrainingRow[] = [];
  for (let i = 0; i < 200; i++) rows.push({ x: [1, i < 100 ? 0 : 1], y: i < 100 ? 0 : 1, w: 1 });
  const f = fitLogistic(rows, { mean: [0, 0], sd: [1, 1], scaled: [false, true] }, 1);
  assert.ok(f.converged && f.beta.every(Number.isFinite) && f.cov.flat().every(Number.isFinite));
});

test('4. gradient is ~0 at the MAP', () => {
  const rows = synth(3000, [-2, 0.5, 0.2, -0.4], 5);
  const prior: Prior = { mean: [-2, 0.2, 0, 0], sd: [1, 0.3, 0.3, 0.3], scaled: [false, true, true, true] };
  const f = fitLogistic(rows, prior, 0.75);
  const g = gradient(rows, prior, 0.75, f.beta);
  assert.ok(Math.hypot(...g) < 1e-6, `|g| = ${Math.hypot(...g)}`);
});

test('5. analytic gradient matches finite differences (relative error < 1e-5)', () => {
  const rows = synth(500, [-1, 0.5, 0.2, -0.4], 8);
  const prior: Prior = { mean: [-1, 0.1, 0, 0], sd: [1, 0.4, 0.4, 0.4], scaled: [false, true, true, true] };
  const beta = [-0.7, 0.3, -0.2, 0.5];
  const g = gradient(rows, prior, 1.5, beta);
  const h = 1e-6;
  for (let j = 0; j < beta.length; j++) {
    const bp = [...beta], bm = [...beta];
    bp[j] += h; bm[j] -= h;
    const fd = (logPosterior(rows, prior, 1.5, bp) - logPosterior(rows, prior, 1.5, bm)) / (2 * h);
    assert.ok(Math.abs(fd - g[j]) / Math.max(1, Math.abs(g[j])) < 1e-5, `j=${j} fd=${fd} g=${g[j]}`);
  }
});

test('6. duplicating a row equals doubling its weight', () => {
  const rows = synth(300, [-1, 0.7, 0.3], 21);
  const prior = weakPrior(3);
  const dup = [...rows, rows[5]];
  const dbl = rows.map((r, i) => (i === 5 ? { ...r, w: 2 } : r));
  const a = fitLogistic(dup, prior, 1), b = fitLogistic(dbl, prior, 1);
  a.beta.forEach((v, j) => assert.ok(Math.abs(v - b.beta[j]) < 1e-9));
  assert.ok(Math.abs(a.logMarginal - b.logMarginal) < 1e-8);
});

test('7. zero-weight rows have no effect', () => {
  const rows = synth(300, [-1, 0.7, 0.3], 22);
  const prior = weakPrior(3);
  const noisy = [...rows, { x: [1, 1, 5], y: 1 as const, w: 0 }, { x: [1, 0, -9], y: 0 as const, w: 0 }];
  const a = fitLogistic(rows, prior, 1), b = fitLogistic(noisy, prior, 1);
  a.beta.forEach((v, j) => assert.ok(Math.abs(v - b.beta[j]) < 1e-12));
});

test('tau selection: strong effects -> tau >= 1 and null effects -> tau <= 0.75 in >= 80% of 50 datasets', () => {
  const d = 9;
  const prior: Prior = {
    mean: [-2.5, ...new Array(d - 1).fill(0)], sd: [1, ...new Array(d - 1).fill(0.3)], scaled: [false, ...new Array(d - 1).fill(true)],
  };
  const grid = [0.5, 0.75, 1.0, 1.5];
  let strongOk = 0, nullOk = 0;
  for (let s = 0; s < 50; s++) {
    const strong = selectTau(synth(1500, [-2.5, 0.8, 0.6, 0.8, -0.6, 0.7, 0.5, 0.8, -0.5], 1000 + s), prior, grid);
    if (strong.tau >= 1) strongOk++;
    const nul = selectTau(synth(1500, [-2.5, 0, 0, 0, 0, 0, 0, 0, 0], 5000 + s), prior, grid);
    if (nul.tau <= 0.75) nullOk++;
  }
  assert.ok(strongOk >= 40, `strong: ${strongOk}/50`);
  assert.ok(nullOk >= 40, `null: ${nullOk}/50`);
});
