/** Trigger insights: effect summary, exposure counts, status rules and hysteresis (spec Section 14). */
import { STATUS_THRESHOLDS, Z80, FEATURE_COPY, fmt, type Lang } from '@emolens/shared';
import type { Fit, TrainingRow } from './logistic';
import { clamp, normalCdf } from './stats';

export type InsightStatus =
  | 'hidden' | 'not_enough_data' | 'strong' | 'likely' | 'possible' | 'protective' | 'no_clear_link' | 'checking';

export interface EffectSummary { or: number; orLo: number; orHi: number; pHarm: number; confidence: number; }

/** Effect of a meaningful change u in feature j. priorSdEff = tau * s_j. */
export function effectSummary(fit: Fit, j: number, u: number, priorSdEff: number): EffectSummary {
  const b = fit.beta[j];
  const sd = Math.sqrt(Math.max(fit.cov[j][j], 0));
  return {
    or: Math.exp(b * u),
    orLo: Math.exp((b - Z80 * sd) * u),
    orHi: Math.exp((b + Z80 * sd) * u),
    pHarm: sd > 0 ? normalCdf(b / sd) : b > 0 ? 1 : b < 0 ? 0 : 0.5,
    confidence: Math.round(100 * clamp(1 - sd / priorSdEff, 0, 1)),
  };
}

export interface ExposureCounts { exposed: number; exposedPos: number; unexposed: number; unexposedPos: number; }

/** Counts over training rows with weight > 0. Signed features count x >= 1 as exposed. */
export function exposureCounts(rows: TrainingRow[], j: number, signed = false): ExposureCounts {
  const c: ExposureCounts = { exposed: 0, exposedPos: 0, unexposed: 0, unexposedPos: 0 };
  for (const r of rows) {
    if (r.w <= 0) continue;
    const exp = signed ? r.x[j] >= 1 : r.x[j] > 0;
    if (exp) { c.exposed++; if (r.y === 1) c.exposedPos++; } else { c.unexposed++; if (r.y === 1) c.unexposedPos++; }
  }
  return c;
}

export interface StatusInput extends ExposureCounts, EffectSummary { enabled: boolean; labeledDays: number; }

/** Status rules, first match wins (spec 14.3). */
export function classifyStatus(i: StatusInput): InsightStatus {
  const T = STATUS_THRESHOLDS;
  if (!i.enabled) return 'hidden';
  if (i.labeledDays < T.minLabeledDays || i.exposed < T.minExposed || i.unexposed < T.minUnexposed) return 'not_enough_data';
  const S = T.strong, L = T.likely, P = T.possible, Pr = T.protective, N = T.noClearLink;
  if (i.labeledDays >= S.labeledDays && i.exposed >= S.exposed && i.exposedPos >= S.exposedPos && i.pHarm >= S.pHarm && i.orLo >= S.orLo) return 'strong';
  if (i.exposed >= L.exposed && i.exposedPos >= L.exposedPos && i.pHarm >= L.pHarm && i.or >= L.or) return 'likely';
  if (i.pHarm >= P.pHarm && i.or >= P.or) return 'possible';
  if (i.exposed >= Pr.exposed && i.pHarm <= Pr.pHarm && i.or <= Pr.or) return 'protective';
  if (i.exposed >= N.exposed && i.orLo >= N.orLo && i.orHi <= N.orHi) return 'no_clear_link';
  return 'checking';
}

/** How strong a claim each status makes. Moving to a lower (or equal, different) rank is a "downgrade". */
export const STATUS_RANK: Record<InsightStatus, number> = {
  strong: 6, likely: 5, possible: 4, protective: 4, no_clear_link: 3, checking: 2, not_enough_data: 1, hidden: 0,
};
/** Sort order for the Insights "Patterns" list (spec 9.4). */
export const STATUS_SORT: InsightStatus[] = ['strong', 'likely', 'possible', 'protective', 'no_clear_link', 'checking', 'not_enough_data', 'hidden'];

/** Per-feature hysteresis state. `lastRawDate` is the local date on which the current `lastRaw` streak began. */
export interface StatusHistoryEntry { displayed: InsightStatus; lastRaw: InsightStatus; lastRawDate: string; }

/**
 * Hysteresis (spec 14.3): upgrades apply at once; a weaker status is shown only after it has been
 * computed on 2 consecutive DAILY fits. The app refits many times a day, so several fits on the same
 * local date count as one. 'hidden' (source turned off) applies at once. `date` = local date of this fit.
 */
export function applyHysteresis(prev: StatusHistoryEntry | undefined, raw: InsightStatus, date: string): StatusHistoryEntry {
  const fresh = { displayed: raw, lastRaw: raw, lastRawDate: date };
  if (!prev) return fresh;
  if (raw === prev.displayed || raw === 'hidden' || STATUS_RANK[raw] > STATUS_RANK[prev.displayed]) return fresh;
  if (prev.lastRaw === raw) return prev.lastRawDate !== date ? fresh : prev; // second day in a row -> apply
  return { displayed: prev.displayed, lastRaw: raw, lastRawDate: date };
}

/**
 * "About 2.1x the usual chance after 2 fewer hours of sleep" / "About 30% lower chance ..." (spec 14.4).
 * An effect that rounds to 1.0x (0.95 to 1.05) is "About the same chance ...": "About 0% lower" read oddly.
 */
export function effectSentence(key: string, unit: number, or: number, lang: Lang = 'en'): string {
  const copy = FEATURE_COPY[key];
  const phrase = copy ? fmt(copy.phrase[lang], { u: unit }, lang) : '';
  if (or.toFixed(1) === '1.0') {
    return lang === 'es' ? `Alrededor de la misma probabilidad ${phrase}` : `About the same chance ${phrase}`;
  }
  if (or >= 1) {
    const n = or.toFixed(1);
    return lang === 'es' ? `Alrededor de ${n}× la probabilidad usual ${phrase}` : `About ${n}× the usual chance ${phrase}`;
  }
  const pct = Math.round((1 - or) * 100);
  return lang === 'es' ? `Alrededor de ${pct}% menos probabilidad ${phrase}` : `About ${pct}% lower chance ${phrase}`;
}

export function rangeSentence(orLo: number, orHi: number, lang: Lang = 'en'): string {
  return lang === 'es'
    ? `(probablemente entre ${orLo.toFixed(1)}× y ${orHi.toFixed(1)}×)`
    : `(likely between ${orLo.toFixed(1)}× and ${orHi.toFixed(1)}×)`;
}
