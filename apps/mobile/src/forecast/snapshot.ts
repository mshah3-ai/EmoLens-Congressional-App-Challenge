/**
 * The saved result of the latest engine run, in the shape the screens read (Today, Insights, trigger detail).
 * It is plain JSON in the `engine_snapshots` table, so screens never wait for the engine: they show the last run,
 * and the next run replaces it. Reason and effect sentences are already written in the app's language.
 */
import type { Lang, RiskLevel } from '@emolens/shared';
import type { EnabledMap, TimeOfDayRow, WatchItem } from '@emolens/engine';
import { one, type Executor } from '../db/types';

export interface SnapReason { key: string; text: string; estimated: boolean; contribution: number; }

export interface SnapForecast {
  start: number; end: number; localDate: string; index: number;
  p: number; pLo: number; pHi: number; pBaseline: number; level: RiskLevel; timesUsual: number;
  reasons: SnapReason[]; protective: SnapReason | null; estimated: string[];
}

/** One pattern (the shape is shared with the report, the portal and share links). */
export type { SnapInsight } from '@emolens/reports';
import type { SnapInsight } from '@emolens/reports';

export interface ForecastSnapshot {
  version: 1;
  computedAt: number;
  lang: Lang;
  /** Why this run reused the last good fit or failed ("Forecast temporarily unavailable"); null when all went well. */
  fitError: string | null;
  learning: boolean;
  labeledDays: number;
  labeledBlocks: number;
  positives: number;
  p0Child: number;
  tau: number;
  converged: boolean;
  modelFitId: string | null;
  enabled: EnabledMap;
  forecasts: SnapForecast[];
  insights: SnapInsight[];
  timeOfDay: TimeOfDayRow[];
  worthWatching: WatchItem[];
  worthWatchingTested: number;
  worthWatchingAt: number | null;
  /** How long the engine took (ms), shown in About > Diagnostics. */
  engineMs: number;
}

export async function readSnapshot(ex: Executor, childId: string): Promise<ForecastSnapshot | null> {
  const r = await one<{ result_json: string }>(ex, 'SELECT result_json FROM engine_snapshots WHERE child_id = ?', [childId]);
  if (!r) return null;
  try { return JSON.parse(r.result_json) as ForecastSnapshot; } catch { return null; }
}

/** The forecast for the block containing `t`, if any. */
export function forecastAt(s: ForecastSnapshot | null, t: number): SnapForecast | null {
  return s?.forecasts.find((f) => t >= f.start && t < f.end) ?? null;
}
