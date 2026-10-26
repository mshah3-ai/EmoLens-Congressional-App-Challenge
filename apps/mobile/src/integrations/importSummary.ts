/**
 * The sentence shown after "Sync now": "Imported 1 night, 1 heart-rate reading." Only new items are counted, so
 * syncing twice in a row says "Nothing new". Sources that failed are named. Pure (takes the translate function), so tested.
 */
import type { RefreshReport } from './refresh';
import type { ImportKind, IntegrationId } from './types';

type TFn = (key: string, opts?: Record<string, unknown>) => string;

/** Order the kinds appear in the sentence. */
export const IMPORT_ORDER: ImportKind[] = ['nights', 'heart_rate', 'resting_hr', 'hrv', 'steps', 'events', 'weather_hours'];

export function importTotals(report: RefreshReport): Partial<Record<ImportKind, number>> {
  const totals: Partial<Record<ImportKind, number>> = {};
  for (const r of Object.values(report.imported)) {
    for (const [k, n] of Object.entries(r?.summary ?? {}) as [ImportKind, number][]) if (n) totals[k] = (totals[k] ?? 0) + n;
  }
  return totals;
}

export function importSummaryText(report: RefreshReport, t: TFn, sourceName: (id: IntegrationId) => string): string {
  const totals = importTotals(report);
  const parts = IMPORT_ORDER.filter((k) => totals[k]).map((k) => t(`sources.imported.${k}`, { count: totals[k] }));
  const sentences = [parts.length ? t('sources.importedList', { list: parts.join(', ') }) : t('sources.nothingNew')];
  const noData = (Object.entries(report.imported) as [IntegrationId, { foundData?: boolean }][]).filter(([, r]) => r.foundData === false).map(([id]) => sourceName(id));
  if (noData.length) sentences.push(t('sources.noDataFrom', { names: noData.join(', ') }));
  for (const r of Object.values(report.imported)) if (r?.notice) sentences.push(t(`sources.noticeSync.${r.notice}`));
  if (report.failed.length) sentences.push(t('sources.failedList', { names: report.failed.map(sourceName).join(', ') }));
  return sentences.join(' ');
}
