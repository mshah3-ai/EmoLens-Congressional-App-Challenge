/**
 * FEATURE_REGISTRY (spec Section 12.4). Order in this array = order in the model's vector.
 * Priors are in logit units per 1 unit of the feature.
 */

export type FeatureGroup =
  | 'baseline' | 'sleep' | 'food' | 'medication' | 'schedule' | 'place'
  | 'sensory' | 'weather' | 'health' | 'physiology' | 'missingness';

/** Which data source must be in use for the feature to enter a fit (Section 12.5). */
export type DataRequirement =
  | 'always' | 'sleep' | 'food' | 'medication' | 'calendar' | 'schedule_any' | 'place'
  | 'sensory' | 'weather' | 'pollen' | 'steps' | 'physiology' | 'illness';

export interface FeatureDef {
  key: string;
  group: FeatureGroup;
  isTrigger: boolean;
  unit: number;
  priorMean: number;
  priorSd: number;
  requires: DataRequirement;
  labelKey: string;
  phraseKey: string;
  /** For signed features, "exposed" means x >= 1 instead of x > 0 (Section 14.2). */
  signed?: boolean;
}

const f = (key: string, group: FeatureGroup, isTrigger: boolean, unit: number, priorMean: number, priorSd: number,
  requires: DataRequirement, signed = false): FeatureDef =>
  ({ key, group, isTrigger, unit, priorMean, priorSd, requires, labelKey: `feature.${key}.label`, phraseKey: `feature.${key}.phrase`, signed });

export const FEATURE_REGISTRY: FeatureDef[] = [
  // baseline (intercept prior mean is computed per child, see interceptPriorMean)
  f('intercept', 'baseline', false, 1, 0, 1.0, 'always'),
  f('tod_midday', 'baseline', false, 1, 0, 0.5, 'always'),
  f('tod_afternoon', 'baseline', false, 1, 0, 0.5, 'always'),
  f('tod_evening', 'baseline', false, 1, 0, 0.5, 'always'),
  f('weekend', 'baseline', false, 1, 0, 0.4, 'always'),
  f('school_day', 'baseline', false, 1, 0, 0.4, 'always'),
  f('recent_episode', 'baseline', false, 1, 0.4, 0.4, 'always'),
  // missingness indicators
  f('sleep_missing', 'missingness', false, 1, 0, 0.5, 'sleep'),
  f('meal_missing', 'missingness', false, 1, 0, 0.5, 'food'),
  f('noise_missing', 'missingness', false, 1, 0, 0.3, 'sensory'),
  f('physio_missing', 'missingness', false, 1, 0, 0.3, 'physiology'),
  // triggers
  f('sleep_deficit', 'sleep', true, 2, 0.25, 0.25, 'sleep'),
  f('night_wakings', 'sleep', true, 2, 0.10, 0.20, 'sleep'),
  f('hunger_gap', 'food', true, 2, 0.15, 0.25, 'food'),
  f('high_sugar_recent', 'food', true, 1, 0.0, 0.30, 'food'),
  f('caffeine_recent', 'food', true, 1, 0.10, 0.30, 'food'),
  f('missed_dose', 'medication', true, 1, 0.30, 0.35, 'medication'),
  f('late_dose', 'medication', true, 1, 0.10, 0.30, 'medication'),
  f('med_change_recent', 'medication', true, 1, 0.20, 0.35, 'medication'),
  f('planned_transitions', 'schedule', true, 1, 0.20, 0.25, 'calendar'),
  f('arrival_recent', 'place', true, 1, 0.15, 0.25, 'place'),
  f('unusual_day', 'schedule', true, 1, 0.30, 0.35, 'schedule_any'),
  f('appointment_near', 'schedule', true, 1, 0.25, 0.35, 'calendar'),
  f('new_place', 'place', true, 1, 0.25, 0.35, 'place'),
  f('place_school', 'place', true, 1, 0, 0.5, 'place'),
  f('place_therapy_medical', 'place', true, 1, 0, 0.5, 'place'),
  f('place_store_public', 'place', true, 1, 0, 0.5, 'place'),
  f('place_other', 'place', true, 1, 0, 0.5, 'place'),
  f('noise_high', 'sensory', true, 1, 0.15, 0.25, 'sensory'),
  f('temp_uncomfortable', 'sensory', true, 1, 0.05, 0.25, 'sensory'),
  f('pressure_change', 'weather', true, 1, 0.05, 0.20, 'weather'),
  f('heat_or_cold', 'weather', true, 1, 0.05, 0.25, 'weather'),
  f('poor_air', 'weather', true, 1, 0.05, 0.25, 'weather'),
  f('pollen_high', 'weather', true, 1, 0.05, 0.25, 'pollen'),
  f('illness', 'health', true, 1, 0.50, 0.40, 'illness'),
  f('low_activity_yesterday', 'health', true, 1, 0.10, 0.25, 'steps'),
  f('resting_hr_up', 'physiology', true, 1, 0.10, 0.20, 'physiology', true),
  f('hrv_down', 'physiology', true, 1, 0.10, 0.20, 'physiology', true),
  f('hr_elevated_pre', 'physiology', true, 1, 0.15, 0.20, 'physiology', true),
];

export const FEATURE_INDEX: Record<string, number> =
  Object.fromEntries(FEATURE_REGISTRY.map((d, i) => [d.key, i]));

export const FEATURE_BY_KEY: Record<string, FeatureDef> =
  Object.fromEntries(FEATURE_REGISTRY.map((d) => [d.key, d]));

export const TRIGGER_KEYS = FEATURE_REGISTRY.filter((d) => d.isTrigger).map((d) => d.key);
export const BASELINE_MODEL_KEYS = ['intercept', 'tod_midday', 'tod_afternoon', 'tod_evening', 'weekend'];
export const TOD_KEYS = ['tod_midday', 'tod_afternoon', 'tod_evening'];

/** Parent-suspected nudge (Section 12.4). */
export const SUSPECTED_PRIOR_NUDGE = 0.15;
