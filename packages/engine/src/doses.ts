/**
 * Medication dose status rules (spec 10.3). Kept in the engine so the app, the simulator and the
 * feature builder (`missed_dose`, `late_dose`) all agree on what "late" and "missed" mean.
 *   taken within ±60 min of the scheduled time  -> 'taken'
 *   taken more than 60 min late                  -> 'late'   (the spec's window is 60-240 min; a dose marked
 *                                                              taken even later is still recorded as late)
 *   still not marked 240 min after the schedule -> 'missed' (set automatically)
 */
import { MINUTE_MS, type DoseStatus } from '@emolens/shared';

export const DOSE_ON_TIME_MIN = 60;
export const DOSE_MISSED_AFTER_MIN = 240;

export function doseStatusForTaken(scheduledFor: number | null, takenAt: number): Extract<DoseStatus, 'taken' | 'late'> {
  if (scheduledFor == null) return 'taken'; // as-needed doses have no schedule
  return takenAt - scheduledFor > DOSE_ON_TIME_MIN * MINUTE_MS ? 'late' : 'taken';
}

/** True when a still-pending scheduled dose should now be marked missed. */
export function isDoseMissed(status: DoseStatus, scheduledFor: number | null, now: number): boolean {
  return status === 'pending' && scheduledFor != null && now - scheduledFor > DOSE_MISSED_AFTER_MIN * MINUTE_MS;
}
