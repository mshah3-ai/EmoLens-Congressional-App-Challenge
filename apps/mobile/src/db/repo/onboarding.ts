/**
 * Onboarding answers (SPEC 8) are collected in memory while the parent moves through the steps, then saved
 * here in ONE transaction when they tap "Go to Today". If the app closes halfway, nothing half-finished is stored.
 */
import type { EpisodeType, Lang, PlaceType } from '@emolens/shared';
import type { ChildRow } from '../rows';
import { setSettings, type Settings } from './settings';
import { seedDefaultStrategies } from './strategies';
import { addMedicationWith, type MedicationInput } from './meds';
import { addPlaceWith } from './logs';
import type { Repo } from './writer';
import type { IntegrationId } from '../../integrations/types';

export interface OnboardingDraft {
  language: Lang;
  mode: 'local_only' | 'account';
  child: {
    nickname: string; birthYear: number | null; homeTz: string; communication: ChildRow['communication'];
    wakeStart: string; wakeEnd: string; typicalSleepHours: number;
  };
  episodesPerWeek: number;
  modeledTypes: EpisodeType[];
  suspectedTriggers: string[];
  /** Indexes into DEFAULT_STRATEGIES, plus names of custom strategies. */
  favoriteDefaults: number[];
  customStrategies: string[];
  medications: MedicationInput[];
  places: { label: string; type: PlaceType; latitude?: number; longitude?: number }[];
  /** Data sources the parent switched on in step 11 (weather is always on; it waits for a home location). */
  integrations: Partial<Record<IntegrationId, boolean>>;
  calendarIds: string[];
  locationTracking: Settings['location_tracking'];
  alerts: Pick<Settings, 'alert_sensitivity' | 'max_alerts_per_day' | 'quiet_hours' | 'end_of_day_time'>;
  units: Settings['units'];
}

export function completeOnboarding(repo: Repo, d: OnboardingDraft): Promise<string> {
  return repo.write(async (w) => {
    const childId = await w.insert('children', {
      nickname: d.child.nickname.trim(),
      birth_year: d.child.birthYear,
      home_tz: d.child.homeTz,
      communication: d.child.communication,
      wake_start: d.child.wakeStart,
      wake_end: d.child.wakeEnd,
      typical_sleep_hours: d.child.typicalSleepHours,
      episodes_per_week_estimate: d.episodesPerWeek,
      modeled_episode_types: JSON.stringify(d.modeledTypes),
    });
    await seedDefaultStrategies(w, childId, d.language, d.favoriteDefaults);
    for (const name of d.customStrategies) {
      await w.insert('strategies', { child_id: childId, name: name.trim(), category: 'other', is_default: 0, active: 1, onboarding_favorite: 1 });
    }
    for (const m of d.medications) await addMedicationWith(w, childId, m);
    for (const p of d.places) {
      const placeId = await addPlaceWith(w, childId, p);
      if (p.latitude != null && p.longitude != null) {
        await w.update('places', placeId, { latitude: p.latitude, longitude: p.longitude });
        // Weather uses the home location rounded to 2 decimals (SPEC 11.4).
        if (p.type === 'home') await setSettings(w.ex, { weather_lat: Math.round(p.latitude * 100) / 100, weather_lon: Math.round(p.longitude * 100) / 100 });
      }
    }
    const integrationState: Settings['integration_state'] = { weather: { enabled: true, lastSyncAt: null, lastSuccessAt: null, lastError: null } };
    for (const [id, on] of Object.entries(d.integrations)) {
      if (on) integrationState[id] = { enabled: true, lastSyncAt: null, lastSuccessAt: null, lastError: null };
    }
    await setSettings(w.ex, {
      language: d.language,
      mode: d.mode,
      units: d.units,
      suspected_triggers: d.suspectedTriggers,
      with_child_default: d.locationTracking === 'my_phone',
      location_tracking: d.locationTracking,
      ...d.alerts,
      integration_state: integrationState,
      calendar_ids: d.calendarIds,
      onboarding_complete: true,
    });
    return childId;
  });
}
