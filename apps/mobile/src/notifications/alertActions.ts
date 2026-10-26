/**
 * Buttons on forecast notifications (SPEC 15.1):
 *  - CONFIRM "All calm" / "We stepped in early": saved right away without opening a screen;
 *  - CONFIRM "A hard moment happened": saved, then the hard moment opens so details can be added later;
 *  - RISK_ALERT "We're on it": opens the strategy picker linked to the alert (a proactive use).
 * Other taps follow the notification's link (the block sheet, the confirmation screen, the end-of-day check).
 * Background delivery of button taps depends on the OS; unanswered confirmations always stay on Today (SPEC 15.1).
 */
import type * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { answerAlert } from '../db/repo/alerts';
import { recordError } from '../db/repo/errors';
import { requestForecast } from '../forecast';
import { useSession } from '../store/session';
import { cancelNotification } from './forecast';

/** Returns true when the response was one of our buttons and has been handled (no link to follow). */
export async function handleAlertAction(r: Notifications.NotificationResponse): Promise<boolean> {
  const data = r.notification.request.content.data as { kind?: string; alertId?: string } | undefined;
  const action = r.actionIdentifier;
  if (!data?.alertId || (data.kind !== 'confirm' && data.kind !== 'risk')) return false;
  const { repo, profile, bump } = useSession.getState();
  if (!repo || !profile) return false;
  if (data.kind === 'risk') {
    if (action !== 'ON_IT') return false; // tap or "See ideas": follow the link to the block sheet
    router.push({ pathname: '/log/strategy', params: { alertId: data.alertId } });
    return true;
  }
  if (action !== 'HAPPENED' && action !== 'STEPPED_IN' && action !== 'CALM') return false;
  try {
    const res = await answerAlert(repo, profile, data.alertId, action === 'HAPPENED' ? 'happened' : action === 'STEPPED_IN' ? 'stepped_in' : 'calm');
    await cancelNotification(res.confirmNotificationId);
    bump();
    requestForecast(0);
    if (action === 'HAPPENED' && res.episodeId) router.push({ pathname: '/log/episode', params: { id: res.episodeId } });
  } catch (e) {
    await recordError(repo.db, 'alert-action', e);
  }
  return true;
}
