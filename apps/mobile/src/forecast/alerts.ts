/**
 * After every forecast (SPEC 15.2): the ENGINE's `planAlerts` decides which alerts to create, cancel, mark delivered or
 * suppress (quiet hours, daily max, cooldown, recent hard moment, learning period). This file carries the decisions
 * out: `alerts` rows plus the two local notifications per alert. Also the morning outlook (15.3), the new-pattern
 * notice (14.3) and the daily end-of-day reminder (16).
 */
import { CONFIRM_DELAY_MIN, FEATURE_COPY, type ChildProfile } from '@emolens/shared';
import { addDays, dayOutlook, localDateOf, localMinuteOf, parseHHMM, planAlerts, zonedToUtc } from '@emolens/engine';
import { all, one } from '../db/types';
import { iso, ms } from '../db/time';
import { alertsFrom } from '../db/repo/alerts';
import { setSetting, type Settings } from '../db/repo/settings';
import type { Repo } from '../db/repo/writer';
import i18n from '../i18n';
import { blockRange } from '../i18n/format';
import {
  cancelNotification, notifyNewPattern, scheduleAlertNotifications, scheduledIds, scheduleEndOfDay, scheduleMorningOutlook,
} from '../notifications/forecast';
import type { ForecastSnapshot } from './snapshot';

/** The 2-hour block index (0-11) of a block start, in the child's time zone. */
const blockIndexOf = (start: number, tz: string) => Math.floor(localMinuteOf(start, tz) / 120);

export interface AlertSync { created: number; cancelled: number; suppressed: number; delivered: number; }

export async function syncAlerts(repo: Repo, profile: ChildProfile, settings: Settings, snap: ForecastSnapshot, now: number): Promise<AlertSync> {
  const tz = profile.homeTz;
  const rows = await alertsFrom(repo.db, profile.id, iso(now - 2 * 86_400_000));
  const episodes = await all<{ started_at: string }>(repo.db,
    'SELECT started_at FROM episodes WHERE child_id = ? AND deleted_at IS NULL AND started_at >= ?', [profile.id, iso(now - 86_400_000)]);
  const plan = planAlerts({
    now, tz,
    blocks: snap.forecasts.map((f) => ({ start: f.start, end: f.end, localDate: f.localDate, level: f.level })),
    existing: rows.map((a) => ({ id: a.id, blockStart: ms(a.block_start), localDate: localDateOf(ms(a.block_start), tz), scheduledFor: ms(a.scheduled_for), status: a.status })),
    episodeTimes: episodes.map((e) => ms(e.started_at)),
    quietHours: settings.quiet_hours, maxPerDay: settings.max_alerts_per_day, learning: snap.learning, earlyAlertsEnabled: settings.early_alerts_enabled,
  });
  // Only the family's main forecasting phone creates, cancels or closes alerts (SPEC 6.3, 23.3). Other phones with
  // "Get heads-ups on this phone" only schedule notifications for the alerts they pulled (below).
  if (!settings.primary_forecaster) { plan.create = []; plan.cancel = []; plan.deliver = []; plan.suppress = []; }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const created: { id: string; blockStart: number; fireAt: number; confirmAt: number }[] = [];
  await repo.write(async (w) => {
    for (const id of plan.cancel) await w.update('alerts', id, { status: 'cancelled' });
    for (const id of plan.deliver) await w.update('alerts', id, { status: 'delivered' });
    for (const c of plan.create) {
      const pred = await one<{ id: string }>(w.ex,
        "SELECT id FROM predictions WHERE child_id = ? AND block_start = ? ORDER BY CASE kind WHEN 'in_block' THEN 0 ELSE 1 END, made_at DESC LIMIT 1",
        [profile.id, iso(c.blockStart)]);
      const id = await w.insert('alerts', { child_id: profile.id, block_start: iso(c.blockStart), prediction_id: pred?.id ?? null,
        scheduled_for: iso(c.fireAt), notification_id: null, confirm_notification_id: null, status: 'scheduled' });
      created.push({ id, blockStart: c.blockStart, fireAt: c.fireAt, confirmAt: c.confirmAt });
    }
    for (const s of plan.suppress) {
      await w.insert('alerts', { child_id: profile.id, block_start: iso(s.blockStart), prediction_id: null, scheduled_for: iso(s.fireAt),
        notification_id: null, confirm_notification_id: null, status: 'suppressed' });
    }
  });

  for (const id of plan.cancel) {
    await cancelNotification(byId.get(id)?.notification_id);
    await cancelNotification(byId.get(id)?.confirm_notification_id);
  }
  if (settings.receive_alerts) {
    // New alerts, plus any live alert whose notifications are missing (e.g. after switching back from demo mode).
    const cancelled = new Set(plan.cancel);
    const live = [
      ...created,
      ...rows.filter((r) => !cancelled.has(r.id) && (r.status === 'scheduled' || r.status === 'delivered')).map((r) => {
        const start = ms(r.block_start);
        return { id: r.id, blockStart: start, fireAt: ms(r.scheduled_for), confirmAt: start + 2 * 3_600_000 + CONFIRM_DELAY_MIN * 60_000 };
      }),
    ].filter((a) => a.confirmAt > now);
    const answered = new Set((await all<{ alert_id: string }>(repo.db,
      'SELECT DISTINCT alert_id FROM alert_responses WHERE deleted_at IS NULL AND alert_id IN (SELECT id FROM alerts WHERE child_id = ? AND block_start >= ?)',
      [profile.id, iso(now - 2 * 86_400_000)])).map((r) => r.alert_id));
    const already = await scheduledIds();
    for (const a of live) {
      if (answered.has(a.id) || (already.has(`risk-${a.id}`) && already.has(`confirm-${a.id}`))) continue;
      const f = snap.forecasts.find((x) => x.start === a.blockStart);
      try {
        const ids = await scheduleAlertNotifications({ alertId: a.id, blockStart: a.blockStart, blockIndex: f?.index ?? blockIndexOf(a.blockStart, profile.homeTz),
          fireAt: a.fireAt, confirmAt: a.confirmAt, nickname: profile.nickname, reasons: (f?.reasons ?? []).map((r) => r.text) }, already, now);
        if (ids.notificationId || ids.confirmId) {
          // This phone's own notification ids: not an edit of the alert, so no new updated_at and nothing to sync
          // (another phone's newer change to the alert must not be overwritten by this).
          await repo.db.execute('UPDATE alerts SET notification_id = ?, confirm_notification_id = ? WHERE id = ?',
            [ids.notificationId, ids.confirmId, a.id]);
        }
      } catch { /* notifications must never break forecasting; the Today card still asks (SPEC 15.1) */ }
    }
  }
  return { created: created.length, cancelled: plan.cancel.length, suppressed: plan.suppress.length, delivered: plan.deliver.length };
}

