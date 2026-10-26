/**
 * SPEC 13.10 performance budget, measured in Node on the development Mac: a fit with n = 3,000 blocks and d = 40
 * features must take < 300 ms, and the tau grid (3 fits plus the evidence) < 1.5 s. A mid-range phone is slower than a
 * Mac, so the test also prints the times, and the real-phone check is on docs/QA_CHECKLIST.md (row "Performance").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TAU_GRID } from '@emolens/shared';
import { fitLogistic, mulberry32, selectTau, sigmoid, type Prior, type TrainingRow } from '../src/index';

const N = 3000, D = 40;

function rows(): TrainingRow[] {
  const rng = mulberry32(13);
  const beta = Array.from({ length: D }, (_, j) => (j === 0 ? -2.5 : j < 5 ? 0.5 : 0));
  return Array.from({ length: N }, () => {
    const x = [1, ...Array.from({ length: D - 1 }, (_, j) => (j % 2 === 0 ? (rng() < 0.3 ? 1 : 0) : rng() * 2 - 1))];
    return { x, y: rng() < sigmoid(x.reduce((s, v, j) => s + v * beta[j], 0)) ? 1 : 0, w: 1 };
  });
}
const prior: Prior = { mean: Array(D).fill(0).map((_, j) => (j === 0 ? -2.5 : 0)), sd: Array(D).fill(0.5).map((v, j) => (j === 0 ? 1.5 : v)),
  scaled: Array.from({ length: D }, (_, j) => j !== 0) };

const time = (f: () => unknown) => { const t = performance.now(); f(); return performance.now() - t; };

test('13.10: one fit with n = 3,000 and d = 40 takes < 300 ms', () => {
  const data = rows();
  fitLogistic(data, prior, 1); // warm-up (the JIT compiler)
  const ms = Math.min(...[0, 1, 2].map(() => time(() => fitLogistic(data, prior, 1))));
  console.log(`fit n=${N} d=${D}: ${ms.toFixed(0)} ms`);
  assert.ok(ms < 300, `${ms.toFixed(0)} ms`);
});

test('13.10: the tau grid takes < 1.5 s', () => {
  const data = rows();
  const ms = time(() => selectTau(data, prior, TAU_GRID));
  console.log(`tau grid (${TAU_GRID.length} values): ${ms.toFixed(0)} ms`);
  assert.ok(ms < 1500, `${ms.toFixed(0)} ms`);
});
