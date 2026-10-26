/**
 * Engine tunables (spec Section 5). Every value is documented; changing any of them
 * changes model behavior, so record changes in docs/VALIDATION.md.
 */

/** Length of one modeled time block, in hours. The day has 24 / 2 = 12 blocks. */
export const BLOCK_HOURS = 2;
/** No alerts are sent before this many labeled days (unless early alerts are enabled). */
export const LEARNING_PERIOD_DAYS = 14;
/** Older blocks count less: weight halves every this many days. */
export const RECENCY_HALF_LIFE_DAYS = 90;
/**
 * Candidate global shrinkage values tried by empirical Bayes (Section 13.6).
 * Spec default [0.5, 0.75, 1.0, 1.5]; 0.5 removed after the Phase 2 validation study (docs/VALIDATION.md,
 * tuning log): shrinking the prior sd without shrinking its non-zero mean let the prior alone push
 * truly-null triggers to "likely".
 */
export const TAU_GRID = [0.75, 1.0, 1.5];
/** Newton-Raphson iteration cap and step tolerance (Section 13.4). */
export const MAX_NEWTON_ITERS = 50;
export const NEWTON_TOL = 1e-6;
/**
 * Insight status thresholds (spec 14.3). Tunable per spec 26.6; any change is recorded in
 * docs/VALIDATION.md "Tuning log". `likely` was exposed 20, exposedPos 5, or 1.3 in the spec; "setting A" since
 * 2026-10-24 (VALIDATION Section 4, DECISIONS #144): rare triggers (missed doses, illness) seldom had 5 hard moments
 * right after them by day 90, and the prior's pull kept planned transitions just under 1.3x. P(raises) >= 0.90 and
 * every other rule are unchanged; fake likely/strong stayed under 0.05 on every day in a confirmation run.
 */
export const STATUS_THRESHOLDS = {
  minLabeledDays: 14, minExposed: 10, minUnexposed: 10,
  strong: { labeledDays: 21, exposed: 30, exposedPos: 8, pHarm: 0.975, orLo: 1.2 },
  likely: { exposed: 15, exposedPos: 3, pHarm: 0.90, or: 1.25 },
  possible: { pHarm: 0.80, or: 1.2 },
  protective: { exposed: 20, pHarm: 0.10, or: 1 / 1.3 },
  noClearLink: { exposed: 30, orLo: 1 / 1.5, orHi: 1.5 },
};
/** Minimum logit contribution for a feature to be shown as a "reason". */
export const REASON_MIN_CONTRIBUTION = 0.1;
export const MAX_ALERTS_PER_DAY_DEFAULT = 3;
export const ALERT_COOLDOWN_MIN = 180;
export const ALERT_LEAD_MIN = 30;
export const CONFIRM_DELAY_MIN = 30;
/** z-value for a central 80% interval: Phi^-1(0.9). */
export const Z80 = 1.2815515655446004;
/** Bump when feature definitions change: every block is recomputed. */
export const FEATURE_VERSION = 1;

/** Until this many labeled days exist, tau is fixed at 1 (Section 13.3). */
export const TAU_SELECTION_MIN_DAYS = 30;
/** Minimum evaluable day-ahead predictions before Model Health shows metrics. */
export const MODEL_HEALTH_MIN_PREDICTIONS = 20;
/** Reliability bins for Model Health (Section 18). */
export const RELIABILITY_EDGES = [0, 0.05, 0.1, 0.2, 0.35, 1.0000001];

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/**
 * School hours (local minutes from midnight, 8:00-15:30): the teacher's forecast (SPEC 7.1) and the School report's
 * "only school time" rule (BUGS #23) use the same hours.
 */
export const SCHOOL_HOURS = { start: 8 * 60, end: 15 * 60 + 30 } as const;
