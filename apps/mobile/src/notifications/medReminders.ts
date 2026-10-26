/**
 * Medication reminders (SPEC 10.3): a repeating local notification at each scheduled time, with "Given" and "Skip"
 * buttons (category MED_DOSE, SPEC 15.1). The text never names the medication (lock-screen privacy, SPEC 27.2).
 * Rescheduled whenever medications change and on every app start.
 * Medication times are the child's home time (like dose rows); the phone's notification triggers use the phone's own
 * clock, so each time is converted to the phone's time zone before scheduling (they differ when travelling).
 */
import * as Notifications from 'expo-notifications';
import { addDays, isoWeekday, localDateOf, localMinuteOf, parseHHMM, zonedToUtc } from '@emolens/engine';
import { parseJson, type MedicationRow, type MedSchedule } from '../db/rows';
import i18n, { deviceTimeZone } from '../i18n';

export const MED_PREFIX = 'med-';

export interface ReminderSlot {
  identifier: string;
  medicationId: string;
  time: string;           // 'HH:MM' in the child's home time zone (as saved)
  hour: number; minute: number;   // when it fires on the phone's clock
  /** null = every day; otherwise the notification weekday (1 = Sunday ... 7 = Saturday, Apple's numbering). */
  weekday: number | null;
}

/** ISO weekday (1 = Monday ... 7 = Sunday, as stored) → notification weekday (1 = Sunday ... 7 = Saturday). */
export const toNotificationWeekday = (iso: number) => (iso === 7 ? 1 : iso + 1);

/** A child-home-time 'HH:MM' on the phone's clock today: hour, minute and day shift (-1, 0 or +1). */
export function onPhoneClock(time: string, childTz: string, phoneTz: string, now = Date.now()): { hour: number; minute: number; dayShift: number } {
  const childDay = localDateOf(now, childTz);
  const at = zonedToUtc(childDay, parseHHMM(time), childTz);
  const phoneDay = localDateOf(at, phoneTz);
  const dayShift = phoneDay === childDay ? 0 : phoneDay === addDays(childDay, 1) ? 1 : -1;
  const m = localMinuteOf(at, phoneTz);
  return { hour: Math.floor(m / 60), minute: m % 60, dayShift };
}

export function reminderPlan(meds: MedicationRow[], childTz: string, phoneTz = childTz, now = Date.now()): ReminderSlot[] {
  const out: ReminderSlot[] = [];
  for (const m of meds) {
    if (m.as_needed || !m.reminders_enabled || m.active_to) continue;
    const s = parseJson<MedSchedule>(m.schedule, { times: [], days: [] });
    const everyDay = [1, 2, 3, 4, 5, 6, 7].every((d) => s.days.includes(d));
    for (const time of s.times) {
      const { hour, minute, dayShift } = onPhoneClock(time, childTz, phoneTz, now);
      if (everyDay) out.push({ identifier: `${MED_PREFIX}${m.id}-${time}`, medicationId: m.id, time, hour, minute, weekday: null });
      else for (const d of s.days) {
        const phoneDay = ((d - 1 + dayShift + 7) % 7) + 1; // the child's Monday evening can be the phone's Tuesday morning
        out.push({ identifier: `${MED_PREFIX}${m.id}-${time}-${d}`, medicationId: m.id, time, hour, minute, weekday: toNotificationWeekday(phoneDay) });
      }
    }
  }
  return out;
}

/** The next time this schedule is due (ms), or null for as-needed / no reminders / no days. Uses the child's home time. */
export function nextReminderAt(schedule: MedSchedule, tz: string, now = Date.now()): number | null {
  const today = localDateOf(now, tz);
  for (let i = 0; i < 8; i++) {
    const day = addDays(today, i);
    if (!schedule.days.includes(isoWeekday(day))) continue;
    const times = schedule.times.map((t) => zonedToUtc(day, parseHHMM(t), tz)).filter((ms) => ms > now).sort((a, b) => a - b);
    if (times.length) return times[0];
  }
  return null;
}

export function reminderContent(slot: ReminderSlot): Notifications.NotificationContentInput {
  return {
    title: i18n.t('notif.medTitle'),
    body: i18n.t('notif.medBody'),
    categoryIdentifier: 'MED_DOSE',
    data: { kind: 'med', medicationId: slot.medicationId, time: slot.time, url: '/log/med' },
  };
}

export interface ReminderSync { allowed: boolean; count: number }

/** Cancels every EmoLens medication reminder and schedules the current plan (only if notifications are allowed). */
export async function syncMedReminders(meds: MedicationRow[], childTz: string, phoneTz = deviceTimeZone()): Promise<ReminderSync> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) if (n.identifier.startsWith(MED_PREFIX)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
  if (!(await Notifications.getPermissionsAsync()).granted) return { allowed: false, count: 0 };
  const plan = reminderPlan(meds, childTz, phoneTz);
  for (const slot of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: slot.identifier,
      content: reminderContent(slot),
      trigger: slot.weekday == null
        ? { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: slot.hour, minute: slot.minute }
        : { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: slot.weekday, hour: slot.hour, minute: slot.minute },
    });
  }
  return { allowed: true, count: plan.length };
}
