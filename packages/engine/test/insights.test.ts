/**
 * Spec 30.1 "Insight status": table-driven tests of every status rule (spec 14.3, first match wins),
 * including boundary values, and of hysteresis (a weaker status only after 2 consecutive daily fits). "likely" uses
 * setting A (exposed 15, exposed_pos 3, OR 1.25; DECISIONS #144).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyHysteresis, classifyStatus, effectSentence, type InsightStatus, type StatusHistoryEntry, type StatusInput } from '../src/index';

/** Just meets every "strong" threshold. */
const STRONG: StatusInput = {
  enabled: true, labeledDays: 21, exposed: 30, exposedPos: 8, unexposed: 30, unexposedPos: 2,
  pHarm: 0.975, or: 2, orLo: 1.2, orHi: 3, confidence: 50,
};
/** Just meets every "likely" threshold (and fails "strong"). */
const LIKELY: StatusInput = { ...STRONG, labeledDays: 14, exposed: 15, exposedPos: 3, pHarm: 0.9, or: 1.25, orLo: 1.0 };
const POSSIBLE: StatusInput = { ...LIKELY, exposed: 12, exposedPos: 2, pHarm: 0.8, or: 1.2 };
const PROTECTIVE: StatusInput = { ...LIKELY, exposed: 20, exposedPos: 1, pHarm: 0.1, or: 1 / 1.3, orLo: 0.5, orHi: 1.0 };
const NO_CLEAR: StatusInput = { ...LIKELY, exposed: 30, exposedPos: 3, pHarm: 0.5, or: 1, orLo: 1 / 1.5, orHi: 1.5 };

const CASES: [string, StatusInput, InsightStatus][] = [
  ['feature not enabled -> hidden', { ...STRONG, enabled: false }, 'hidden'],
  ['labeled_days 13 -> not_enough_data', { ...STRONG, labeledDays: 13 }, 'not_enough_data'],
  ['exposed 9 -> not_enough_data', { ...STRONG, exposed: 9 }, 'not_enough_data'],
  ['unexposed 9 -> not_enough_data', { ...STRONG, unexposed: 9 }, 'not_enough_data'],
  ['exposed 10, unexposed 10, labeled_days 14 pass the data gate', { ...POSSIBLE, exposed: 10, unexposed: 10, labeledDays: 14 }, 'possible'],

  ['all strong thresholds met exactly -> strong', STRONG, 'strong'],
  ['strong needs labeled_days >= 21', { ...STRONG, labeledDays: 20 }, 'likely'],
  ['strong needs exposed >= 30', { ...STRONG, exposed: 29 }, 'likely'],
  ['strong needs exposed_pos >= 8', { ...STRONG, exposedPos: 7 }, 'likely'],
  ['strong needs P_harm >= 0.975', { ...STRONG, pHarm: 0.974 }, 'likely'],
  ['strong needs OR_lo >= 1.2', { ...STRONG, orLo: 1.19 }, 'likely'],

  ['all likely thresholds met exactly -> likely', LIKELY, 'likely'],
  ['likely needs exposed >= 15', { ...LIKELY, exposed: 14 }, 'possible'],
  ['likely needs exposed_pos >= 3', { ...LIKELY, exposedPos: 2 }, 'possible'],
  ['likely needs P_harm >= 0.90', { ...LIKELY, pHarm: 0.899 }, 'possible'],
  ['likely needs OR_u >= 1.25', { ...LIKELY, or: 1.249 }, 'possible'],

  ['possible thresholds met exactly -> possible', POSSIBLE, 'possible'],
  ['possible needs P_harm >= 0.80', { ...POSSIBLE, pHarm: 0.799 }, 'checking'],
  ['possible needs OR_u >= 1.2', { ...POSSIBLE, or: 1.19 }, 'checking'],

  ['protective thresholds met exactly -> protective', PROTECTIVE, 'protective'],
  ['protective needs exposed >= 20', { ...PROTECTIVE, exposed: 19 }, 'checking'],
  ['protective needs P_harm <= 0.10', { ...PROTECTIVE, pHarm: 0.101 }, 'checking'],
  ['protective needs OR_u <= 1/1.3', { ...PROTECTIVE, or: 0.77 }, 'checking'],

  ['no_clear_link thresholds met exactly -> no_clear_link', NO_CLEAR, 'no_clear_link'],
  ['no_clear_link needs exposed >= 30', { ...NO_CLEAR, exposed: 29 }, 'checking'],
  ['no_clear_link needs OR_lo >= 1/1.5', { ...NO_CLEAR, orLo: 0.66 }, 'checking'],
  ['no_clear_link needs OR_hi <= 1.5', { ...NO_CLEAR, orHi: 1.51 }, 'checking'],

  ['first match wins: possible before no_clear_link', { ...NO_CLEAR, exposed: 40, pHarm: 0.85, or: 1.25, orLo: 0.9, orHi: 1.45 }, 'possible'],
  ['first match wins: not_enough_data before strong', { ...STRONG, unexposed: 5 }, 'not_enough_data'],
  ['otherwise -> checking', { ...NO_CLEAR, exposed: 25 }, 'checking'],
];

