/**
 * Location and places (SPEC 11.4). Coordinates are only ever stored on this phone; they are removed from anything
 * synced (writer.ts) and only the rounded home location (about 1 km) is used for weather.
 * Geofencing needs "Always" location permission. With "While Using" only, arrivals aren't detected in the background
 * and the parent checks in by hand (Today → Place).
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { all } from '../db/types';
import type { PlaceRow } from '../db/rows';
import { pickRegions } from './geofence';
import type { Integration, SyncContext, SyncResult } from './types';

export const GEOFENCE_TASK = 'emolens-geofence';

export async function locationPermissions(): Promise<{ foreground: boolean; background: boolean }> {
  const fg = await Location.getForegroundPermissionsAsync();
  const bg = fg.granted ? await Location.getBackgroundPermissionsAsync() : { granted: false };
  return { foreground: fg.granted, background: bg.granted };
}

/** Just "While Using" (enough to find the current location when tagging a place). */
export async function requestForegroundLocation(): Promise<boolean> {
  return (await Location.requestForegroundPermissionsAsync()).granted;
}

/** Asks for "While Using" first, then "Always" (both platforms require this order). */
export async function requestLocation(): Promise<{ foreground: boolean; background: boolean }> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return { foreground: false, background: false };
  const bg = await Location.requestBackgroundPermissionsAsync();
  return { foreground: true, background: bg.granted };
}

export async function currentCoords(): Promise<{ latitude: number; longitude: number } | null> {
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
}

/** Address search with the phone's own geocoder (no API key; SPEC 8.10). */
export async function geocodeAddress(address: string): Promise<{ latitude: number; longitude: number } | null> {
  const found = await Location.geocodeAsync(address);
  return found[0] ? { latitude: found[0].latitude, longitude: found[0].longitude } : null;
}

/** expo-location's error when the device can't monitor regions (CLLocationManager.isMonitoringAvailable is false). */
export function isGeofencingUnavailable(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  const text = e instanceof Error ? e.message : String(e);
  return code === 'ERR_GEOFENCING_UNAVAILABLE' || /GeofencingUnavailable|Geofencing is not available/.test(text);
}

/** (Re)starts geofencing for the tagged places that have coordinates, or stops it when it shouldn't run. */
export async function refreshGeofences(ctx: SyncContext): Promise<number> {
  const perms = await locationPermissions();
  const running = TaskManager.isTaskDefined(GEOFENCE_TASK) && (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false));
  const places = await all<PlaceRow>(ctx.repo.db,
    'SELECT * FROM places WHERE child_id = ? AND deleted_at IS NULL AND geofence_enabled = 1 AND latitude IS NOT NULL AND longitude IS NOT NULL', [ctx.profile.id]);
  const shouldRun = perms.background && ctx.settings.location_tracking !== 'manual' && places.length > 0;
  if (!shouldRun) {
    if (running) await Location.stopGeofencingAsync(GEOFENCE_TASK);
    return 0;
  }
  const regions = pickRegions(places).map((p) => ({
    identifier: p.id, latitude: p.latitude as number, longitude: p.longitude as number, radius: p.radius_m ?? 150,
    notifyOnEnter: true, notifyOnExit: true,
  }));
  await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
  return regions.length;
}

export const locationIntegration: Integration = {
  id: 'location',
  isAvailable: async () => true,
  hasPermission: async () => (await locationPermissions()).foreground,
  requestPermission: async () => (await requestLocation()).foreground,
  isDue: (ctx, lastSuccessAt) => !lastSuccessAt || ctx.now - Date.parse(lastSuccessAt) >= 6 * 3_600_000,
  async setupDetail(ctx) {
    const perms = await locationPermissions();
    const withCoords = await all<{ n: number }>(ctx.repo.db,
      'SELECT COUNT(*) AS n FROM places WHERE child_id = ? AND deleted_at IS NULL AND latitude IS NOT NULL', [ctx.profile.id]);
    if (!withCoords[0]?.n) return { ready: false, detailKey: 'sources.locationNoPlaces' };
    if (!perms.background) return { ready: true, detailKey: 'sources.locationWhileUsing' };
    return { ready: true, detailKey: 'sources.locationPlaces', detailParams: { count: withCoords[0].n } };
  },
  async sync(ctx): Promise<SyncResult> {
    try {
      return { changed: await refreshGeofences(ctx) };
    } catch (e) {
      // iOS reports that this device can't monitor regions at all (the iOS Simulator on this Mac can't; DECISIONS #55).
      // That isn't a failed sync: places still work by hand, so say so instead of "Location couldn't sync".
      if (isGeofencingUnavailable(e)) return { changed: 0, notice: 'geofencing_unavailable' };
      throw e;
    }
  },
};

/** Stops watching places (when the parent switches Location off). */
export async function stopGeofences(): Promise<void> {
  if (TaskManager.isTaskDefined(GEOFENCE_TASK) && (await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false))) {
    await Location.stopGeofencingAsync(GEOFENCE_TASK);
  }
}
