/**
 * Scenario configuration (spec 26.1). A scenario describes a population of synthetic families:
 * how often hard moments happen, which factors truly raise the chance (planted triggers), which data
 * sources the family uses, and how diligently the simulated caregiver logs and answers.
 * Pure TypeScript (no Node APIs) so the app's demo mode can import it.
 */
import type { LabelPolicy } from '@emolens/engine';

export interface Scenario {
  name: string;
  seed: number;
  families: number;
  days: number;
  /** Child's wake window, local 'HH:MM'. */
  wake: [string, string];
  /** Chance of a hard moment in an ordinary awake block (all features at 0, morning). */
  baseRatePerBlock: number;
  /** True logit effects of time-of-day features (not triggers). */
  todEffects: Record<string, number>;
  /** Planted triggers: true logit effect per 1 unit of the engine feature. Every other trigger is truly 0. */
  trueEffects: Record<string, number>;
  sources: {
    sleep: boolean; meals: boolean; meds: boolean; calendar: boolean; places: boolean;
    sensor: boolean; weather: boolean; physiology: boolean;
  };
  behavior: {
    logRate: number;
    eodCompletion: number;
    alertResponseRate: number;
    interveneProbWhenAlerted: number;
    interventionEffect: number;
  };
  /** Feature keys the simulated parent suspects in onboarding (prior nudge +0.15). */
  parentSuspected: string[];
  labelPolicy: LabelPolicy;
  /** First simulated local date. Not in spec 26.1 (see DECISIONS). Default 2026-09-07 (a Monday). */
  startDate?: string;
  /** Child's home time zone. Not in spec 26.1 (see DECISIONS). Default America/New_York. */
  timeZone?: string;
  /** Engine overrides for experiment E3 (tau fixed / weak prior). */
  engine?: { tauMode?: 'auto' | number; triggerPriorSdOverride?: number };
}

export const DEFAULT_START_DATE = '2026-09-07';
export const DEFAULT_TIME_ZONE = 'America/New_York';

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : DeepPartial<T[K]>) : T[K] };

/**
 * Returns a copy of `base` with `over` merged in (objects merged key by key; arrays replaced).
 * The effect maps (`trueEffects`, `todEffects`) are replaced whole, so an override can remove an effect.
 */
export function withOverrides(base: Scenario, over: DeepPartial<Scenario>): Scenario {
  const merge = (a: unknown, b: unknown): unknown => {
    if (b === undefined) return a;
    if (b === null || typeof b !== 'object' || Array.isArray(b) || a === null || typeof a !== 'object' || Array.isArray(a)) return b;
    const out: Record<string, unknown> = { ...(a as Record<string, unknown>) };
    for (const [k, v] of Object.entries(b as Record<string, unknown>)) out[k] = merge(out[k], v);
    return out;
  };
  const merged = merge(base, over) as Scenario;
  if (over.trueEffects) merged.trueEffects = { ...(over.trueEffects as Record<string, number>) };
  if (over.todEffects) merged.todEffects = { ...(over.todEffects as Record<string, number>) };
  return merged;
}
