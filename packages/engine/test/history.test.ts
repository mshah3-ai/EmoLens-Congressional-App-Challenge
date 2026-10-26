/** Tests for the stored-results helpers: day-ahead snapshot rule, Model Health inputs, alert metrics, fit history, outlook. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MS, type LabelStatus } from '@emolens/shared';
import {
  alertMetrics, dayAheadSnapshotDue, dayOutlook, effectHistory, evaluablePredictions, healthFor, reliabilityHeadline, weeklyFits,
  type AlertForMetrics, type FitPoint, type OutlookBlock,
} from '../src/index';
import { MONDAY, TZ, at } from './helpers';

const SUNDAY = '2026-09-13';

test('day-ahead snapshot: from 18:00 local the evening before, until the block starts', () => {
  const block = at(MONDAY, '14:00');
  assert.equal(dayAheadSnapshotDue(block, at(SUNDAY, '17:59'), TZ), false);
  assert.equal(dayAheadSnapshotDue(block, at(SUNDAY, '18:00'), TZ), true);
  assert.equal(dayAheadSnapshotDue(block, at(MONDAY, '09:00'), TZ), true);
  assert.equal(dayAheadSnapshotDue(block, block, TZ), false);
});

test('day-ahead snapshot uses local 18:00 across the DST fall-back day', () => {
  // 2026-11-01 is the fall-back day in New York; the evening before is still EDT.
  const block = zoned('2026-11-01', '08:00');
  assert.equal(dayAheadSnapshotDue(block, zoned('2026-10-31', '18:00'), TZ), true);
  assert.equal(dayAheadSnapshotDue(block, zoned('2026-10-31', '17:30'), TZ), false);
});
function zoned(date: string, hhmm: string) { return at(date, hhmm); }

test('evaluable predictions keep only positive / calm-confirmed blocks, inside the window', () => {
  const labels = new Map<number, LabelStatus>([[1, 'positive'], [2, 'negative_confirmed'], [3, 'intervened'], [4, 'unknown']]);
  const preds = [1, 2, 3, 4, 5].map((b) => ({ blockStart: b, p: 0.1, pBaseline: 0.1 }));
  assert.deepEqual(evaluablePredictions(preds, labels).map((p) => [p.blockStart, p.y]), [[1, 1], [2, 0]]);
  assert.deepEqual(evaluablePredictions(preds, labels, 2, 3).map((p) => p.blockStart), [2]);
});

test('healthFor splits the last 28 days from all time', () => {
  const now = at(MONDAY, '12:00');
  const labels = new Map<number, LabelStatus>();
  const preds = [];
  for (let i = 1; i <= 60; i++) {
    const b = now - i * DAY_MS;
    labels.set(b, i % 5 === 0 ? 'positive' : 'negative_confirmed');
    preds.push({ blockStart: b, p: i % 5 === 0 ? 0.3 : 0.05, pBaseline: 0.1 });
  }
  const h = healthFor(preds, labels, now);
  assert.equal(h.allTime.n, 60);
  assert.equal(h.last28.n, 28); // days 1..28 are inside [now - 28 d, now)
  assert.ok(h.allTime.skill > 0, 'a model that separates the classes beats the flat baseline');
  assert.ok(h.allTime.enough);
});

test('reliability headline is the fullest bin; null when every bin is empty', () => {
  const bins = [
    { binLo: 0, binHi: 0.05, meanP: 0.03, rate: 0.02, n: 40 },
    { binLo: 0.05, binHi: 0.1, meanP: 0.07, rate: 0.08, n: 40 },
    { binLo: 0.1, binHi: 0.2, meanP: 0.14, rate: 0.13, n: 12 },
  ];
  assert.equal(reliabilityHeadline(bins)?.binLo, 0.05);
  assert.equal(reliabilityHeadline(bins.map((b) => ({ ...b, n: 0 }))), null);
});

test('alert metrics: delivered once fired, latest answer counts, hit rate = happened / (happened + calm)', () => {
  const now = at(MONDAY, '20:00');
  const A = (id: string, hhmm: string, status: AlertForMetrics['status']): AlertForMetrics =>
    ({ id, blockStart: at(MONDAY, hhmm) + 30 * 60_000, scheduledFor: at(MONDAY, hhmm), status });
  const alerts = [A('a', '07:30', 'delivered'), A('b', '11:30', 'scheduled'), A('c', '15:30', 'delivered'), A('d', '21:30', 'scheduled'),
    A('e', '09:30', 'cancelled'), A('f', '13:30', 'suppressed'), A('g', '17:30', 'delivered')];
  const responses = [
    { alertId: 'a', response: 'calm' as const, respondedAt: at(MONDAY, '10:00') },
    { alertId: 'a', response: 'happened' as const, respondedAt: at(MONDAY, '10:05') }, // edited later: happened wins
    { alertId: 'b', response: 'calm' as const, respondedAt: at(MONDAY, '14:00') },
    { alertId: 'c', response: 'stepped_in' as const, respondedAt: at(MONDAY, '18:00') },
  ];
  const m = alertMetrics(alerts, responses, now);
  assert.deepEqual({ ...m }, { delivered: 4, happened: 1, steppedIn: 1, calm: 1, noAnswer: 1, hitRate: 0.5, steppedShare: 1 / 3 });
  assert.equal(alertMetrics([], [], now).hitRate, null);
});

const fitAt = (day: number, beta: number, sd: number): FitPoint => ({
  at: at(MONDAY, '18:00') + day * DAY_MS, keys: ['intercept', 'sleep_deficit'], priorSd: [1, 0.25],
  fit: { beta: [-3, beta], cov: [[0.1, 0], [0, sd * sd]], featureMeans: [1, 0], tau: 1, logMarginal: 0, converged: true, iterations: 5 },
});

test('weekly fits: newest, then at least a week apart, oldest first', () => {
  const pts = Array.from({ length: 22 }, (_, d) => fitAt(d, 0.1, 0.2));
  const w = weeklyFits(pts);
  assert.deepEqual(w.map((p) => Math.round((p.at - pts[0].at) / DAY_MS)), [0, 7, 14, 21]);
});

test('effect history: odds ratio per meaningful change, 80% range, and confidence grow as the sd shrinks', () => {
  const h = effectHistory([fitAt(0, 0.1, 0.25), fitAt(7, 0.3, 0.12), { ...fitAt(14, 0.3, 0.1), keys: ['intercept', 'other'] }], 'sleep_deficit', 2);
  assert.equal(h.length, 2, 'a fit without the feature is skipped');
  assert.ok(Math.abs(h[1].or - Math.exp(0.6)) < 1e-12);
  assert.ok(h[1].orLo < h[1].or && h[1].or < h[1].orHi);
  assert.ok(h[1].confidence > h[0].confidence);
  assert.equal(h[0].confidence, 0);
});

test('outlook: high blocks first, else moderate, else calm', () => {
  const B = (hhmm: string, level: OutlookBlock['level'], date = MONDAY): OutlookBlock =>
    ({ start: at(date, hhmm), end: at(date, hhmm) + 7_200_000, localDate: date, index: 0, level, p: 0.1 });
  assert.deepEqual(dayOutlook([B('14:00', 'high'), B('08:00', 'moderate'), B('10:00', 'high')], MONDAY).blocks.map((b) => b.start),
    [at(MONDAY, '10:00'), at(MONDAY, '14:00')]);
  assert.equal(dayOutlook([B('08:00', 'moderate'), B('10:00', 'low')], MONDAY).level, 'moderate');
  assert.equal(dayOutlook([B('08:00', 'low'), B('10:00', 'high', SUNDAY)], MONDAY).calm, true);
});
