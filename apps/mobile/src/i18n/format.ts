/**
 * Dates and times shown in the child's home time zone, in the user's language, with 12/24-hour clocks per
 * locale (SPEC 28.3). Local calendar dates are 'YYYY-MM-DD' strings, like in the engine.
 */
import { formatInTimeZone } from 'date-fns-tz';
import { formatDistanceStrict } from 'date-fns';
import { enUS, es } from 'date-fns/locale';
import { addDays, localDateOf, zonedToUtc } from '@emolens/engine';
import { blockRangeIn, longDateIn, shortDateIn, timeIn } from '@emolens/reports';
import i18n, { currentLang } from './index';

const locale = () => (currentLang() === 'es' ? es : enUS);
const toDate = (t: string | number | Date) => (t instanceof Date ? t : new Date(t));

/** "3:10 PM" (en) / "15:10" (es). */
export function fmtTime(t: string | number | Date, tz: string): string {
  return timeIn(currentLang(), toDate(t).getTime(), tz);
}

/** "Monday, September 28" / "lunes, 28 de septiembre". */
export function fmtLongDate(localDate: string): string {
  return longDateIn(currentLang(), localDate);
}

/** "Sep 28" / "28 sept". */
export function fmtShortDate(localDate: string): string {
  return shortDateIn(currentLang(), localDate);
}

export const todayIn = (tz: string, now = Date.now()) => localDateOf(now, tz);

/** "Today", "Yesterday", or a short date. */
export function dayLabel(localDate: string, tz: string): string {
  const today = todayIn(tz);
  if (localDate === today) return i18n.t('common.today');
  if (localDate === addDays(today, -1)) return i18n.t('common.yesterday');
  if (localDate === addDays(today, 1)) return i18n.t('common.tomorrow');
  return fmtLongDate(localDate);
}

/** "Today, 3:10 PM" for time pickers and list rows. */
export function fmtDayTime(t: string | number | Date, tz: string): string {
  const ms = toDate(t).getTime();
  return `${dayLabel(localDateOf(ms, tz), tz)}, ${fmtTime(ms, tz)}`;
}

/** UTC ISO bounds of one local day: [start, end). */
export function dayBounds(localDate: string, tz: string): [string, string] {
  return [new Date(zonedToUtc(localDate, 0, tz)).toISOString(), new Date(zonedToUtc(addDays(localDate, 1), 0, tz)).toISOString()];
}

/** A block's clock range: "2–4 pm", "10 am–12 pm" (en) or "14–16 h" (es). */
export function blockRange(index: number, hours = 2): string {
  return blockRangeIn(currentLang(), index, hours);
}

/** Morning / afternoon / evening greeting key for the Today header. */
export function greetingKey(hourLocal: number): 'today.greetingMorning' | 'today.greetingAfternoon' | 'today.greetingEvening' {
  if (hourLocal < 12) return 'today.greetingMorning';
  if (hourLocal < 18) return 'today.greetingAfternoon';
  return 'today.greetingEvening';
}

/** Local hour (0-23) of an instant in a time zone. */
export function localHour(ms: number, tz: string): number {
  return Number(formatInTimeZone(new Date(ms), tz, 'H'));
}

/** "HH:MM" local clock string -> a display time like "7:30 PM". */
export function fmtClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return formatInTimeZone(new Date(Date.UTC(2020, 0, 1, h, m)), 'UTC', 'p', { locale: locale() });
}

/** "5 minutes ago" / "hace 5 minutos". */
export function fmtAgo(iso: string, now = Date.now()): string {
  return formatDistanceStrict(new Date(iso), new Date(now), { addSuffix: true, locale: locale() });
}
