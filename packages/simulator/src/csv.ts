/** Flattens simulator results into CSV text (pure; the Node runner writes the files). */
import type { AlertRow, CoefRow, DailyRow, FamilyResult } from './simulate';

type Cell = string | number | null | undefined;

export function toCsv(rows: Record<string, Cell>[], columns?: string[]): string {
  const cols = columns ?? (rows.length ? Object.keys(rows[0]) : []);
  const esc = (v: Cell) => {
    if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return '';
    const s = typeof v === 'number' ? String(Math.round(v * 1e6) / 1e6) : v;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

/** daily_metrics.csv: one row per family per day; statuses and betas of every trigger as extra columns. */
export function dailyCsv(results: FamilyResult[]): string {
  const rows = results.flatMap((r) => r.daily.map((d: DailyRow) => {
    const { statuses, betas, ...rest } = d;
    const flat: Record<string, Cell> = { ...rest };
    for (const [k, v] of Object.entries(statuses)) flat[`status_${k}`] = v;
    for (const [k, v] of Object.entries(betas)) flat[`beta_${k}`] = v;
    return flat;
  }));
  return toCsv(rows);
}

export const coefficientsCsv = (results: FamilyResult[]) =>
  toCsv(results.flatMap((r) => r.coefs.map((c: CoefRow) => ({ ...c }))));

export const alertsCsv = (results: FamilyResult[]) =>
  toCsv(results.flatMap((r) => r.alerts.map((a: AlertRow) => ({ ...a }))),
    ['family', 'day', 'date', 'index', 'blockStart', 'fireAt', 'status', 'reason', 'p', 'level', 'pTrue', 'intervened', 'episode', 'logged', 'response']);

export const calibrationCsv = (results: FamilyResult[]) =>
  toCsv(results.flatMap((r) => r.calibration.map((c) => ({ ...c }))), ['family', 'bin', 'binLo', 'binHi', 'n', 'meanP', 'meanPTrue', 'rate']);
