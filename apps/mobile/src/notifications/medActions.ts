/**
 * "Given" / "Skip" on a medication reminder (SPEC 10.3, 15.1 MED_DOSE). Finds today's dose row for that medication and
 * time and marks it. If the app wasn't running, iOS/Android may deliver the tap only when the app next opens; the
 * dose also stays on Today's "Medication due" card, so it is never lost.
 */
import type * as Notifications from 'expo-notifications';
import { localDateOf, localMinuteOf, parseHHMM } from '@emolens/engine';
import { dosesBetween, markDoseTaken, skipDose, type DoseWithMed } from '../db/repo/meds';
import { nowIso } from '../db/time';
import { dayBounds } from '../i18n/format';
import { useSession } from '../store/session';

/** Today's still-open dose of `medicationId` scheduled at local `time` ('HH:MM'). */
export function findDoseForReminder(doses: DoseWithMed[], medicationId: string, time: string, tz: string): DoseWithMed | null {
  const minute = parseHHMM(time);
  return doses.find((d) => d.medication_id === medicationId && d.scheduled_for != null
    && localMinuteOf(Date.parse(d.scheduled_for), tz) === minute && (d.status === 'pending' || d.status === 'missed')) ?? null;
}

/** Returns true when the response was a Given/Skip button that we handled (so no screen should open). */
export async function handleMedAction(r: Notifications.NotificationResponse): Promise<boolean> {
  const data = r.notification.request.content.data as { kind?: string; medicationId?: string; time?: string } | undefined;
  const action = r.actionIdentifier;
  if (data?.kind !== 'med' || (action !== 'TAKEN' && action !== 'SKIP') || !data.medicationId || !data.time) return false;
  const { repo, profile, bump } = useSession.getState();
  if (!repo || !profile) return false;
  const [start, end] = dayBounds(localDateOf(Date.now(), profile.homeTz), profile.homeTz);
  const dose = findDoseForReminder(await dosesBetween(repo.db, profile.id, start, end), data.medicationId, data.time, profile.homeTz);
  if (!dose) return true;
  if (action === 'TAKEN') await markDoseTaken(repo, profile.id, dose, nowIso());
  else await skipDose(repo, profile.id, dose);
  bump();
  return true;
}
