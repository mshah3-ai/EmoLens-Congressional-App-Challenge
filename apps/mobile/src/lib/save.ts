/** After a successful save: a light haptic (SPEC 28.1), a warm thank-you toast, refresh screens and the forecast. */
import * as Haptics from 'expo-haptics';
import i18n from '../i18n';
import { toast } from '../ui/Toast';
import { useSession } from '../store/session';
import { requestForecast } from '../forecast';

/** Also asks for a forecast update 2 s later (SPEC 10: save -> recompute -> refit -> forecast). */
export function afterSave(message?: string): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  useSession.getState().bump();
  requestForecast();
  toast(message ?? i18n.t('common.savedThanks'));
}
