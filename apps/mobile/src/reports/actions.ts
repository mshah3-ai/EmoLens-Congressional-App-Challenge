/**
 * What the report, digest and privacy screens' buttons do: read the data, build the file (PDF, CSV or JSON) in the
 * app's language, and open the share sheet. The building blocks (data.ts, templates, abc.ts, fhir.ts, backup/) are
 * plain TypeScript; this file adds the phone parts (translations, paper size from the phone's region, sharing).
 * Every step is labelled (load / render / build, then print / save / write / share in share.ts), so when a button
 * fails, About → Diagnostics and the dev terminal say which step and why (BUGS.md #11).
 */
import { getLocales } from 'expo-localization';
import type { ChildProfile, Lang } from '@emolens/shared';
import { formatHHMM, localDateOf, localMinuteOf } from '@emolens/engine';
import type { Executor } from '../db/types';
import { exportAll } from '../backup/export';
import type { DigestRow } from '../digest/generate';
import i18n from '../i18n';
import { step } from '../lib/steps';
import { buildAbcCsv, loadAbcRows } from './abc';
import { loadReportData, type Audience } from './data';
import { abcCsvName, backupJsonName, digestPdfName, fhirJsonName, reportPdfName } from './fileNames';
import { buildFhirBundle, loadFhirInput } from './fhir';
import { sharePdf, shareTextFile } from './share';
import { renderDigestHtml } from './templates/digest';
import { renderReportHtml } from '@emolens/reports';
import { pageSizeForRegion, type TFn } from '@emolens/reports';

/** i18next's `t` fixed to one language (its overloaded type narrowed to what the templates need). */
export const tFor = (lang: Lang): TFn => i18n.getFixedT(lang) as unknown as TFn;
const pageSize = () => pageSizeForRegion(getLocales()[0]?.regionCode);

export interface RangeChoice { from: string; to: string; }

export async function shareReportPdf(ex: Executor, profile: ChildProfile, lang: Lang, r: RangeChoice, audience: Audience, noteIds: string[],
  schoolOnly = true): Promise<void> {
  const t = tFor(lang);
  const data = await step('load', () => loadReportData(ex, profile, { ...r, audience, noteIds, lang, now: Date.now(), pageSize: pageSize(), schoolOnly }));
  const html = await step('render', () => renderReportHtml(data, t));
  await sharePdf(reportPdfName(profile.nickname, t(`report.audience.${audience}`), r.from, r.to), html, data.pageSize, t('reports.pdf'));
}

export async function shareAbcCsv(ex: Executor, profile: ChildProfile, lang: Lang, r: RangeChoice): Promise<void> {
  const t = tFor(lang);
  const rows = await step('load', () => loadAbcRows(ex, profile, r.from, r.to, t, lang));
  const csv = await step('build', () => buildAbcCsv(rows));
  await shareTextFile(abcCsvName(r.from, r.to, lang), csv, 'csv', t('reports.csv'));
}

export async function shareFhirJson(ex: Executor, profile: ChildProfile, lang: Lang, r: RangeChoice, includeNickname: boolean): Promise<void> {
  const t = tFor(lang);
  const input = await step('load', () => loadFhirInput(ex, profile, r.from, r.to, t));
  const json = await step('build', () => JSON.stringify(buildFhirBundle(input, { includeNickname, now: Date.now() }), null, 2));
  await shareTextFile(fhirJsonName(r.from, r.to, includeNickname, lang), json, 'json', t('reports.fhir'));
}

export async function shareDigestPdf(profile: ChildProfile, lang: Lang, d: DigestRow): Promise<void> {
  const t = tFor(lang);
  const size = pageSize();
  const html = await step('render', () => renderDigestHtml(d.stats, t, { nickname: profile.nickname, lang, size }));
  await sharePdf(digestPdfName(profile.nickname, d.weekStart, lang), html, size, t('digest.share'));
}

export async function shareBackup(ex: Executor, tz: string, lang: Lang): Promise<void> {
  const json = await step('load', async () => JSON.stringify(await exportAll(ex)));
  const now = Date.now();
  await shareTextFile(backupJsonName(localDateOf(now, tz), formatHHMM(localMinuteOf(now, tz))), json, 'json', tFor(lang)('backup.export'));
}
