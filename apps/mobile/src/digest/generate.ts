/**
 * The weekly digest (SPEC 21), made on the phone at `digest_day_time` (default Sunday 18:00) or at the first forecast
 * run after it (app opened, app returned to, background refresh). Steps:
 *   1. which week is due (engine `latestDigestWeek`), and whether it already has a digest (one per week);
 *   2. read that week's logs, heads-ups, strategies, medications and sleep, plus the patterns from the last engine run
 *      and the previous digest (to report what changed);
 *   3. the ENGINE's `digestStats` turns them into plain numbers, saved as `digests.stats_json`;
 *   4. one notification: "{Nickname}'s weekly digest is ready." (no health details in the notification).
 * The words are written when the digest is shown (narrative.ts), so they follow the app's language. `narrative` stays
 * empty until the AI summary arrives (Phase 8).
 */
import * as Notifications from 'expo-notifications';
import { DAY_MS, type ChildProfile, type StrategyContext, type StrategyOutcome } from '@emolens/shared';
import {
  addDays, digestStats, latestDigestWeek, localDateOf, rangeBounds, type DigestStats, type InsightStatus, type WatchLite,
} from '@emolens/engine';
import { all, one, type Executor } from '../db/types';
import { iso, ms, newId, nowIso } from '../db/time';
import { recordError } from '../db/repo/errors';
import type { Settings } from '../db/repo/settings';
import type { Repo } from '../db/repo/writer';
import { loadHealth } from '../forecast/health';
import type { ForecastSnapshot } from '../forecast/snapshot';
import i18n from '../i18n';

export interface DigestRow { id: string; weekStart: string; stats: DigestStats; narrative: string | null; createdAt: string; }

/** Every digest of this child, newest first. */
export async function listDigests(ex: Executor, childId: string): Promise<DigestRow[]> {
  const rows = await all<{ id: string; week_start: string; stats_json: string; narrative: string | null; created_at: string }>(ex,
    'SELECT id, week_start, stats_json, narrative, created_at FROM digests WHERE child_id = ? ORDER BY week_start DESC', [childId]);
  return rows.flatMap((r) => {
    try { return [{ id: r.id, weekStart: r.week_start, stats: JSON.parse(r.stats_json) as DigestStats, narrative: r.narrative, createdAt: r.created_at }]; }
    catch { return []; }
  });
}

export async function getDigest(ex: Executor, childId: string, weekStart: string): Promise<DigestRow | null> {
  return (await listDigests(ex, childId)).find((d) => d.weekStart === weekStart) ?? null;
}

/** The first local date EmoLens has anything for this child (so empty weeks before it get no digest). */
async function dataSince(ex: Executor, profile: ChildProfile): Promise<string> {
  const r = await one<{ a: string | null; b: string | null; c: string | null }>(ex,
    `SELECT (SELECT MIN(started_at) FROM episodes WHERE child_id = ? AND deleted_at IS NULL) AS a,
            (SELECT MIN(created_at) FROM children WHERE id = ?) AS b,
            (SELECT MIN(sleep_end) FROM sleep_entries WHERE child_id = ? AND deleted_at IS NULL) AS c`, [profile.id, profile.id, profile.id]);
  const times = [r?.a, r?.b, r?.c].filter((x): x is string => !!x).map(ms);
  return localDateOf(times.length ? Math.min(...times) : Date.now(), profile.homeTz);
}

export interface WeekContext {
  /** Pattern statuses and worth-watching items as of the digest moment (null watch = not known). */
  statuses: Record<string, InsightStatus>;
  watch: WatchLite[] | null;
}

/** The context from the last engine run, for a digest made now. */
export function contextFromSnapshot(snap: ForecastSnapshot | null): WeekContext {
  const statuses: Record<string, InsightStatus> = {};
  for (const i of snap?.insights ?? []) statuses[i.key] = i.status;
  return { statuses, watch: snap ? snap.worthWatching.filter((w) => w.shown).map((w) => ({ id: w.id, kind: w.kind, label: w.label })) : null };
}