for (const [name, input, expected] of CASES) {
  test(`status: ${name}`, () => assert.equal(classifyStatus(input), expected));
}

// ---------- hysteresis ----------

/** Runs a sequence of [date, rawStatus] fits and returns the displayed status after each. */
function run(seq: [string, InsightStatus][]): InsightStatus[] {
  let h: StatusHistoryEntry | undefined;
  return seq.map(([date, raw]) => { h = applyHysteresis(h, raw, date); return h.displayed; });
}
const D1 = '2026-09-14', D2 = '2026-09-15', D3 = '2026-09-16', D4 = '2026-09-17';

test('hysteresis: the first status is shown at once', () => {
  assert.deepEqual(run([[D1, 'checking']]), ['checking']);
});

test('hysteresis: upgrades apply at once', () => {
  assert.deepEqual(run([[D1, 'checking'], [D2, 'possible'], [D3, 'strong']]), ['checking', 'possible', 'strong']);
});

test('hysteresis: a downgrade needs two consecutive daily fits', () => {
  assert.deepEqual(run([[D1, 'likely'], [D2, 'checking'], [D3, 'checking']]), ['likely', 'likely', 'checking']);
});

test('hysteresis: an interrupted downgrade starts over', () => {
  assert.deepEqual(run([[D1, 'likely'], [D2, 'checking'], [D3, 'likely'], [D4, 'checking']]), ['likely', 'likely', 'likely', 'likely']);
});

test('hysteresis: two different weaker statuses in a row do not count as consecutive', () => {
  assert.deepEqual(run([[D1, 'likely'], [D2, 'possible'], [D3, 'checking'], [D4, 'checking']]), ['likely', 'likely', 'likely', 'checking']);
});

test('hysteresis: several fits on the same day count as one daily fit', () => {
  assert.deepEqual(
    run([[D1, 'likely'], [D2, 'checking'], [D2, 'checking'], [D2, 'checking'], [D3, 'checking']]),
    ['likely', 'likely', 'likely', 'likely', 'checking'],
  );
});

test('hysteresis: a same-day flip back resets the streak', () => {
  assert.deepEqual(run([[D1, 'likely'], [D2, 'checking'], [D2, 'likely'], [D3, 'checking']]), ['likely', 'likely', 'likely', 'likely']);
});

test('hysteresis: hidden (source turned off) applies at once', () => {
  assert.deepEqual(run([[D1, 'strong'], [D2, 'hidden']]), ['strong', 'hidden']);
});

test('hysteresis: moving between equally ranked statuses also waits a day', () => {
  assert.deepEqual(run([[D1, 'possible'], [D2, 'protective'], [D3, 'protective']]), ['possible', 'possible', 'protective']);
});

test('effect sentence: an effect that rounds to 1.0x says "About the same chance" (English and Spanish)', () => {
  for (const or of [0.96, 0.996, 1, 1.04]) {
    assert.equal(effectSentence('high_sugar_recent', 1, or, 'en'), 'About the same chance within 3 hours after sugary food');
    assert.match(effectSentence('high_sugar_recent', 1, or, 'es'), /^Alrededor de la misma probabilidad /);
  }
  assert.match(effectSentence('high_sugar_recent', 1, 0.94, 'en'), /^About 6% lower chance/);
  assert.match(effectSentence('high_sugar_recent', 1, 1.05, 'en'), /^About 1\.1× the usual chance/);
  assert.doesNotMatch(effectSentence('high_sugar_recent', 1, 0.999, 'en'), /0% lower/);
});

