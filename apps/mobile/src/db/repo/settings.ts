/**
 * Typed access to the `settings` key/value table (SPEC 6.3). Values are stored as JSON text.
 * Keys marked "added" are not in the spec's table; see docs/DECISIONS.md.
 */
import type { StatusHistoryEntry } from '@emolens/engine';
import type { Executor } from '../types';

export interface Settings {
  mode: 'local_only' | 'account';
  device_role: 'caregiver_device' | 'child_device';
  alert_sensitivity: 'fewer' | 'balanced' | 'more';
  max_alerts_per_day: number;
  quiet_hours: { start: string; end: string };
  early_alerts_enabled: boolean;
  end_of_day_time: string;
  digest_day_time: { weekday: number; time: string };
  cloud_ai_enabled: boolean;
  ai_share_event_titles: boolean;
  /** added (Phase 8): which on-device speech model voice notes use (SPEC 20.1: tiny by default, base for accuracy). */
  voice_model: 'tiny' | 'base';
  recency_half_life_days: number;
  app_lock: boolean;
  with_child_default: boolean;
  primary_forecaster: boolean;
  receive_alerts: boolean;
  noise_threshold_db: number;
  morning_outlook: boolean;
  units: 'imperial' | 'metric';
  language: 'en' | 'es';
  weather_lat: number | null;
  weather_lon: number | null;
  /** added: Care Team sync is on (outbox rows are written only then). Turned on in Phase 7. */
  care_team_enabled: boolean;
  /** added (Phase 7): the signed-in account on this phone (null = no account). Its id goes in created_by. */
  account_user_id: string | null;
  account_email: string | null;
  /** added (Phase 7): this person's role on the child's care team (null = not on a team yet). */
  member_role: 'owner' | 'caregiver' | 'teacher' | 'clinician' | null;
  /** added (Phase 7): the owner's first full upload of history after turning on Care Team has finished. */
  care_team_pushed: boolean;
  /** added (Phase 7): the owner removed this person from the care team (this phone's copy is then deleted, DECISIONS #118). */
  removed_from_team: boolean;
  /** added (Phase 7): local date of the last insight snapshot this phone uploaded (one per day, SPEC 7.2). */
  last_snapshot_date: string | null;
  /** added (Phase 7): tokens of the share links made on this phone, by link id, so they can be copied again later
   * (the cloud keeps only a hash). Stays in the encrypted database; never exported. */
  share_tokens: Record<string, string>;
  /** added: onboarding step 7 answers (ids from SUSPECTED_TRIGGERS). */
  suspected_triggers: string[];
  /** added: onboarding step 10 "Whose phone tracks where your child is?" */
  location_tracking: 'my_phone' | 'child_device' | 'manual';
  /** added: true once onboarding has finished. */
  onboarding_complete: boolean;
  /** added (Phase 4): per data source on/off switch, last sync and last error (see integrations/state.ts). */
  integration_state: Record<string, IntegrationStateEntry>;
  /** added (Phase 4): ids of the calendars the parent chose to read (SPEC 11.3). */
  calendar_ids: string[];
  /** added (Phase 4): the parent's own calendar keywords per tag, added to the built-in rules (SPEC 11.3). */
  calendar_keywords: Record<string, string[]>;
  /** added (Phase 4): measure room sound for 60 s when the hard-moment sheet opens (SPEC 11.6). */
  sound_check_on_episode: boolean;
  /** added (Phase 4): phone microphone dBFS -> estimated dB offset (SPEC 11.6; calibrated by the room sensor in Phase 9). */
  phone_db_offset: number;
  /** SPEC 14.3: per-feature pattern status history for hysteresis (engine `StatusHistoryEntry`). */
  insight_status_history: Record<string, StatusHistoryEntry>;
  /** added (Phase 5): features whose "EmoLens found a likely pattern" notification was already sent (SPEC 14.3). */
  notified_insights: string[];
  /** added (Phase 5): "Help me discover what works" (Thompson sampling suggestions, SPEC 9.6 / 17). */
  strategy_discovery: boolean;
  /** added (Phase 5, demo profile only): the data sources were simulated, so treat weather and calendar as connected. */
  simulated_sources: boolean;
  /** added (Phase 5, demo profile only): when the simulated history was built and the last day it covers. */
  demo_info: DemoInfo | null;
}

export interface DemoInfo { builtAt: string; lastDate: string; days: number; buildMs: number; }

export interface IntegrationStateEntry {
  enabled: boolean;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  /** false when the last successful sync found no data at all (see SyncResult.foundData); null = not tracked. */
  lastFoundData?: boolean | null;
  /** SyncResult.notice from the last successful sync (e.g. 'geofencing_unavailable'); null = none. */
  lastNotice?: string | null;
}

export const SETTING_DEFAULTS: Settings = {
  mode: 'local_only',
  device_role: 'caregiver_device',
  alert_sensitivity: 'balanced',
  max_alerts_per_day: 3,
  quiet_hours: { start: '21:00', end: '07:00' },
  early_alerts_enabled: false,
  end_of_day_time: '20:30',
  digest_day_time: { weekday: 7, time: '18:00' },
  cloud_ai_enabled: false,
  ai_share_event_titles: false,
  voice_model: 'tiny',
  recency_half_life_days: 90,
  app_lock: false,
  with_child_default: true,
  primary_forecaster: true,
  receive_alerts: true,
  noise_threshold_db: 70,
  morning_outlook: true,
  units: 'imperial',
  language: 'en',
  weather_lat: null,
  weather_lon: null,
  care_team_enabled: false,
  account_user_id: null,
  account_email: null,
  member_role: null,
  care_team_pushed: false,
  removed_from_team: false,
  last_snapshot_date: null,
  share_tokens: {},
  suspected_triggers: [],
  location_tracking: 'my_phone',
  onboarding_complete: false,
  integration_state: {},
  calendar_ids: [],
  calendar_keywords: {},
  sound_check_on_episode: true,
  phone_db_offset: 90,
  insight_status_history: {},
  notified_insights: [],
  strategy_discovery: false,
  simulated_sources: false,
  demo_info: null,
};

export async function getSetting<K extends keyof Settings>(ex: Executor, key: K): Promise<Settings[K]> {
  const r = await ex.execute('SELECT value FROM settings WHERE key = ?', [key]);
  if (!r.rows.length) return SETTING_DEFAULTS[key];
  return JSON.parse(String(r.rows[0].value)) as Settings[K];
}

export async function getAllSettings(ex: Executor): Promise<Settings> {
  const out: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const row of (await ex.execute('SELECT key, value FROM settings')).rows) {
    out[String(row.key)] = JSON.parse(String(row.value));
  }
  return out as unknown as Settings;
}

export async function setSetting<K extends keyof Settings>(ex: Executor, key: K, value: Settings[K]): Promise<void> {
  await ex.execute('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, JSON.stringify(value)]);
}

export async function setSettings(ex: Executor, values: Partial<Settings>): Promise<void> {
  for (const [k, v] of Object.entries(values)) await setSetting(ex, k as keyof Settings, v as never);
}

/**
 * A teacher's phone (SPEC 7.1) holds only what teachers may see: no sleep, medications or home data. It doesn't run
 * the forecast (it would be wrong without that data); it shows the school-hours forecast the family shares instead.
 */
export const isTeacherPhone = (s: Pick<Settings, 'member_role' | 'care_team_enabled'>): boolean =>
  s.care_team_enabled && s.member_role === 'teacher';
