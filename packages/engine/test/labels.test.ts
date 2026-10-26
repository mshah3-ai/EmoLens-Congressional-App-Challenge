/** Spec 30.1 "Labels": every rule of spec 12.2, the priority order, the naive policy and training weights. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ChildDataset, LabelStatus } from '@emolens/shared';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '@emolens/shared';
import { buildLabelIndex, labelBlock, labelWeight, type LabelPolicy } from '../src/index';
import { MONDAY, at, blockOf, makeDataset, uid } from './helpers';

const B = blockOf(MONDAY, 7); // 14:00-16:00
const ep = (t: number, over: Partial<ChildDataset['episodes'][number]> = {}) =>
  ({ id: uid('e'), startedAt: t, durationMin: 10, type: 'meltdown' as const, intensity: 3, ...over });
const alert = (id: string, status: ChildDataset['alerts'][number]['status'] = 'delivered', blockStart = B.start) =>
  ({ id, blockStart, scheduledFor: blockStart - 30 * MINUTE_MS, status });
const resp = (alertId: string, response: 'happened' | 'stepped_in' | 'calm', respondedAt = B.end + HOUR_MS) => ({ alertId, response, respondedAt });
const closure = (allLogged: boolean, closedAt: number, localDate = MONDAY) => ({ localDate, allLogged, closedAt });

interface Case { name: string; ds: Partial<ChildDataset>; expect: LabelStatus; policy?: LabelPolicy; now?: number; }

const CASES: Case[] = [
  // rule 1: positive
  { name: 'episode inside the block -> positive', ds: { episodes: [ep(at(MONDAY, '15:00'))] }, expect: 'positive' },
  { name: 'episode at block start -> positive', ds: { episodes: [ep(B.start)] }, expect: 'positive' },
  { name: 'episode exactly at block end belongs to the next block', ds: { episodes: [ep(B.end)] }, expect: 'unknown' },
  { name: 'non-modeled episode type does not count', ds: { episodes: [ep(at(MONDAY, '15:00'), { type: 'other' })] }, expect: 'unknown' },
  { name: 'intensity below min_modeled_intensity does not count', ds: { episodes: [ep(at(MONDAY, '15:00'), { intensity: 1 })] }, expect: 'unknown' },
  { name: 'intensity equal to the minimum counts', ds: { episodes: [ep(at(MONDAY, '15:00'), { intensity: 2 })] }, expect: 'positive' },
  { name: 'null intensity counts', ds: { episodes: [ep(at(MONDAY, '15:00'), { intensity: null })] }, expect: 'positive' },
  { name: 'deleted episode does not count', ds: { episodes: [ep(at(MONDAY, '15:00'), { deleted: true })] }, expect: 'unknown' },
  { name: 'episode not yet happened (after now) does not count', ds: { episodes: [ep(at(MONDAY, '15:30'))] }, now: at(MONDAY, '15:00'), expect: 'unknown' },
  // rule 2: intervened
  { name: 'stepped_in response -> intervened', ds: { alerts: [alert('a')], alertResponses: [resp('a', 'stepped_in')] }, expect: 'intervened' },
  { name: 'naive policy: stepped_in -> negative_confirmed', ds: { alerts: [alert('a')], alertResponses: [resp('a', 'stepped_in')] },
    policy: 'naive', expect: 'negative_confirmed' },
  // rule 3: negative_confirmed
  { name: 'calm response -> negative_confirmed', ds: { alerts: [alert('a')], alertResponses: [resp('a', 'calm')] }, expect: 'negative_confirmed' },
  { name: 'day closed (all logged) after block end -> negative_confirmed', ds: { dayClosures: [closure(true, at(MONDAY, '20:30'))] }, expect: 'negative_confirmed' },
  { name: 'day closed exactly at block end -> negative_confirmed', ds: { dayClosures: [closure(true, B.end)] }, expect: 'negative_confirmed' },
  { name: 'day closed before the block ended -> unknown', ds: { dayClosures: [closure(true, at(MONDAY, '15:00'))] }, expect: 'unknown' },
  { name: '"I\'m not sure" closure (all_logged = 0) -> unknown', ds: { dayClosures: [closure(false, at(MONDAY, '20:30'))] }, expect: 'unknown' },
  { name: 'closure for another date does not apply', ds: { dayClosures: [closure(true, at(MONDAY, '20:30'), '2026-09-13')] }, expect: 'unknown' },
  { name: 'closure made after `now` is not yet known', ds: { dayClosures: [closure(true, at(MONDAY, '20:30'))] }, now: at(MONDAY, '18:00'), expect: 'unknown' },
  { name: 'latest closure for a date wins', ds: { dayClosures: [closure(true, at(MONDAY, '20:30')), closure(false, at(MONDAY, '21:00'))] }, expect: 'unknown' },
  // rule 4
  { name: 'nothing -> unknown', ds: {}, expect: 'unknown' },
  { name: 'happened response alone is not an episode (the app always creates one)', ds: { alerts: [alert('a')], alertResponses: [resp('a', 'happened')] }, expect: 'unknown' },
  // priority order
  { name: 'priority: episode beats stepped_in', ds: { episodes: [ep(at(MONDAY, '15:00'))], alerts: [alert('a')], alertResponses: [resp('a', 'stepped_in')] }, expect: 'positive' },
  { name: 'priority: episode beats calm', ds: { episodes: [ep(at(MONDAY, '15:00'))], alerts: [alert('a')], alertResponses: [resp('a', 'calm')] }, expect: 'positive' },
  { name: 'priority: episode beats a closed day', ds: { episodes: [ep(at(MONDAY, '15:00'))], dayClosures: [closure(true, at(MONDAY, '20:30'))] }, expect: 'positive' },
  { name: 'priority: stepped_in beats a closed day', ds: { alerts: [alert('a')], alertResponses: [resp('a', 'stepped_in')], dayClosures: [closure(true, at(MONDAY, '20:30'))] },
    expect: 'intervened' },
  // alert bookkeeping
  { name: 'responses to cancelled alerts are ignored', ds: { alerts: [alert('a', 'cancelled')], alertResponses: [resp('a', 'stepped_in')] }, expect: 'unknown' },
  { name: 'response to an alert for a different block is ignored', ds: { alerts: [alert('a', 'delivered', B.start + DAY_MS)], alertResponses: [resp('a', 'calm')] }, expect: 'unknown' },
  { name: 'latest response wins (edited from the Timeline)', ds: {
    alerts: [alert('a')], alertResponses: [resp('a', 'calm', B.end + 2 * HOUR_MS), resp('a', 'stepped_in', B.end + HOUR_MS)],
  }, expect: 'negative_confirmed' },
];

for (const c of CASES) {
  test(`label: ${c.name}`, () => {
    const li = buildLabelIndex(makeDataset(c.ds));
    assert.equal(labelBlock(li, B, c.policy ?? 'emolens', c.now ?? Infinity), c.expect);
  });
}

test('training weights: 0.5^(age/H) for positive and negative_confirmed, 0 for intervened and unknown', () => {
  const now = B.start + 90 * DAY_MS;
  assert.ok(Math.abs(labelWeight('positive', B.start, now, 90) - 0.5) < 1e-12);
  assert.ok(Math.abs(labelWeight('negative_confirmed', B.start, now, 45) - 0.25) < 1e-12);
  assert.equal(labelWeight('positive', B.start, B.start, 90), 1);
  assert.equal(labelWeight('positive', B.start, B.start - DAY_MS, 90), 1); // never above 1
  assert.equal(labelWeight('intervened', B.start, now, 90), 0);
  assert.equal(labelWeight('unknown', B.start, now, 90), 0);
});
