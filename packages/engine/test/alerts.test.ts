/**
 * Spec 30.1 "Alerts": quiet hours, daily max, cooldown, learning period, lead time, in-progress block,
 * cancellation when the level drops (spec 15.2).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RiskLevel } from '@emolens/shared';
import { MINUTE_MS } from '@emolens/shared';
import { addDays, inQuietHours, planAlerts, type AlertPlanInput, type ExistingAlert, type UpcomingBlock } from '../src/index';
import { MONDAY, TZ, at, blockOf } from './helpers';

const up = (k: number, level: RiskLevel = 'high', date = MONDAY): UpcomingBlock => {
  const b = blockOf(date, k);
  return { start: b.start, end: b.end, localDate: date, level };
};
const existing = (id: string, k: number, status: ExistingAlert['status'], scheduledFor?: number, date = MONDAY): ExistingAlert => {
  const b = blockOf(date, k);
  return { id, blockStart: b.start, localDate: date, scheduledFor: scheduledFor ?? b.start - 30 * MINUTE_MS, status };
};
const input = (over: Partial<AlertPlanInput>): AlertPlanInput => ({
  now: at(MONDAY, '06:00'), tz: TZ, blocks: [], existing: [], episodeTimes: [],
  quietHours: { start: '21:00', end: '07:00' }, maxPerDay: 3, learning: false, earlyAlertsEnabled: false, ...over,
});

test('lead time: fire 30 min before the block, confirm 30 min after it ends', () => {
  const plan = planAlerts(input({ now: at(MONDAY, '09:00'), blocks: [up(7)] }));
  assert.equal(plan.create.length, 1);
  assert.equal(plan.create[0].fireAt, at(MONDAY, '13:30'));
  assert.equal(plan.create[0].confirmAt, at(MONDAY, '16:30'));
  assert.equal(plan.create[0].localDate, MONDAY);
});

test('only high blocks get alerts', () => {
  const plan = planAlerts(input({ blocks: [up(5, 'moderate'), up(7, 'low'), up(9, 'learning')] }));
  assert.equal(plan.create.length + plan.suppress.length, 0);
});

test('quiet hours: overnight window wraps past midnight', () => {
  const q = { start: '21:00', end: '07:00' };
  assert.equal(inQuietHours(at(MONDAY, '22:00'), TZ, q), true);
  assert.equal(inQuietHours(at(MONDAY, '06:59'), TZ, q), true);
  assert.equal(inQuietHours(at(MONDAY, '21:00'), TZ, q), true);
  assert.equal(inQuietHours(at(MONDAY, '07:00'), TZ, q), false);
  assert.equal(inQuietHours(at(MONDAY, '20:59'), TZ, q), false);
  assert.equal(inQuietHours(at(MONDAY, '13:30'), TZ, { start: '13:00', end: '14:00' }), true);
  assert.equal(inQuietHours(at(MONDAY, '14:00'), TZ, { start: '13:00', end: '14:00' }), false);
});

test('quiet hours: a 6-8 am block (fire 5:30) is suppressed; the next block is still alerted', () => {
  const plan = planAlerts(input({ now: at(addDays(MONDAY, -1), '20:00'), blocks: [up(3), up(4)] }));
  assert.deepEqual(plan.suppress.map((s) => s.reason), ['quiet_hours']);
  assert.equal(plan.suppress[0].blockStart, blockOf(MONDAY, 3).start);
  assert.deepEqual(plan.create.map((c) => c.blockStart), [blockOf(MONDAY, 4).start]);
});

test('daily max counts new and existing alerts on the same local date only', () => {
  let plan = planAlerts(input({ maxPerDay: 2, blocks: [up(4), up(7), up(10)] })); // fires 7:30, 13:30, 19:30
  assert.equal(plan.create.length, 2);
  assert.deepEqual(plan.suppress.map((s) => [s.blockStart, s.reason]), [[blockOf(MONDAY, 10).start, 'daily_max']]);

  plan = planAlerts(input({
    now: at(MONDAY, '12:00'), maxPerDay: 2, blocks: [up(9)],
    existing: [existing('a', 3, 'delivered', at(MONDAY, '06:00')), existing('b', 4, 'delivered')],
  }));
  assert.deepEqual(plan.suppress.map((s) => s.reason), ['daily_max']);

  // alerts on another date don't count; cancelled/suppressed ones don't either
  plan = planAlerts(input({
    now: at(MONDAY, '12:00'), maxPerDay: 2, blocks: [up(9)],
    existing: [existing('a', 4, 'delivered', undefined, addDays(MONDAY, -1)), existing('b', 5, 'delivered', undefined, addDays(MONDAY, -1)),
      existing('c', 4, 'cancelled'), existing('d', 5, 'suppressed')],
  }));
  assert.equal(plan.create.length, 1);
});

test('cooldown: no two alerts within 180 minutes', () => {
  const plan = planAlerts(input({ blocks: [up(6), up(7), up(9)] })); // fires 11:30, 13:30, 17:30
  assert.deepEqual(plan.create.map((c) => c.fireAt), [at(MONDAY, '11:30'), at(MONDAY, '17:30')]);
  assert.deepEqual(plan.suppress.map((s) => s.reason), ['cooldown']);

  const withExisting = planAlerts(input({ now: at(MONDAY, '07:00'), blocks: [up(6)], existing: [existing('a', 5, 'scheduled', at(MONDAY, '09:30'))] }));
  assert.deepEqual(withExisting.suppress.map((s) => s.reason), ['cooldown']);

  const exactly180 = planAlerts(input({ now: at(MONDAY, '07:00'), blocks: [up(6)], existing: [existing('a', 5, 'scheduled', at(MONDAY, '08:30'))] }));
  assert.equal(exactly180.create.length, 1);
});

test('learning period: suppressed unless early alerts are enabled', () => {
  const off = planAlerts(input({ learning: true, blocks: [up(7)] }));
  assert.deepEqual(off.suppress.map((s) => s.reason), ['learning']);
  assert.equal(off.create.length, 0);
  const on = planAlerts(input({ learning: true, earlyAlertsEnabled: true, blocks: [up(7)] }));
  assert.equal(on.create.length, 1);
});

test('in-progress block: alert now if >= 30 min remain, otherwise skip', () => {
  const now = at(MONDAY, '14:20');
  const mid = planAlerts(input({ now, blocks: [up(7)] }));
  assert.equal(mid.create[0].fireAt, now + 5000);

  const late = planAlerts(input({ now: at(MONDAY, '15:31'), blocks: [up(7)] }));
  assert.equal(late.create.length + late.suppress.length, 0);

  const edge = planAlerts(input({ now: at(MONDAY, '15:29'), blocks: [up(7)] }));
  assert.equal(edge.create.length, 1);

  const ended = planAlerts(input({ now: at(MONDAY, '16:00'), blocks: [up(7)] }));
  assert.equal(ended.create.length + ended.suppress.length, 0);
});

test('recent episode: skip an immediate alert if an episode was logged in the 60 min before', () => {
  const now = at(MONDAY, '14:20');
  const recent = planAlerts(input({ now, blocks: [up(7)], episodeTimes: [at(MONDAY, '14:00')] }));
  assert.deepEqual(recent.suppress.map((s) => s.reason), ['recent_episode']);
  const older = planAlerts(input({ now, blocks: [up(7)], episodeTimes: [at(MONDAY, '13:00')] }));
  assert.equal(older.create.length, 1);
  // not checkable for alerts scheduled in the future
  const future = planAlerts(input({ now: at(MONDAY, '09:00'), blocks: [up(7)], episodeTimes: [at(MONDAY, '08:50')] }));
  assert.equal(future.create.length, 1);
});

test('cancellation: scheduled alerts whose block is no longer high are cancelled', () => {
  const now = at(MONDAY, '09:00');
  const plan = planAlerts(input({
    now, blocks: [up(7, 'moderate'), up(9, 'low'), up(10, 'high')],
    existing: [existing('a', 7, 'scheduled'), existing('b', 9, 'delivered'), existing('c', 10, 'scheduled')],
  }));
  assert.deepEqual(plan.cancel, ['a']);      // delivered alerts are never cancelled; still-high ones stay
  assert.equal(plan.create.length, 0);        // block 10 already has a live alert
});

test('a cancelled alert frees its block and its cooldown slot', () => {
  const plan = planAlerts(input({
    now: at(MONDAY, '09:00'), blocks: [up(6, 'low'), up(7, 'high')],
    existing: [existing('a', 6, 'scheduled')],   // fires 11:30; would block 13:30 by cooldown
  }));
  assert.deepEqual(plan.cancel, ['a']);
  assert.equal(plan.create.length, 1);
  const again = planAlerts(input({ now: at(MONDAY, '09:00'), blocks: [up(7)], existing: [existing('x', 7, 'cancelled')] }));
  assert.equal(again.create.length, 1);
});

test('scheduled alerts whose fire time has passed are marked delivered, not cancelled', () => {
  const plan = planAlerts(input({
    now: at(MONDAY, '14:10'), blocks: [up(7, 'low')], existing: [existing('a', 7, 'scheduled')],
  }));
  assert.deepEqual(plan.deliver, ['a']);
  assert.deepEqual(plan.cancel, []);
});

test('no duplicate alert for a block that already has one', () => {
  const plan = planAlerts(input({ now: at(MONDAY, '09:00'), blocks: [up(7)], existing: [existing('a', 7, 'scheduled')] }));
  assert.equal(plan.create.length + plan.suppress.length, 0);
  const suppressed = planAlerts(input({ now: at(MONDAY, '09:00'), blocks: [up(7)], existing: [existing('a', 7, 'suppressed')] }));
  assert.equal(suppressed.create.length, 0);
});
