/**
 * Phase 5 acceptance (SPEC 32): demo mode is filled from the simulator, and alert -> confirm -> label -> refit works
 * end to end. Uses a real SQLite database (better-sqlite3) and the real engine and simulator; 30 simulated days
 * instead of 120 to keep the test quick.
 */
import * as Notifications from 'expo-notifications';
import { SUSPECTED_TRIGGERS } from '@emolens/shared';
import { DEMO_SUSPECTED } from '@emolens/simulator';
import { buildDemo } from '../src/demo/build';
import { getChild, toChildProfile } from '../src/db/repo/children';
import { answerAlert, finishFollowup, openFollowups, pendingConfirmations } from '../src/db/repo/alerts';
import { closeDay } from '../src/db/repo/closures';
import { getAllSettings } from '../src/db/repo/settings';
import type { Repo } from '../src/db/repo/writer';
import { iso } from '../src/db/time';
import { all, one } from '../src/db/types';
import { syncAlerts } from '../src/forecast/alerts';
import { updateForecast } from '../src/forecast/update';
import { readSnapshot, type ForecastSnapshot } from '../src/forecast/snapshot';
import { runEngine } from '@emolens/engine';
import { loadDataset } from '../src/forecast/dataset';
import { testRepo } from './nodeDb';

jest.setTimeout(120_000);

const TZ = 'America/New_York';
// Tuesday 2026-09-29, 11:10 in New York
const NOW = Date.parse('2026-09-29T15:10:00.000Z');
const MIN = 60_000;

async function demo(): Promise<{ repo: Repo; profile: ReturnType<typeof toChildProfile> }> {
  const repo = await testRepo();
  await buildDemo(repo, { lang: 'en', tz: TZ, now: NOW, days: 30, yieldToUi: false });
  const row = await getChild(repo.db);
  const profile = toChildProfile(row!, SUSPECTED_TRIGGERS.filter((t) => DEMO_SUSPECTED.includes(t.id)).map((t) => t.id));
  return { repo, profile };
}

const count = async (repo: Repo, sql: string, params: (string | number)[] = []) => Number((await one<{ n: number }>(repo.db, sql, params))?.n ?? 0);
const labelOf = async (repo: Repo, blockStart: number) =>
  (await one<{ label_status: string }>(repo.db, 'SELECT label_status FROM blocks WHERE block_start = ?', [iso(blockStart)]))?.label_status;

/** Forces one upcoming block to "high" in a copy of the snapshot and lets the real alert code act on it. */
async function alertFor(repo: Repo, profile: ReturnType<typeof toChildProfile>, snap: ForecastSnapshot, pick: number) {
  const upcoming = snap.forecasts.filter((f) => f.start > NOW + 60 * MIN && f.localDate === '2026-09-29');
  const target = upcoming[pick];
  const forced = { ...snap, learning: false, forecasts: snap.forecasts.map((f) => (f.start === target.start ? { ...f, level: 'high' as const } : { ...f, level: 'low' as const })) };
  const settings = await getAllSettings(repo.db);
  const sync = await syncAlerts(repo, profile, settings, forced, NOW);
  expect(sync.created).toBe(1);
  const alert = await one<{ id: string; scheduled_for: string; status: string }>(repo.db, 'SELECT id, scheduled_for, status FROM alerts WHERE block_start = ?', [iso(target.start)]);
  return { target, alert: alert! };
}

