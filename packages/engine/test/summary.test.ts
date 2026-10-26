/**
 * Report and weekly-digest summaries (spec 21, 22.2) and the ABC export's antecedent factors (spec 22.3).
 * Hand-built data in America/New_York; 2026-09-14 is a Monday, 2026-11-01 is the fall-back DST day.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Strategy, StrategyUse } from '@emolens/shared';
import {
  adherence, antecedentFactors, digestStats, episodeSummary, latestDigestWeek, loggingStreak, previousPeriod, rangeBounds,
  sleepSummary, timeOfDayRows, todGroupOfHour, type DigestInput, type EpisodeLite,
} from '../src/index';
import { MONDAY, TZ, at } from './helpers';

const ep = (date: string, hhmm: string, over: Partial<EpisodeLite> = {}): EpisodeLite =>
  ({ startedAt: at(date, hhmm), durationMin: 10, type: 'meltdown', intensity: 3, ...over });

test('episodeSummary: counts by type, day and part of the day; averages; busiest day', () => {
  const s = episodeSummary([
    ep('2026-09-14', '08:00'), ep('2026-09-14', '15:30', { type: 'shutdown', intensity: 5, durationMin: 20 }),
    ep('2026-09-16', '19:00', { type: 'other', intensity: null, durationMin: null }),
    ep('2026-09-21', '12:00'), // outside the range
  ], '2026-09-14', '2026-09-20', TZ);
  assert.equal(s.total, 3);
  assert.deepEqual(s.byType, { meltdown: 1, shutdown: 1, other: 1 });
  assert.equal(s.avgIntensity, 4);           // (3 + 5) / 2; the unlogged intensity is left out
  assert.equal(s.totalDurationMin, 30);
  assert.equal(s.perDay.length, 7);
  assert.deepEqual(s.perDay.slice(0, 3).map((d) => d.count), [2, 0, 1]);
  assert.deepEqual(s.byTod, { morning: 1, midday: 0, afternoon: 1, evening: 1 });
  assert.deepEqual(s.busiestDay, { date: '2026-09-14', count: 2 });
});

test('episodeSummary: an empty range has no busiest day and no average', () => {
  const s = episodeSummary([], '2026-09-14', '2026-09-14', TZ);
  assert.equal(s.total, 0);
  assert.equal(s.busiestDay, null);
  assert.equal(s.avgIntensity, null);
});

test('episodeSummary: local dates across the fall-back DST day (25-hour day)', () => {
  // 23:30 local on 2026-11-01 is still Nov 1 even though the day had 25 hours.
  const s = episodeSummary([ep('2026-11-01', '23:30'), ep('2026-11-02', '00:30')], '2026-10-26', '2026-11-01', TZ);
  assert.equal(s.total, 1);
  assert.equal(s.perDay.at(-1)?.count, 1);
  const [a, b] = rangeBounds('2026-11-01', '2026-11-01', TZ);
  assert.equal((b - a) / 3_600_000, 25);
});

test('todGroupOfHour matches the model time-of-day features', () => {
  assert.deepEqual([6, 9, 10, 13, 14, 17, 18, 23].map(todGroupOfHour),
    ['morning', 'morning', 'midday', 'midday', 'afternoon', 'afternoon', 'evening', 'evening']);
});

test('previousPeriod: the same number of days just before', () => {
  assert.deepEqual(previousPeriod('2026-09-14', '2026-09-27'), { from: '2026-08-31', to: '2026-09-13' });
});

test('adherence: (taken + late) / scheduled; overdue pending counts as missed; future and as-needed doses are left out', () => {
  const now = at(MONDAY, '20:00');
  const [from, to] = rangeBounds(MONDAY, MONDAY, TZ);
  const a = adherence([
    { medicationId: 'm', scheduledFor: at(MONDAY, '08:00'), status: 'taken' },
    { medicationId: 'm', scheduledFor: at(MONDAY, '12:00'), status: 'late' },
    { medicationId: 'm', scheduledFor: at(MONDAY, '13:00'), status: 'pending' },  // > 4 h ago: missed
    { medicationId: 'm', scheduledFor: at(MONDAY, '18:00'), status: 'pending' },  // still in its window
    { medicationId: 'm', scheduledFor: at(MONDAY, '14:00'), status: 'skipped' },
    { medicationId: 'm', scheduledFor: at(MONDAY, '22:00'), status: 'pending' },  // later today
    { medicationId: 'm', scheduledFor: null, status: 'taken' },                    // as needed
  ], from, to, now);
  assert.deepEqual(a, { scheduled: 4, taken: 1, late: 1, missed: 1, skipped: 1, rate: 0.5 });
  assert.equal(adherence([], from, to, now).rate, null);
});

test('sleepSummary: nights ending in the range vs the median of the 28 nights before (or the typical hours)', () => {
  const night = (date: string, hours: number) => ({ sleepEnd: at(date, '07:00'), durationMin: hours * 60 });
  const before = [9, 9, 10, 10, 10, 11, 11].map((h, i) => night(`2026-09-0${i + 1}`, h));
  const s = sleepSummary([...before, night('2026-09-14', 8), night('2026-09-15', 9)], '2026-09-14', '2026-09-20', TZ, 9.5);
  assert.equal(s.nights, 2);
  assert.equal(s.avgHours, 8.5);
  assert.equal(s.refHours, 10);
  assert.equal(sleepSummary([], '2026-09-14', '2026-09-20', TZ, 9.5).refHours, 9.5);
});

test('loggingStreak: consecutive closed days ending at the given date', () => {
  assert.equal(loggingStreak(['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-16'], '2026-09-20'), 3);
  assert.equal(loggingStreak(['2026-09-19'], '2026-09-20'), 0);
});

test('latestDigestWeek: Sunday 18:00 local; before it, the previous week', () => {
  // Sunday 2026-09-20 at 18:30: this week's digest (Mon 14 .. Sun 20) is due.
  assert.equal(latestDigestWeek(at('2026-09-20', '18:30'), TZ, 7, '18:00').weekStart, '2026-09-14');
  assert.equal(latestDigestWeek(at('2026-09-20', '18:30'), TZ, 7, '18:00').readyAt, at('2026-09-20', '18:00'));
  // Sunday 17:59: still last week's.
  assert.equal(latestDigestWeek(at('2026-09-20', '17:59'), TZ, 7, '18:00').weekStart, '2026-09-07');
  // Wednesday: the week that ended last Sunday.
  assert.equal(latestDigestWeek(at('2026-09-23', '09:00'), TZ, 7, '18:00').weekStart, '2026-09-14');
  // A Friday 08:00 digest day.
  assert.equal(latestDigestWeek(at('2026-09-25', '08:00'), TZ, 5, '08:00').weekStart, '2026-09-19');
});

test('timeOfDayRows: rate per block from hard-moment and calm blocks only, with an 80% interval', () => {
  const rows = timeOfDayRows([
    { index: 4, label: 'positive' }, { index: 4, label: 'negative_confirmed' }, { index: 4, label: 'intervened' },
    { index: 4, label: 'unknown' }, { index: 5, label: 'negative_confirmed' },
  ], [4, 5, 6]);
  assert.deepEqual(rows.map((r) => [r.index, r.n, r.k, r.rate]), [[4, 2, 1, 0.5], [5, 1, 0, 0], [6, 0, 0, 0]]);
  for (const r of rows) assert.ok(r.lo80 <= r.hi80 && r.lo80 >= 0 && r.hi80 <= 1);
});

test('antecedentFactors: every shown factor with contribution >= 0.1, strongest first; no time of day, no hidden patterns', () => {
  const f = antecedentFactors({
    keys: ['intercept', 'tod_afternoon', 'sleep_deficit', 'planned_transitions', 'noise_high', 'illness', 'arrival_recent', 'recent_episode'],
    contributions: [2, 0.8, 0.4, 0.6, 0.05, 0.3, 0.9, 0.2],
    statuses: { sleep_deficit: 'strong', planned_transitions: 'likely', noise_high: 'likely', illness: 'possible', arrival_recent: 'checking' },
    estimated: [], params: { sleepDeficitHours: 2.1, transitions: 2 }, lang: 'en',
  });
  assert.deepEqual(f.map((r) => r.key), ['planned_transitions', 'sleep_deficit', 'illness', 'recent_episode']);
  assert.equal(f[0].text, '2 planned transitions in this window');
  assert.match(f[1].text, /2\.1 h less than usual/);
});

// ---------------------------------------------------------------------------------------------------------------------

const strategies: Strategy[] = [
  { id: 's1', name: 'Headphones', category: 'sensory', active: true, onboardingFavorite: false },
  { id: 's2', name: 'Quiet space', category: 'environment', active: true, onboardingFavorite: false },
];
const use = (id: string, strategyId: string, date: string, outcome: StrategyUse['outcome'], context: StrategyUse['context'] = 'during'): StrategyUse =>
  ({ id, strategyId, context, outcome, usedAt: at(date, '12:00'), episodeId: null, alertId: null });

function digestInput(over: Partial<DigestInput> = {}): DigestInput {
  return {
    weekStart: MONDAY, tz: TZ, now: at('2026-09-20', '18:05'), dataSince: '2026-08-01',
    episodes: [ep('2026-09-14', '15:00'), ep('2026-09-15', '15:00'), ep('2026-09-16', '19:00'),
      ep('2026-09-08', '15:00'), ep('2026-09-01', '15:00'), ep('2026-09-02', '15:00'), ep('2026-08-25', '15:00')],
    closedDates: ['2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-10'],
    alerts: [
      { id: 'a1', blockStart: at('2026-09-14', '14:00'), scheduledFor: at('2026-09-14', '13:30'), status: 'delivered' },
      { id: 'a2', blockStart: at('2026-09-18', '14:00'), scheduledFor: at('2026-09-18', '13:30'), status: 'delivered' },
      { id: 'a3', blockStart: at('2026-09-10', '14:00'), scheduledFor: at('2026-09-10', '13:30'), status: 'delivered' },
    ],
    responses: [
      { alertId: 'a1', response: 'happened', respondedAt: at('2026-09-14', '16:00') },
      { alertId: 'a2', response: 'calm', respondedAt: at('2026-09-18', '16:00') },
    ],
    skill28: 0.05,
    statuses: { sleep_deficit: 'likely', planned_transitions: 'possible', high_sugar_recent: 'no_clear_link', noise_high: 'not_enough_data' },
    prevStatuses: { sleep_deficit: 'possible', planned_transitions: 'possible', noise_high: 'checking' },
    watch: [{ id: 'food:pizza', kind: 'food', label: 'pizza' }, { id: 'place:p1', kind: 'place', label: 'Store' }],
    prevWatchIds: ['place:p1'],
    strategies,
    uses: [use('u1', 's1', '2026-09-14', 'helped'), use('u2', 's1', '2026-09-15', 'not_helped'), use('u3', 's1', '2026-09-16', 'unsure'),
      use('u4', 's2', '2026-09-15', 'helped'), use('u5', 's2', '2026-09-16', 'helped'), use('u6', 's2', '2026-09-07', 'not_helped')],
    medications: [{ id: 'm1', name: 'Medication A' }],
    doses: [
      { medicationId: 'm1', scheduledFor: at('2026-09-14', '08:00'), status: 'taken' },
      { medicationId: 'm1', scheduledFor: at('2026-09-15', '08:00'), status: 'missed' },
      { medicationId: 'm1', scheduledFor: at('2026-09-16', '08:00'), status: 'late' },
      { medicationId: 'm1', scheduledFor: at('2026-09-16', '08:00') - 7 * 86_400_000, status: 'missed' }, // last week
    ],
    medChanges: [{ medicationId: 'm1', changedAt: at('2026-09-17', '09:00'), changeType: 'dose_change' }],
    sleep: [{ sleepEnd: at('2026-09-15', '07:00'), durationMin: 540 }],
    typicalSleepHours: 10,
    ...over,
  };
}

test('digestStats: the week, last week and the 4-week average', () => {
  const d = digestStats(digestInput());
  assert.equal(d.weekStart, '2026-09-14');
  assert.equal(d.weekEnd, '2026-09-20');
  assert.equal(d.episodes.total, 3);
  assert.equal(d.prevWeekTotal, 1);                    // 2026-09-07 .. 13
  assert.equal(d.avg4Weeks, (1 + 2 + 1 + 0) / 4);      // weeks starting 09-07, 08-31, 08-24, 08-17
  assert.deepEqual(d.episodes.byTod, { morning: 0, midday: 0, afternoon: 2, evening: 1 });
});

test('digestStats: weeks before EmoLens had data are left out of the comparisons', () => {
  // Data starts on Sat 09-05: the week of 08-31 counts (it has data days), the weeks before it don't.
  const d = digestStats(digestInput({ dataSince: '2026-09-05' }));
  assert.equal(d.prevWeekTotal, 1);
  assert.equal(d.avg4Weeks, (1 + 2) / 2);
  const first = digestStats(digestInput({ dataSince: '2026-09-14' }));
  assert.equal(first.prevWeekTotal, null);
  assert.equal(first.avg4Weeks, null);
});

test('digestStats: logging, forecasts, medications, sleep', () => {
  const d = digestStats(digestInput());
  assert.deepEqual(d.logging, { daysClosed: 4, streak: 4 });
  assert.deepEqual(d.forecasts, { delivered: 2, happened: 1, steppedIn: 0, calm: 1, noAnswer: 0, hitRate: 0.5, skill28: 0.05 });
  assert.equal(d.medications.perMed.length, 1);
  assert.equal(d.medications.perMed[0].scheduled, 3);
  assert.equal(d.medications.overall, 2 / 3);
  assert.deepEqual(d.medications.changes.map((c) => [c.name, c.changeType]), [['Medication A', 'dose_change']]);
  assert.equal(d.sleep.nights, 1);
  assert.equal(d.sleep.avgHours, 9);
  assert.equal(d.sleep.refHours, 10);
});

test('digestStats: strategies: most used, and best with at least 2 answered uses', () => {
  const d = digestStats(digestInput());
  assert.deepEqual(d.strategies.mostUsed, { strategyId: 's1', name: 'Headphones', uses: 3 });
  assert.deepEqual(d.strategies.best, { strategyId: 's2', name: 'Quiet space', successes: 2, total: 2 });
});

test('digestStats: pattern changes since the previous digest, and new worth-watching items', () => {
  const d = digestStats(digestInput());
  // sleep possible -> likely is news; sugar "no clear link" without having been a link isn't; noise isn't reported.
  assert.deepEqual(d.insights.changes, [{ key: 'sleep_deficit', from: 'possible', to: 'likely' }]);
  assert.deepEqual(d.insights.newWatch.map((w) => w.id), ['food:pizza']);
  assert.deepEqual(d.insights.watchIds, ['food:pizza', 'place:p1']);

  const weaker = digestStats(digestInput({ statuses: { sleep_deficit: 'no_clear_link' }, prevStatuses: { sleep_deficit: 'likely' } }));
  assert.deepEqual(weaker.insights.changes, [{ key: 'sleep_deficit', from: 'likely', to: 'no_clear_link' }]);
  const newlyFound = digestStats(digestInput({ statuses: { illness: 'possible' }, prevStatuses: {} }));
  assert.deepEqual(newlyFound.insights.changes, [{ key: 'illness', from: null, to: 'possible' }]);
});

test('digestStats: the first digest reports no changes and no "new" items', () => {
  const d = digestStats(digestInput({ prevStatuses: null, prevWatchIds: null }));
  assert.deepEqual(d.insights.changes, []);
  assert.deepEqual(d.insights.newWatch, []);
});

test('digestStats: a week whose worth-watching list is unknown stores null and reports nothing new', () => {
  const d = digestStats(digestInput({ watch: null }));
  assert.equal(d.insights.watchIds, null);
  assert.deepEqual(d.insights.newWatch, []);
});

test('digestStats is plain JSON (stored in digests.stats_json)', () => {
  const d = digestStats(digestInput());
  assert.deepEqual(JSON.parse(JSON.stringify(d)), d);
});
