/** Shapes of rows as they come out of SQLite (snake_case, same names as the columns in 001_init.sql). */
import type { EpisodeType, PlaceType } from '@emolens/shared';

export interface ChildRow {
  id: string; created_at: string; nickname: string; birth_year: number | null; home_tz: string;
  communication: 'speaking' | 'some_words' | 'minimally_speaking' | 'aac' | 'prefer_not' | null;
  wake_start: string; wake_end: string; typical_sleep_hours: number | null; episodes_per_week_estimate: number;
  modeled_episode_types: string; min_modeled_intensity: number; school_days: string;
}
export interface EpisodeRow {
  id: string; child_id: string; started_at: string; duration_min: number | null; type: EpisodeType;
  intensity: number | null; place_id: string | null; place_type: string | null; antecedent_tags: string;
  antecedent_note: string | null; behavior_tags: string; safety_concern: number; notes: string | null;
  details_complete: number; source: string;
}
export type StrategyCategory = 'sensory' | 'environment' | 'connection' | 'routine' | 'movement' | 'body_needs' | 'preferred_activity' | 'other';
export interface StrategyRow {
  id: string; child_id: string; name: string; category: StrategyCategory; is_default: number; active: number; onboarding_favorite: number;
}
export type StrategyOutcome = 'helped' | 'not_helped' | 'unsure' | 'averted' | 'not_averted' | 'pending';
export interface StrategyUseRow {
  id: string; child_id: string; strategy_id: string; context: 'proactive' | 'during'; episode_id: string | null;
  alert_id: string | null; outcome: StrategyOutcome; used_at: string;
}
export interface MedicationRow {
  id: string; child_id: string; name: string; rxcui: string | null; strength: string | null; form: string | null;
  schedule: string; as_needed: number; reminders_enabled: number; active_from: string; active_to: string | null; notes: string | null;
}
export interface MedSchedule { times: string[]; days: number[]; }
export type DoseStatus = 'pending' | 'taken' | 'late' | 'missed' | 'skipped';
export interface DoseRow {
  id: string; medication_id: string; scheduled_for: string | null; taken_at: string | null; status: DoseStatus; dose_text: string | null;
}
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';
export type MealAmount = 'little' | 'some' | 'most' | 'all';
export interface MealItemJson { name: string; source: 'off' | 'usda' | 'custom'; code: string | null; tags: string[]; }
export interface MealRow {
  id: string; child_id: string; eaten_at: string; meal_type: MealType; items: string; amount: MealAmount | null; notes: string | null;
}
export interface SleepRow {
  id: string; child_id: string; sleep_start: string; sleep_end: string; duration_min: number; quality: number | null;
  night_wakings: number | null; source: string;
}
export const ILLNESS_KINDS = ['cold', 'fever', 'stomach', 'pain', 'constipation', 'allergy', 'dental', 'ear', 'injury', 'other'] as const;
export type IllnessKind = (typeof ILLNESS_KINDS)[number];
export interface IllnessRow {
  id: string; child_id: string; started_at: string; ended_at: string | null; kind: IllnessKind; severity: number; notes: string | null;
}
export interface RoutineRow {
  id: string; child_id: string; local_date: string; start_at: string | null; description: string | null; severity: number;
}
export const PLACE_TYPES: PlaceType[] = ['home', 'school', 'therapy', 'medical', 'relative', 'store_public', 'park_outdoor', 'other'];
export interface PlaceRow {
  id: string; child_id: string; label: string; type: PlaceType; latitude: number | null; longitude: number | null;
  radius_m: number | null; geofence_enabled: number; created_at: string;
}
export interface VisitRow {
  id: string; child_id: string; place_id: string | null; place_type: string; arrived_at: string; departed_at: string | null; source: string;
}
export interface NoteRow { id: string; child_id: string; noted_at: string; text: string; source: string; }
export interface ErrorRow { id: string; at: string; area: string; message: string; }

export const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  if (s == null) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};