/** "Today's outlook for Sam: mostly calm; higher chance 2-4 pm." for the next wake-up time, or null when not sent. */
export function outlookFor(profile: ChildProfile, settings: Settings, snap: ForecastSnapshot, now: number): { fireAt: number; body: string } | null {
  if (!settings.morning_outlook || snap.learning) return null;
  const tz = profile.homeTz;
  const today = localDateOf(now, tz);
  const wakeToday = zonedToUtc(today, parseHHMM(profile.wakeStart), tz);
  const date = now < wakeToday ? today : addDays(today, 1);
  const blocks = snap.forecasts.filter((f) => f.localDate === date);
  if (!blocks.length) return null;
  const o = dayOutlook(blocks, date);
  const ranges = o.blocks.map((b) => blockRange(b.index)).join(i18n.t('notif.reasonJoin'));
  const body = o.calm ? i18n.t('notif.outlookCalm', { name: profile.nickname })
    : o.level === 'high' ? i18n.t('notif.outlookHigh', { name: profile.nickname, ranges })
      : i18n.t('notif.outlookModerate', { name: profile.nickname, ranges });
  return { fireAt: zonedToUtc(date, parseHHMM(profile.wakeStart), tz), body };
}

let eodKey = '';

/** Morning outlook, end-of-day reminder and new-pattern notices. `quiet` (demo build) records patterns without notifying. */
export async function syncInfoNotifications(repo: Repo, profile: ChildProfile, settings: Settings, snap: ForecastSnapshot, now: number, quiet = false): Promise<void> {
  const outlook = outlookFor(profile, settings, snap, now);
  await scheduleMorningOutlook(outlook?.fireAt ?? null, outlook?.body ?? null);

  const key = `${settings.end_of_day_time}|${profile.homeTz}|${profile.nickname}|${settings.language}`;
  if (key !== eodKey) { await scheduleEndOfDay(settings.end_of_day_time, profile.homeTz, profile.nickname); eodKey = key; }

  const found = snap.insights.filter((r) => (r.status === 'likely' || r.status === 'strong') && !settings.notified_insights.includes(r.key));
  if (!found.length) return;
  if (!quiet) for (const r of found) await notifyNewPattern(r.key, FEATURE_COPY[r.key]?.label[settings.language] ?? r.key);
  await setSetting(repo.db, 'notified_insights', [...settings.notified_insights, ...found.map((r) => r.key)]);
}

/** Forget which end-of-day reminder was scheduled (after notifications were cancelled, e.g. switching profiles). */
export function resetScheduledInfo(): void { eodKey = ''; }
