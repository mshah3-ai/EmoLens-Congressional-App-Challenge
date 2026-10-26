/**
 * Date, time and number formatting for a given language, without React Native (the report runs in Node tests and later
 * in the portal). The app's own formatters (src/i18n/format.ts) call these with the current language, so screens and
 * reports always show dates the same way.
 */
import { formatInTimeZone } from 'date-fns-tz';
import { enUS, es } from 'date-fns/locale';
import type { Lang } from '@emolens/shared';

const locale = (lang: Lang) => (lang === 'es' ? es : enUS);
const noon = (localDate: string) => new Date(`${localDate}T12:00:00Z`);

/** "3:10 PM" (en) / "15:10" (es). */
export const timeIn = (lang: Lang, t: number, tz: string): string => formatInTimeZone(new Date(t), tz, 'p', { locale: locale(lang) });

/** "Monday, September 28" / "lunes, 28 de septiembre". */
export const longDateIn = (lang: Lang, localDate: string): string =>
  formatInTimeZone(noon(localDate), 'UTC', lang === 'es' ? "EEEE, d 'de' MMMM" : 'EEEE, MMMM d', { locale: locale(lang) });

/** "Sep 28" / "28 sept". */
export const shortDateIn = (lang: Lang, localDate: string): string =>
  formatInTimeZone(noon(localDate), 'UTC', lang === 'es' ? 'd MMM' : 'MMM d', { locale: locale(lang) });

/** "Sep 28, 2026" / "28 sept 2026". */
export const dateYearIn = (lang: Lang, localDate: string): string =>
  formatInTimeZone(noon(localDate), 'UTC', lang === 'es' ? 'd MMM yyyy' : 'MMM d, yyyy', { locale: locale(lang) });

/**
 * The date of a moment (epoch ms) in a time zone, as dateYearIn shows it. Use this, never `toISOString().slice(0, 10)`:
 * that is the date in UTC, which is already tomorrow on a US evening (10:47 PM in Los Angeles is 05:47 UTC next day).
 */
export const dateYearAt = (lang: Lang, t: number, tz: string): string =>
  formatInTimeZone(new Date(t), tz, lang === 'es' ? 'd MMM yyyy' : 'MMM d, yyyy', { locale: locale(lang) });

/** "Mon" / "lun". */
export const weekdayShortIn = (lang: Lang, localDate: string): string =>
  formatInTimeZone(noon(localDate), 'UTC', 'EEE', { locale: locale(lang) });

/** A block's clock range: "2–4 pm", "10 am–12 pm" (en) or "14–16 h" (es). */
export function blockRangeIn(lang: Lang, index: number, hours = 2): string {
  const a = index * hours, b = (a + hours) % 24;
  if (lang === 'es') return `${a}–${b === 0 ? 24 : b} h`;
  const h12 = (h: number) => (h % 12 === 0 ? 12 : h % 12);
  const ap = (h: number) => (h < 12 || h === 24 ? 'am' : 'pm');
  const endH = b === 0 ? 24 : b;
  return ap(a) === ap(endH) ? `${h12(a)}–${h12(endH)} ${ap(endH)}` : `${h12(a)} ${ap(a)}–${h12(endH)} ${ap(endH)}`;
}

/** 0.234 -> "23%". */
export const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** 1.5 -> "1.5" (en) / "1,5" (es). */
export const num1 = (lang: Lang, v: number): string => v.toLocaleString(lang === 'es' ? 'es' : 'en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
