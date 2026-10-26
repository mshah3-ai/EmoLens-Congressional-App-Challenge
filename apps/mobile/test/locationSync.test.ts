/**
 * BUGS.md #8: "Location couldn't sync" after Sync now, with "Always" location. In the iOS Simulator, iOS reports that
 * region monitoring isn't available, so expo-location's startGeofencingAsync throws "Geofencing is not available"
 * (ERR_GEOFENCING_UNAVAILABLE). That isn't a failed sync: EmoLens must explain it and say what to do instead.
 */
import * as Location from 'expo-location';
import { createChild, getChild, toChildProfile } from '../src/db/repo/children';
import { addPlace, listPlaces, setPlaceLocation } from '../src/db/repo/logs';
import en from '@emolens/shared/i18n/en.json';
import { importSummaryText } from '../src/integrations/importSummary';
import { locationIntegration } from '../src/integrations/location';
import { runRefresh } from '../src/integrations/refresh';
import { getIntegrationState, patchIntegrationState } from '../src/integrations/state';
import { computeStatus } from '../src/integrations/status';
import i18n from '../src/i18n';
import { testRepo } from './nodeDb';

jest.mock('expo-task-manager', () => ({ isTaskDefined: jest.fn(() => true), defineTask: jest.fn() }));
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getBackgroundPermissionsAsync: jest.fn(async () => ({ granted: true })),
  hasStartedGeofencingAsync: jest.fn(async () => false),
  startGeofencingAsync: jest.fn(),
  stopGeofencingAsync: jest.fn(async () => undefined),
}));
const start = Location.startGeofencingAsync as jest.Mock;

// The exact error seen in the Simulator (message and code from expo-location 57).
const simulatorError = () => Object.assign(new Error("FunctionCallException: Calling the 'startGeofencingAsync' function has failed\n"
  + '→ Caused by: GeofencingUnavailable: Geofencing is not available'), { code: 'ERR_GEOFENCING_UNAVAILABLE' });

async function setup() {
  const repo = await testRepo();
  await createChild(repo, { nickname: 'Sam', birthYear: null, homeTz: 'America/Chicago', communication: null, wakeStart: '07:00', wakeEnd: '21:00',
    typicalSleepHours: 10, episodesPerWeekEstimate: 3, modeledEpisodeTypes: ['meltdown'] });
  const profile = toChildProfile((await getChild(repo.db))!);
  await addPlace(repo, profile.id, { label: 'School', type: 'school' });
  const [school] = await listPlaces(repo.db, profile.id);
  await setPlaceLocation(repo, school, 37.3230, -122.0322); // Cupertino, like the Simulator's location
  await patchIntegrationState(repo.db, 'location', { enabled: true });
  return { repo, profile };
}
const name = () => 'Location';
const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts);

test('a device that cannot watch places gets an explanation, not "Location couldn\'t sync"', async () => {
  const { repo, profile } = await setup();
  start.mockRejectedValue(simulatorError());
  const report = await runRefresh({ repo, profile, now: Date.now() }, [locationIntegration], { force: true });

  expect(report.failed).toEqual([]);
  expect(report.imported.location).toMatchObject({ notice: 'geofencing_unavailable' });
  const text = importSummaryText(report, t, name);
  expect(text).not.toMatch("couldn't sync");
  expect(text).toContain(en.sources.noticeSync.geofencing_unavailable);

  const state = await getIntegrationState(repo.db, 'location');
  const status = computeStatus({ state, available: true, permission: true, setup: { ready: true } });
  expect(status).toMatchObject({ health: 'limited', detailKey: 'sources.notice.geofencing_unavailable' });
  expect(t(`sources.status.${status.health}`)).toBe('Works partly');
});

test('where geofencing works, places are watched and the notice goes away', async () => {
  const { repo, profile } = await setup();
  start.mockRejectedValueOnce(simulatorError());
  await runRefresh({ repo, profile, now: Date.now() }, [locationIntegration], { force: true });
  start.mockResolvedValue(undefined);
  const report = await runRefresh({ repo, profile, now: Date.now() }, [locationIntegration], { force: true });
  expect(report).toMatchObject({ ran: ['location'], failed: [] });
  expect(start).toHaveBeenLastCalledWith('emolens-geofence', [expect.objectContaining({ latitude: 37.3230, longitude: -122.0322, radius: 150 })]);
  const state = await getIntegrationState(repo.db, 'location');
  expect(computeStatus({ state, available: true, permission: true, setup: { ready: true } }).health).toBe('ok');
});

test('other geofencing errors are still reported as failures', async () => {
  const { repo, profile } = await setup();
  start.mockRejectedValue(new Error('Background location permission is required to do this operation'));
  const report = await runRefresh({ repo, profile, now: Date.now() }, [locationIntegration], { force: true });
  expect(report.failed).toEqual(['location']);
  expect(importSummaryText(report, t, name)).toMatch("Location couldn't sync.");
});
