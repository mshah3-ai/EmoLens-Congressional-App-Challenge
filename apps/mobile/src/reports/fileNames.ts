/**
 * File names for everything EmoLens exports. Two different exports must never get the same name: iOS "Save to Files"
 * silently refused to save a second file with an existing name, so the School and Family PDFs of the same dates were
 * lost (hand test, 2026-09-30). Each name therefore holds everything that makes the file different:
 *   - PDF report: child, audience (in the report's language, so English and Spanish differ too), date range;
 *   - digest PDF: child, week, language;
 *   - ABC data and FHIR: date range and language; FHIR also whether the nickname is inside;
 *   - full backup: date and time (each backup is a snapshot of that moment).
 * `share.ts` then removes characters file systems dislike ("Sam (demo)" -> "Sam-demo"). DECISIONS #85.
 */
import type { Lang } from '@emolens/shared';

const lang = (l: Lang) => (l === 'es' ? '-es' : '');

export const reportPdfName = (nickname: string, audienceLabel: string, from: string, to: string): string =>
  `EmoLens-${nickname}-${audienceLabel}-${from}-to-${to}.pdf`;

export const digestPdfName = (nickname: string, weekStart: string, l: Lang): string =>
  `EmoLens-${nickname}-weekly-digest-${weekStart}${lang(l)}.pdf`;

export const abcCsvName = (from: string, to: string, l: Lang): string => `emolens-abc-${from}-to-${to}${lang(l)}.csv`;

export const fhirJsonName = (from: string, to: string, withNickname: boolean, l: Lang): string =>
  `emolens-fhir-${from}-to-${to}${withNickname ? '-with-name' : ''}${lang(l)}.json`;

/** `hhmm` is the local time "14:32". */
export const backupJsonName = (localDate: string, hhmm: string): string => `emolens-export-${localDate}-${hhmm.replace(':', '')}.json`;