describe('demo mode filled from the simulator', () => {
  test('30 simulated days give blocks, labels, daily fits, day-ahead predictions and a live forecast for today', async () => {
    const t0 = Date.now();
    const { repo, profile } = await demo();
    const ms = Date.now() - t0;
    expect(profile.nickname).toBe('Sam (demo)');
    expect(await count(repo, 'SELECT COUNT(*) AS n FROM episodes')).toBeGreaterThan(3);
    expect(await count(repo, 'SELECT COUNT(*) AS n FROM model_fits')).toBeGreaterThanOrEqual(30);
    expect(await count(repo, "SELECT COUNT(*) AS n FROM predictions WHERE kind = 'day_ahead'")).toBeGreaterThan(200);
    expect(await count(repo, "SELECT COUNT(*) AS n FROM blocks WHERE label_status IN ('positive', 'negative_confirmed')")).toBeGreaterThan(100);
    expect(await count(repo, 'SELECT COUNT(*) AS n FROM blocks WHERE dirty = 1 AND block_start < ?', [iso(NOW)])).toBe(0);
    expect(await count(repo, 'SELECT COUNT(*) AS n FROM strategy_uses')).toBeGreaterThan(0);

    const snap = (await readSnapshot(repo.db, profile.id))!;
    expect(snap.fitError).toBeNull();
    expect(snap.forecasts.some((f) => f.localDate === '2026-09-29')).toBe(true);
    expect(snap.forecasts.some((f) => f.localDate === '2026-09-30')).toBe(true);
    expect(snap.labeledDays).toBeGreaterThanOrEqual(14);
    expect(snap.insights.filter((i) => i.status !== 'hidden').length).toBeGreaterThan(5);
    for (const f of snap.forecasts) {
      expect(f.pLo).toBeLessThanOrEqual(f.p);
      expect(f.p).toBeLessThanOrEqual(f.pHi);
    }
    // Weather and calendar come from the simulation, so they count as connected in the demo.
    expect(snap.enabled.weather).toBe(true);
    expect(snap.enabled.calendar).toBe(true);
    // Real data sources stay off in the demo (nothing from the phone mixes in).
    const settings = await getAllSettings(repo.db);
    expect(Object.values(settings.integration_state).every((s) => !s.enabled)).toBe(true);
    expect(settings.demo_info?.days).toBeGreaterThanOrEqual(30); // moved back to a Monday: 30-36 days
    expect(settings.demo_info?.days).toBeLessThanOrEqual(36);
    console.log(`demo build (30 days) took ${ms} ms; engine ${Math.round(snap.engineMs)} ms`);
  });

  test('a second forecast run reuses stored features (only new blocks are recomputed)', async () => {
    const { repo, profile } = await demo();
    const again = await updateForecast(repo, profile, { now: NOW + 5 * MIN });
    expect(again.recompute?.recomputed).toBe(0);
    const later = await updateForecast(repo, profile, { now: NOW + 3 * 60 * MIN });
    expect(later.recompute?.recomputed).toBeGreaterThanOrEqual(1);
    expect(later.recompute?.recomputed).toBeLessThanOrEqual(2);
  });

  test('the day-ahead snapshot is never overwritten; the in-block forecast is replaced', async () => {
    const { repo, profile } = await demo();
    const before = await all<{ id: string; block_start: string; p: number }>(repo.db, "SELECT id, block_start, p FROM predictions WHERE kind = 'day_ahead' AND block_start >= ?", [iso(NOW)]);
    expect(before.length).toBeGreaterThan(0); // yesterday 18:00's forecasts for today
    await updateForecast(repo, profile, { now: NOW + 10 * MIN });
    await updateForecast(repo, profile, { now: NOW + 20 * MIN });
    const after = await all<{ id: string; block_start: string; p: number }>(repo.db, "SELECT id, block_start, p FROM predictions WHERE kind = 'day_ahead' AND block_start >= ? AND block_start < ?",
      [iso(NOW), iso(Date.parse('2026-09-30T04:00:00Z'))]);
    expect(after.map((r) => r.id).sort()).toEqual(before.filter((r) => r.block_start < '2026-09-30T04').map((r) => r.id).sort());
    expect(await count(repo, "SELECT COUNT(*) AS n FROM predictions WHERE kind = 'in_block'")).toBe(1);
    // At 18:00 the forecasts for tomorrow become tomorrow's day-ahead snapshot.
    await updateForecast(repo, profile, { now: Date.parse('2026-09-29T22:05:00Z') });
    expect(await count(repo, "SELECT COUNT(*) AS n FROM predictions WHERE kind = 'day_ahead' AND block_start >= ?", [iso(Date.parse('2026-09-30T04:00:00Z'))])).toBeGreaterThan(0);
  });
  test('demo hard moments have realistic details (place, tags, lengths, notes), and the model never uses them', async () => {
    const { repo, profile } = await demo();
    const rows = await all<{ place_type: string | null; antecedent_tags: string; behavior_tags: string; duration_min: number | null; notes: string | null;
      details_complete: number; source: string }>(repo.db, 'SELECT place_type, antecedent_tags, behavior_tags, duration_min, notes, details_complete, source FROM episodes');
    const full = rows.filter((r) => r.details_complete === 1);
    expect(full.length).toBeGreaterThan(0);
    expect(full.every((r) => r.place_type != null && JSON.parse(r.antecedent_tags).length > 0 && JSON.parse(r.behavior_tags).length > 0 && r.duration_min != null)).toBe(true);
    expect(new Set(full.map((r) => r.duration_min)).size).toBeGreaterThan(2);
    // some are left blank, like a busy parent's log (fast-path saves and busy days)
    expect(rows.filter((r) => r.details_complete === 0).every((r) => r.antecedent_tags === '[]' && r.duration_min == null && r.notes == null)).toBe(true);

    // The engine gives exactly the same result with every detail removed.
    const settings = await getAllSettings(repo.db);
    const ds = await loadDataset(repo.db, profile, settings, NOW);
    const bare = { ...ds, episodes: ds.episodes.map((e) => ({ ...e, placeType: null, antecedentTags: [], behaviorTags: [], notes: null, durationMin: 15 })) };
    const a = runEngine(ds, NOW), b = runEngine(bare, NOW);
    expect(a.fit.beta).toEqual(b.fit.beta);
    expect(a.forecasts).toEqual(b.forecasts);
    expect(a.insights).toEqual(b.insights);
    expect(a.worthWatching).toEqual(b.worthWatching);
  });
});

