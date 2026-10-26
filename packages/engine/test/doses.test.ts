import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doseStatusForTaken, isDoseMissed } from '../src/doses';

const M = 60_000;
const t0 = Date.UTC(2026, 8, 28, 13, 0);

test('dose taken within ±60 min is on time, later is late (spec 10.3)', () => {
  assert.equal(doseStatusForTaken(t0, t0 - 30 * M), 'taken');
  assert.equal(doseStatusForTaken(t0, t0 + 60 * M), 'taken');
  assert.equal(doseStatusForTaken(t0, t0 + 61 * M), 'late');
  assert.equal(doseStatusForTaken(t0, t0 + 240 * M), 'late');
  assert.equal(doseStatusForTaken(null, t0), 'taken');
});

test('pending dose becomes missed only after 240 min', () => {
  assert.equal(isDoseMissed('pending', t0, t0 + 240 * M), false);
  assert.equal(isDoseMissed('pending', t0, t0 + 241 * M), true);
  assert.equal(isDoseMissed('taken', t0, t0 + 999 * M), false);
  assert.equal(isDoseMissed('pending', null, t0 + 999 * M), false);
});
