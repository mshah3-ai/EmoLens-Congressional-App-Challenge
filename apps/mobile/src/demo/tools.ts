/**
 * Demo tools (demo profile only; approved by the student for the competition video). Real alerts come only from the
 * engine's forecast and its rules; these two buttons let a viewer see the answer loop without waiting for real time:
 *  - `sendSampleHeadsUp`: a heads-up for the block happening now, shown in 5 seconds, and "How did it go?" 1 minute later;
 *  - `askAboutPastBlock`: a "How did it go?" card on Today for the most recent finished block that has no answer.
 * Answers go through exactly the same code as real ones (labels -> refit).
 */
import type { ChildProfile } from '@emolens/shared';
import { addDays, awakeBlocksForDate, localDateOf } from '@emolens/engine';
import { all } from '../db/types';
import { iso } from '../db/time';
import type { Repo } from '../db/repo/writer';
import { scheduleAlertNotifications } from '../notifications/forecast';
import type { ForecastSnapshot } from '../forecast/snapshot';

/** Awake blocks of yesterday and today that have started, oldest first. */
function startedBlocks(profile: ChildProfile, now: number) {
  const today = localDateOf(now, profile.homeTz);
  return [...awakeBlocksForDate(addDays(today, -1), profile), ...awakeBlocksForDate(today, profile)].filter((b) => b.start <= now);
}

export async function sendSampleHeadsUp(repo: Repo, profile: ChildProfile, snap: ForecastSnapshot | null, now = Date.now()): Promise<{ notified: boolean }> {
  const block = startedBlocks(profile, now).pop();
  if (!block) return { notified: false };
  const id = await repo.write((w) => w.insert('alerts', { child_id: profile.id, block_start: iso(block.start), prediction_id: null,
    scheduled_for: iso(now + 5000), notification_id: null, confirm_notification_id: null, status: 'delivered' }));
  const f = snap?.forecasts.find((x) => x.start === block.start);
  const ids = await scheduleAlertNotifications({ alertId: id, blockStart: block.start, blockIndex: block.index, fireAt: now + 5000, confirmAt: now + 60_000,
    nickname: profile.nickname, reasons: (f?.reasons ?? []).map((r) => r.text) }, new Set(), now);
  await repo.write((w) => w.update('alerts', id, { notification_id: ids.notificationId, confirm_notification_id: ids.confirmId }));
  return { notified: ids.notificationId != null };
}

export async function askAboutPastBlock(repo: Repo, profile: ChildProfile, now = Date.now()): Promise<boolean> {
  const done = new Set((await all<{ block_start: string }>(repo.db,
    `SELECT block_start FROM alerts WHERE child_id = ? AND deleted_at IS NULL AND status != 'cancelled'
     UNION SELECT block_start FROM blocks WHERE child_id = ? AND label_status != 'unknown'`, [profile.id, profile.id])).map((r) => r.block_start));
  const block = startedBlocks(profile, now).filter((b) => b.end <= now && !done.has(iso(b.start))).pop();
  if (!block) return false;
  await repo.write((w) => w.insert('alerts', { child_id: profile.id, block_start: iso(block.start), prediction_id: null,
    scheduled_for: iso(block.start - 30 * 60_000), notification_id: null, confirm_notification_id: null, status: 'delivered' }));
  return true;
}
