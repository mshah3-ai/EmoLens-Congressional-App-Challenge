/**
 * Heads-ups across phones (SPEC 23.3). Only the primary forecasting phone creates alerts; they sync like any row.
 * Another phone with "Get heads-ups on this phone" schedules notifications for the alerts it pulls (the normal forecast
 * pass does that, see forecast/alerts.ts). When someone answers "How did it go?" on one phone, the others cancel their
 * own pending question for that alert after pulling the answer, so nobody is asked twice.
 */
import { all, type Executor } from '../db/types';
import { cancelNotification } from '../notifications/forecast';

export async function afterPullAlerts(ex: Executor, responseIds: string[]): Promise<number> {
  if (!responseIds.length) return 0;
  let cancelled = 0;
  for (let i = 0; i < responseIds.length; i += 500) {
    const part = responseIds.slice(i, i + 500);
    const rows = await all<{ id: string; notification_id: string | null; confirm_notification_id: string | null }>(ex,
      `SELECT a.id, a.notification_id, a.confirm_notification_id FROM alerts a JOIN alert_responses r ON r.alert_id = a.id
       WHERE r.id IN (${part.map(() => '?').join(',')}) AND r.deleted_at IS NULL`, part);
    for (const a of rows) {
      await cancelNotification(a.notification_id);
      await cancelNotification(a.confirm_notification_id);
      await ex.execute('UPDATE alerts SET notification_id = NULL, confirm_notification_id = NULL WHERE id = ?', [a.id]);
      cancelled++;
    }
  }
  return cancelled;
}
