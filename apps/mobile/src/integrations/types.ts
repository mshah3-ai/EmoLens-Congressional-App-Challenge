/**
 * Every automatic data source is a module with the same four functions (SPEC 11):
 *   isAvailable()      can this phone use it at all (e.g. Apple Health exists only on iPhone)?
 *   requestPermission() ask the operating system for access (after EmoLens has explained why)
 *   sync(ctx)          fetch new data and save it; must be safe to run twice (upsert by external id)
 *   status(ctx)        is it connected, off, missing permission, or failing?
 */
import type { ChildProfile } from '@emolens/shared';
import type { Settings } from '../db/repo/settings';
import type { Repo } from '../db/repo/writer';

export type IntegrationId = 'weather' | 'location' | 'calendar' | 'health' | 'sound';

export interface SyncContext {
  repo: Repo;
  profile: ChildProfile;
  settings: Settings;
  now: number;
}

/** What one sync brought in that wasn't there before, for "Imported 1 night, 1 heart-rate reading." */
export type ImportKind = 'nights' | 'heart_rate' | 'resting_hr' | 'hrv' | 'steps' | 'events' | 'weather_hours';
export type ImportSummary = Partial<Record<ImportKind, number>>;

export interface SyncResult {
  changed: number;
  note?: string;
  summary?: ImportSummary;
  /**
   * Whether the source returned any data at all in its time window (not just new data). Set only by sources where
   * "nothing at all" is suspicious: iOS never tells apps if Health read access was refused, it just returns nothing.
   */
  foundData?: boolean;
  /**
   * The sync worked but this phone can't do part of the job, e.g. 'geofencing_unavailable': the device can't watch places
   * in the background (the iOS Simulator can't; BUGS.md #8). Shown as "Works partly" with what to do instead.
   */
  notice?: SyncNotice;
}

export type SyncNotice = 'geofencing_unavailable';

/** What the Data sources screen and Today's chips show. */
export type IntegrationHealth = 'ok' | 'limited' | 'off' | 'needs_permission' | 'needs_setup' | 'error' | 'no_data' | 'unavailable';

export interface IntegrationStatus {
  health: IntegrationHealth;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  /** Extra plain-language detail (i18n key + params), e.g. "3 calendars" or "Allowed only while using the app". */
  detailKey?: string;
  detailParams?: Record<string, string | number>;
}

export interface Integration {
  id: IntegrationId;
  isAvailable(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  hasPermission(): Promise<boolean>;
  /** Whether sync needs running now (e.g. weather every 3 h). */
  isDue(ctx: SyncContext, lastSuccessAt: string | null): boolean;
  sync(ctx: SyncContext): Promise<SyncResult>;
  /** Anything extra the source needs before it can sync (e.g. calendars chosen, home location set). */
  setupDetail?(ctx: SyncContext): Promise<{ ready: boolean; detailKey?: string; detailParams?: Record<string, string | number> }>;
}