/** Reads a week's data and computes its stats (ENGINE `digestStats`). `now` = when the digest is made. */
export async function computeDigest(ex: Executor, profile: ChildProfile, weekStart: string, now: number, ctx: WeekContext): Promise<DigestStats> {
  const id = profile.id, tz = profile.homeTz;
  const weekEnd = addDays(weekStart, 6);
  const [from, to] = rangeBounds(weekStart, weekEnd, tz);
  const since = from - 35 * DAY_MS;
  const [episodes, closures, alerts, responses, health, strategies, uses, meds, doses, changes, sleep, prev, first] = await Promise.all([
    all<{ started_at: string; duration_min: number | null; type: 'meltdown' | 'shutdown' | 'other'; intensity: number | null }>(ex,
      'SELECT started_at, duration_min, type, intensity FROM episodes WHERE child_id = ? AND deleted_at IS NULL AND started_at >= ? AND started_at < ?',
      [id, iso(since), iso(to)]),
    all<{ local_date: string }>(ex, 'SELECT local_date FROM day_closures WHERE child_id = ? AND deleted_at IS NULL AND all_logged = 1 AND local_date <= ?', [id, weekEnd]),
    all<{ id: string; block_start: string; scheduled_for: string; status: 'scheduled' | 'delivered' | 'cancelled' | 'suppressed' }>(ex,
      'SELECT id, block_start, scheduled_for, status FROM alerts WHERE child_id = ? AND deleted_at IS NULL AND block_start >= ? AND block_start < ?', [id, iso(from), iso(to)]),
    all<{ alert_id: string; response: 'happened' | 'stepped_in' | 'calm'; responded_at: string }>(ex,
      `SELECT r.alert_id, r.response, r.responded_at FROM alert_responses r JOIN alerts a ON a.id = r.alert_id
       WHERE a.child_id = ? AND r.deleted_at IS NULL AND a.block_start >= ? AND a.block_start < ?`, [id, iso(from), iso(to)]),
    loadHealth(ex, id, Math.min(now, to)),
    all<{ id: string; name: string; category: string; active: number; onboarding_favorite: number }>(ex,
      'SELECT id, name, category, active, onboarding_favorite FROM strategies WHERE child_id = ? AND deleted_at IS NULL', [id]),
    all<{ id: string; strategy_id: string; context: StrategyContext; outcome: StrategyOutcome; used_at: string; episode_id: string | null; alert_id: string | null }>(ex,
      `SELECT id, strategy_id, context, outcome, used_at, episode_id, alert_id FROM strategy_uses
       WHERE child_id = ? AND deleted_at IS NULL AND used_at >= ? AND used_at < ?`, [id, iso(from), iso(to)]),
    all<{ id: string; name: string }>(ex, 'SELECT id, name FROM medications WHERE child_id = ? AND deleted_at IS NULL', [id]),
    all<{ medication_id: string; scheduled_for: string | null; status: 'pending' | 'taken' | 'late' | 'missed' | 'skipped' }>(ex,
      `SELECT d.medication_id, d.scheduled_for, d.status FROM med_doses d JOIN medications m ON m.id = d.medication_id
       WHERE m.child_id = ? AND d.deleted_at IS NULL AND d.scheduled_for >= ? AND d.scheduled_for < ?`, [id, iso(from), iso(to)]),
    all<{ medication_id: string; changed_at: string; change_type: 'start' | 'stop' | 'dose_change' | 'time_change' }>(ex,
      `SELECT c.medication_id, c.changed_at, c.change_type FROM medication_changes c JOIN medications m ON m.id = c.medication_id
       WHERE m.child_id = ? AND c.deleted_at IS NULL AND c.changed_at >= ? AND c.changed_at < ?`, [id, iso(from), iso(to)]),
    all<{ sleep_end: string; duration_min: number }>(ex,
      'SELECT sleep_end, duration_min FROM sleep_entries WHERE child_id = ? AND deleted_at IS NULL AND sleep_end >= ? AND sleep_end < ?',
      [id, iso(from - 30 * DAY_MS), iso(to)]),
    one<{ stats_json: string }>(ex, 'SELECT stats_json FROM digests WHERE child_id = ? AND week_start < ? ORDER BY week_start DESC LIMIT 1', [id, weekStart]),
    dataSince(ex, profile),
  ]);
  const prevStats = parseStats(prev?.stats_json);
  const skill = health.health.last28;
  return digestStats({
    weekStart, tz, now, dataSince: first,
    episodes: episodes.map((e) => ({ startedAt: ms(e.started_at), durationMin: e.duration_min, type: e.type, intensity: e.intensity })),
    closedDates: closures.map((c) => c.local_date),
    alerts: alerts.map((a) => ({ id: a.id, blockStart: ms(a.block_start), scheduledFor: ms(a.scheduled_for), status: a.status })),
    responses: responses.map((r) => ({ alertId: r.alert_id, response: r.response, respondedAt: ms(r.responded_at) })),
    skill28: skill.enough ? skill.skill : null,
    statuses: ctx.statuses,
    prevStatuses: prevStats?.insights.statuses ?? null,
    watch: ctx.watch,
    prevWatchIds: prevStats?.insights.watchIds ?? null,
    strategies: strategies.map((r) => ({ id: r.id, name: r.name, category: r.category, active: !!r.active, onboardingFavorite: !!r.onboarding_favorite })),
    uses: uses.map((u) => ({ id: u.id, strategyId: u.strategy_id, context: u.context, outcome: u.outcome, usedAt: ms(u.used_at), episodeId: u.episode_id, alertId: u.alert_id })),
    medications: meds, doses: doses.map((d) => ({ medicationId: d.medication_id, scheduledFor: d.scheduled_for ? ms(d.scheduled_for) : null, status: d.status })),
    medChanges: changes.map((c) => ({ medicationId: c.medication_id, changedAt: ms(c.changed_at), changeType: c.change_type })),
    sleep: sleep.map((s) => ({ sleepEnd: ms(s.sleep_end), durationMin: s.duration_min })),
    typicalSleepHours: profile.typicalSleepHours,
  });
}

