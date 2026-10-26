/**
 * Forecast notifications (SPEC 15): the heads-up before a higher-chance block (RISK_ALERT), "How did 2-4 pm go?"
 * after it (CONFIRM), the morning outlook and the new-pattern notice (INFO), and the daily end-of-day check (EOD).
 * Lock-screen privacy (SPEC 27.2): texts use the engine's generic reason phrases ("A missed medication dose",
 * "Being somewhere new") and never medication names or place labels.
 */
import * as Notifications from 'expo-notifications';
import i18n, { deviceTimeZone } from '../i18n';
import { blockRange } from '../i18n/format';
import { onPhoneClock } from './medReminders';

export const MORNING_OUTLOOK_ID = 'morning-outlook';
export const EOD_ID = 'end-of-day';

const at = (ms: number, now = Date.now()): Notifications.NotificationTriggerInput =>
  ({ type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Math.max(ms, now + 1000)) });

/** "short sleep last night, an appointment around this time" (first letter lowercased for use mid-sentence). */
export function reasonList(texts: string[]): string {
  return texts.slice(0, 2).map((t) => t.charAt(0).toLowerCase() + t.slice(1)).join(i18n.t('notif.reasonJoin'));
}

export function riskAlertContent(a: { alertId: string; blockStart: number; blockIndex: number; nickname: string; reasons: string[] }): Notifications.NotificationContentInput {
  const range = blockRange(a.blockIndex);
  return {
    title: i18n.t('notif.riskTitle', { range }),
    body: a.reasons.length
      ? i18n.t('notif.riskBody', { name: a.nickname, reasons: reasonList(a.reasons) })
      : i18n.t('notif.riskBodyNoReasons', { name: a.nickname }),
    data: { kind: 'risk', alertId: a.alertId, url: `/block/${a.blockStart}` },
    categoryIdentifier: 'RISK_ALERT',
  };
}

export function confirmContent(a: { alertId: string; blockIndex: number }): Notifications.NotificationContentInput {
  return {
    title: i18n.t('notif.confirmTitle', { range: blockRange(a.blockIndex) }),
    body: i18n.t('notif.confirmBody'),
    data: { kind: 'confirm', alertId: a.alertId, url: `/confirm/${a.alertId}` },
    categoryIdentifier: 'CONFIRM',
  };
}

/**
 * Schedules the notifications of one alert that are still in the future and not scheduled yet: the heads-up (until it
 * fires) and "How did it go?" (until block end + 30 min). Returns their ids (null when not scheduled).
 */
export async function scheduleAlertNotifications(a: { alertId: string; blockStart: number; blockIndex: number; fireAt: number; confirmAt: number; nickname: string; reasons: string[] },
  already: Set<string> = new Set(), now = Date.now()): Promise<{ notificationId: string | null; confirmId: string | null }> {
  if (!(await Notifications.getPermissionsAsync()).granted) return { notificationId: null, confirmId: null };
  const riskId = `risk-${a.alertId}`, confirmIdent = `confirm-${a.alertId}`;
  const notificationId = already.has(riskId) ? riskId : a.fireAt > now - 5000
    ? await Notifications.scheduleNotificationAsync({ identifier: riskId, content: riskAlertContent(a), trigger: at(a.fireAt, now) }) : null;
  const confirmId = already.has(confirmIdent) ? confirmIdent : a.confirmAt > now
    ? await Notifications.scheduleNotificationAsync({ identifier: confirmIdent, content: confirmContent(a), trigger: at(a.confirmAt, now) }) : null;
  return { notificationId, confirmId };
}

/** Identifiers of every scheduled (not yet shown) notification. */
export async function scheduledIds(): Promise<Set<string>> {
  try { return new Set((await Notifications.getAllScheduledNotificationsAsync()).map((n) => n.identifier)); } catch { return new Set(); }
}

const FORECAST_PREFIXES = ['risk-', 'confirm-', 'pattern-', MORNING_OUTLOOK_ID, EOD_ID];

/**
 * Cancels this profile's forecast notifications (not medication reminders). Called when switching between the real and
 * the demo profile, so one profile's alerts never fire while the other is open; the next forecast run schedules the
 * open profile's own again.
 */
export async function cancelForecastNotifications(): Promise<void> {
  for (const id of await scheduledIds()) if (FORECAST_PREFIXES.some((p) => id.startsWith(p))) await cancelNotification(id);
}

export async function cancelNotification(id: string | null | undefined): Promise<void> {
  if (!id) return;
  try { await Notifications.cancelScheduledNotificationAsync(id); } catch { /* already delivered or gone */ }
}

/** SPEC 15.3: one outlook at wake time ("Today's outlook for Sam: mostly calm; higher chance 2-4 pm"). */
export async function scheduleMorningOutlook(fireAt: number | null, body: string | null): Promise<void> {
  await cancelNotification(MORNING_OUTLOOK_ID);
  if (fireAt == null || body == null || fireAt <= Date.now() || !(await Notifications.getPermissionsAsync()).granted) return;
  await Notifications.scheduleNotificationAsync({
    identifier: MORNING_OUTLOOK_ID,
    content: { title: i18n.t('notif.outlookTitle'), body, data: { kind: 'outlook', url: '/' }, categoryIdentifier: 'INFO' },
    trigger: at(fireAt),
  });
}

/** SPEC 16: "Quick check: how was today for Sam?" every day at the end-of-day time (child's home time on the phone's clock). */
export async function scheduleEndOfDay(time: string, childTz: string, nickname: string): Promise<void> {
  await cancelNotification(EOD_ID);
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  const { hour, minute } = onPhoneClock(time, childTz, deviceTimeZone());
  await Notifications.scheduleNotificationAsync({
    identifier: EOD_ID,
    content: { title: i18n.t('notif.eodTitle'), body: i18n.t('notif.eodBody', { name: nickname }), data: { kind: 'eod', url: '/end-of-day/today' }, categoryIdentifier: 'EOD' },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
  });
}

/** SPEC 14.3: once per feature, when it first reaches "likely" or "strong". */
export async function notifyNewPattern(featureKey: string, label: string): Promise<void> {
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  await Notifications.scheduleNotificationAsync({
    identifier: `pattern-${featureKey}`,
    content: { title: i18n.t('notif.patternTitle'), body: i18n.t('notif.patternBody', { factor: label.toLowerCase() }),
      data: { kind: 'pattern', url: `/insights/trigger/${featureKey}` }, categoryIdentifier: 'INFO' },
    trigger: null,
  });
}
