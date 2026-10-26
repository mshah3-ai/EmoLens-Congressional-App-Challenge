/**
 * Background work (SPEC 11.4, 11.8). Tasks must be defined when the JavaScript bundle loads, so this file is imported
 * at the top of app/_layout.tsx; iOS/Android may start the app in the background just to run them.
 *   emolens-refresh   every 30+ minutes (the OS decides): weather, health, calendar, geofences, dose upkeep (25 s budget)
 *   emolens-geofence  arrival at / departure from a tagged place → place visit
 */
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import type { LocationRegion } from 'expo-location';
import { LocationGeofencingEventType } from 'expo-location';
import { all } from '../db/types';
import { applyVisitChange } from '../db/repo/logs';
import { recordError } from '../db/repo/errors';
import { nowIso } from '../db/time';
import { visitChangeForEvent } from '../integrations/geofence';
import { GEOFENCE_TASK } from '../integrations/location';
import { INTEGRATIONS } from '../integrations/registry';
import { runRefresh } from '../integrations/refresh';
import { useSession } from '../store/session';
import { syncNow } from '../sync/engine';

export const REFRESH_TASK = 'emolens-refresh';

/** The open database, booting the app's session first if the OS started us in the background. */
async function readySession() {
  const s = useSession.getState();
  if (s.status !== 'ready') await s.boot();
  const { repo, profile, settings, status } = useSession.getState();
  return status === 'ready' && repo && profile ? { repo, profile, settings } : null;
}

TaskManager.defineTask(REFRESH_TASK, async () => {
  try {
    const session = await readySession();
    if (!session) return BackgroundTask.BackgroundTaskResult.Success;
    // Care Team: upload and download first, so the forecast below uses the team's latest entries (SPEC 23.3)
    await Promise.race([syncNow(), new Promise((r) => setTimeout(r, 10_000))]).catch(() => undefined);
    await runRefresh({ repo: session.repo, profile: session.profile, now: Date.now() }, INTEGRATIONS, { budgetMs: 25_000 });
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

interface GeofenceData { eventType: LocationGeofencingEventType; region: LocationRegion }

TaskManager.defineTask<GeofenceData>(GEOFENCE_TASK, async ({ data, error }) => {
  if (error || !data?.region?.identifier) return;
  const session = await readySession();
  if (!session) return;
  try {
    const { repo, profile, settings } = session;
    const open = await all<{ id: string; place_id: string | null }>(repo.db,
      'SELECT id, place_id FROM place_visits WHERE child_id = ? AND deleted_at IS NULL AND departed_at IS NULL', [profile.id]);
    const places = await all<{ id: string; type: string }>(repo.db, 'SELECT id, type FROM places WHERE child_id = ? AND deleted_at IS NULL', [profile.id]);
    const kind = data.eventType === LocationGeofencingEventType.Enter ? 'enter' : 'exit';
    const change = visitChangeForEvent(open.map((v) => ({ id: v.id, placeId: v.place_id })), places, { kind, placeId: data.region.identifier });
    const source = settings.device_role === 'child_device' ? 'geofence_child_device' : 'geofence_parent';
    if (await applyVisitChange(repo, profile.id, change, nowIso(), source)) useSession.getState().bump();
  } catch (e) {
    await recordError(session.repo.db, 'geofence', e);
  }
});

/** Registers the periodic refresh once (safe to call on every start). */
export async function registerBackgroundTasks(): Promise<void> {
  if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (!(await TaskManager.isTaskRegisteredAsync(REFRESH_TASK))) {
    await BackgroundTask.registerTaskAsync(REFRESH_TASK, { minimumInterval: 30 });
  }
}
