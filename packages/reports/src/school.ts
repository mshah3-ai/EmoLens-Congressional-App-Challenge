/**
 * "School time" for the School report and School share links (BUGS #23): a hard moment counts only if it was logged at
 * a place of type School, or started during school hours (SCHOOL_HOURS) on one of the child's school days. Everything
 * else (evenings, nights, weekends at home) stays private, because even a date and time can tell a school about home life.
 */
import { SCHOOL_HOURS, BLOCK_HOURS } from '@emolens/shared';
import { isoWeekday, localDateOf, localMinuteOf } from '@emolens/engine';

export interface SchoolCalendar { homeTz: string; schoolDays: number[]; }

/** Monday to Friday, when a child's school days aren't known. */
export const DEFAULT_SCHOOL_DAYS = [1, 2, 3, 4, 5];

export function isSchoolTime(startedAt: number, placeType: string | null, c: SchoolCalendar): boolean {
  if (placeType === 'school') return true;
  if (!c.schoolDays.includes(isoWeekday(localDateOf(startedAt, c.homeTz)))) return false;
  const m = localMinuteOf(startedAt, c.homeTz);
  return m >= SCHOOL_HOURS.start && m < SCHOOL_HOURS.end;
}

/** The 2-hour blocks of the day (0 = midnight-2 AM) that overlap school hours: 8-10, 10-12, 12-2, 2-4. */
export function schoolBlockIndices(): number[] {
  const out: number[] = [];
  for (let k = 0; k * BLOCK_HOURS * 60 < SCHOOL_HOURS.end; k++) if ((k + 1) * BLOCK_HOURS * 60 > SCHOOL_HOURS.start) out.push(k);
  return out;
}
