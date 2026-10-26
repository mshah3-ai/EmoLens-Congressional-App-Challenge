/**
 * Local notifications (SPEC 15.1): categories and the "add details later" reminder (SPEC 10.1). Forecast notifications
 * are in forecast.ts, medication reminders in medReminders.ts. Notification text never contains
 * medication names or place labels (SPEC 27.2).
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import i18n from '../i18n';

let configured = false;

export async function configureNotifications(): Promise<void> {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'EmoLens', importance: Notifications.AndroidImportance.DEFAULT });
  }
  const t = i18n.t.bind(i18n);
  await Notifications.setNotificationCategoryAsync('RISK_ALERT', [
    { identifier: 'SEE_IDEAS', buttonTitle: t('notif.seeIdeas'), options: { opensAppToForeground: true } },
    { identifier: 'ON_IT', buttonTitle: t('notif.onIt'), options: { opensAppToForeground: true } },
  ]);
  await Notifications.setNotificationCategoryAsync('CONFIRM', [
    { identifier: 'HAPPENED', buttonTitle: t('notif.happened'), options: { opensAppToForeground: true } },
    { identifier: 'STEPPED_IN', buttonTitle: t('notif.steppedIn'), options: { opensAppToForeground: false } },
    { identifier: 'CALM', buttonTitle: t('notif.calm'), options: { opensAppToForeground: false } },
  ]);
  // INFO (details reminder, morning outlook, new pattern) and EOD (end-of-day check) have no buttons: a tap opens the app.
  await Notifications.setNotificationCategoryAsync('INFO', []);
  await Notifications.setNotificationCategoryAsync('EOD', []);
  await Notifications.setNotificationCategoryAsync('MED_DOSE', [
    { identifier: 'TAKEN', buttonTitle: t('notif.taken'), options: { opensAppToForeground: false } },
    { identifier: 'SKIP', buttonTitle: t('notif.skip'), options: { opensAppToForeground: false } },
  ]);
}

export async function notificationsAllowed(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

export async function requestNotificationPermission(): Promise<boolean> {
  return (await Notifications.requestPermissionsAsync()).granted;
}

const detailsId = (episodeId: string) => `details-${episodeId}`;

/** SPEC 10.1: 45 minutes after a fast-path save, ask for details (deep link to the edit sheet). */
export async function scheduleDetailsReminder(episodeId: string, timeLabel: string): Promise<void> {
  if (!(await notificationsAllowed())) return;
  await Notifications.scheduleNotificationAsync({
    identifier: detailsId(episodeId),
    content: {
      title: i18n.t('notif.detailsTitle'),
      body: i18n.t('notif.detailsBody', { time: timeLabel }),
      data: { url: `/log/episode?id=${episodeId}` },
      categoryIdentifier: 'INFO',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 45 * 60 },
  });
}

export async function cancelDetailsReminder(episodeId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(detailsId(episodeId));
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** Where a tapped notification should take the user (null if it has no link). */
export function urlFromResponse(r: Notifications.NotificationResponse | null): string | null {
  const url = r?.notification.request.content.data?.url;
  return typeof url === 'string' && url.startsWith('/') ? url : null;
}