/** A saved digest's numbers, or null when missing or unreadable. */
function parseStats(json: string | undefined): DigestStats | null {
  if (!json) return null;
  try { return JSON.parse(json) as DigestStats; } catch { return null; }
}

/** Saves a digest; returns false if that week already had one. */
export async function saveDigest(ex: Executor, childId: string, stats: DigestStats): Promise<boolean> {
  const r = await ex.execute('INSERT OR IGNORE INTO digests (id, child_id, week_start, stats_json, narrative, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
    [newId(), childId, stats.weekStart, JSON.stringify(stats), nowIso()]);
  return r.rowsAffected > 0;
}

/**
 * Makes the digest that is due now, if it doesn't exist yet and the child had data by the end of that week.
 * Returns its week's first day, or null when nothing was made. Never throws (errors go to the error log).
 */
export async function ensureDigest(repo: Repo, profile: ChildProfile, settings: Settings, snap: ForecastSnapshot | null, now: number,
  opts: { quiet?: boolean } = {}): Promise<string | null> {
  try {
    const { weekStart } = latestDigestWeek(now, profile.homeTz, settings.digest_day_time.weekday, settings.digest_day_time.time);
    if (await one(repo.db, 'SELECT 1 AS x FROM digests WHERE child_id = ? AND week_start = ?', [profile.id, weekStart])) return null;
    if (addDays(weekStart, 6) < await dataSince(repo.db, profile)) return null;
    const stats = await computeDigest(repo.db, profile, weekStart, now, contextFromSnapshot(snap));
    if (!(await saveDigest(repo.db, profile.id, stats))) return null;
    if (!opts.quiet) await notifyDigest(profile.nickname, weekStart);
    return weekStart;
  } catch (e) {
    await recordError(repo.db, 'digest', e);
    return null;
  }
}

async function notifyDigest(nickname: string, weekStart: string): Promise<void> {
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  await Notifications.scheduleNotificationAsync({
    identifier: `digest-${weekStart}`,
    content: { title: i18n.t('notif.digestTitle'), body: i18n.t('notif.digestBody', { name: nickname }),
      data: { kind: 'digest', url: `/digest/${weekStart}` }, categoryIdentifier: 'INFO' },
    trigger: null,
  });
}