describe('alert -> confirm -> label -> refit (SPEC 15, acceptance)', () => {
  test('"All calm": the block becomes calm and the next fit has one more labeled block', async () => {
    const { repo, profile } = await demo();
    const snap = (await readSnapshot(repo.db, profile.id))!;
    (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();
    const { target, alert } = await alertFor(repo, profile, snap, 0);
    expect(Date.parse(alert.scheduled_for)).toBe(target.start - 30 * MIN);
    const ids = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.map((c) => c[0].identifier);
    expect(ids).toEqual([`risk-${alert.id}`, `confirm-${alert.id}`]);

    const after = target.end + 31 * MIN;
    const base = await updateForecast(repo, profile, { now: after });
    expect(await labelOf(repo, target.start)).toBe('unknown');
    expect((await pendingConfirmations(repo.db, profile.id, after, iso(after - 86_400_000))).map((p) => p.id)).toEqual([alert.id]);

    await answerAlert(repo, profile, alert.id, 'calm', after);
    const refit = await updateForecast(repo, profile, { now: after + MIN });
    expect(await labelOf(repo, target.start)).toBe('negative_confirmed');
    expect(refit.snapshot.labeledBlocks).toBe(base.snapshot.labeledBlocks + 1);
    expect(refit.result!.fit.beta).not.toEqual(base.result!.fit.beta);
    expect(await pendingConfirmations(repo.db, profile.id, after + MIN, iso(after - 86_400_000))).toEqual([]);
  });

  test('"A hard moment happened": a fast-path hard moment is saved at the midpoint and the block turns positive', async () => {
    const { repo, profile } = await demo();
    const snap = (await readSnapshot(repo.db, profile.id))!;
    const { target, alert } = await alertFor(repo, profile, snap, 1);
    const after = target.end + 40 * MIN;
    const base = await updateForecast(repo, profile, { now: after });
    const res = await answerAlert(repo, profile, alert.id, 'happened', after);
    const ep = await one<{ started_at: string; source: string; details_complete: number }>(repo.db, 'SELECT started_at, source, details_complete FROM episodes WHERE id = ?', [res.episodeId!]);
    expect(ep).toMatchObject({ source: 'alert_confirm', details_complete: 0, started_at: iso((target.start + target.end) / 2) });
    const refit = await updateForecast(repo, profile, { now: after + MIN });
    expect(await labelOf(repo, target.start)).toBe('positive');
    expect(refit.snapshot.positives).toBe(base.snapshot.positives + 1);
    // Answering again later does not add a second hard moment.
    await answerAlert(repo, profile, alert.id, 'happened', after + 2 * MIN);
    expect(await count(repo, 'SELECT COUNT(*) AS n FROM episodes WHERE started_at >= ? AND started_at < ?', [iso(target.start), iso(target.end)])).toBe(1);
  });

  test('"We stepped in early": the block is left out of training and "What did you try?" credits the strategy', async () => {
    const { repo, profile } = await demo();
    const snap = (await readSnapshot(repo.db, profile.id))!;
    const { target, alert } = await alertFor(repo, profile, snap, 0);
    const after = target.end + 35 * MIN;
    const base = await updateForecast(repo, profile, { now: after });
    await answerAlert(repo, profile, alert.id, 'stepped_in', after);
    const refit = await updateForecast(repo, profile, { now: after + MIN });
    expect(await labelOf(repo, target.start)).toBe('intervened');
    expect(refit.snapshot.labeledBlocks).toBe(base.snapshot.labeledBlocks); // excluded from the risk model (intervention trap)

    const [f] = await openFollowups(repo.db, profile.id, after + MIN);
    expect(f.alert_id).toBe(alert.id);
    const strategy = await one<{ id: string }>(repo.db, 'SELECT id FROM strategies LIMIT 1');
    await finishFollowup(repo, profile.id, f, [strategy!.id]);
    expect(await openFollowups(repo.db, profile.id, after + MIN)).toEqual([]);
    // No hard moment within 90 minutes and the block is labeled: the recompute job marks the strategy "averted".
    await updateForecast(repo, profile, { now: after + 2 * MIN });
    const use = await one<{ outcome: string; context: string }>(repo.db, 'SELECT outcome, context FROM strategy_uses WHERE alert_id = ?', [alert.id]);
    expect(use).toEqual({ outcome: 'averted', context: 'proactive' });
  });

  test('the level dropping before the heads-up fires cancels the alert and its notifications', async () => {
    const { repo, profile } = await demo();
    const snap = (await readSnapshot(repo.db, profile.id))!;
    const { target, alert } = await alertFor(repo, profile, snap, 0);
    const calm = { ...snap, learning: false, forecasts: snap.forecasts.map((f) => ({ ...f, level: 'low' as const })) };
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockClear();
    const sync = await syncAlerts(repo, profile, await getAllSettings(repo.db), calm, NOW + MIN);
    expect(sync.cancelled).toBe(1);
    expect((await one<{ status: string }>(repo.db, 'SELECT status FROM alerts WHERE id = ?', [alert.id]))?.status).toBe('cancelled');
    expect(target.start).toBeGreaterThan(NOW);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
  });
});

describe('end-of-day check (SPEC 16)', () => {
  test('"No, that\'s everything" makes the day\'s ended blocks calm; the morning follow-up covers the evening', async () => {
    const { repo, profile } = await demo();
    const eod = Date.parse('2026-09-30T00:30:00Z'); // 20:30 in New York
    await updateForecast(repo, profile, { now: eod });
    const before = await all<{ block_start: string; block_end: string; label_status: string }>(repo.db,
      "SELECT block_start, block_end, label_status FROM blocks WHERE local_date = '2026-09-29' ORDER BY block_start");
    await closeDay(repo, profile.id, TZ, '2026-09-29', true, iso(eod));
    await updateForecast(repo, profile, { now: eod + MIN });
    const labels = await all<{ block_start: string; block_end: string; label_status: string }>(repo.db,
      "SELECT block_start, block_end, label_status FROM blocks WHERE local_date = '2026-09-29' ORDER BY block_start");
    for (const b of labels) {
      const prev = before.find((x) => x.block_start === b.block_start)!;
      if (b.block_end <= iso(eod) && prev.label_status === 'unknown') expect(b.label_status).toBe('negative_confirmed');
      if (b.block_end > iso(eod)) expect(b.label_status).toBe('unknown');
    }
    // next morning: "Anything happen after 8:30 pm?" -> No
    const morning = Date.parse('2026-09-30T11:30:00Z');
    await closeDay(repo, profile.id, TZ, '2026-09-29', true, iso(morning));
    await updateForecast(repo, profile, { now: morning + MIN });
    const evening = await all<{ label_status: string }>(repo.db, "SELECT label_status FROM blocks WHERE local_date = '2026-09-29' AND block_end > ?", [iso(eod)]);
    expect(evening.length).toBeGreaterThan(0);
    expect(evening.every((b) => b.label_status === 'negative_confirmed')).toBe(true);
  });
});
