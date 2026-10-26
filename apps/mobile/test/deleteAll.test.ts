/**
 * @jest-environment node
 * Bug (BUGS.md #5): "Delete all data" crashed with "Render Error: Session not ready". The store cleared the database
 * handle and child while still saying status "ready", so Today stayed on screen for a moment with no session.
 * Rule tested here: the store must never be "ready" without a database and a child, and must end in onboarding.
 */
import { completeOnboarding } from '../src/db/repo/onboarding';
import { freshDraft } from '../src/store/onboarding';
import { useSession } from '../src/store/session';
import { testRepo } from './nodeDb';

// Place alerts are registered with the phone's OS; "Delete all data" must stop them too (SPEC 27.4).
jest.mock('expo-task-manager', () => ({ isTaskDefined: jest.fn(() => true), defineTask: jest.fn() }));
jest.mock('expo-location', () => ({
  hasStartedGeofencingAsync: jest.fn(async () => true),
  stopGeofencingAsync: jest.fn(async () => undefined),
}));
jest.mock('../src/db/opsqlite', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use imports
  openEncrypted: jest.fn(() => require('./nodeDb').nodeDb()), // a brand-new empty database, like after deletion
  deleteDatabaseFile: jest.fn(),
}));
jest.mock('../src/db/keys', () => ({
  getOrCreateDbKey: jest.fn(async () => 'key'),
  getOrCreateDeviceId: jest.fn(async () => 'device'),
  deleteKeys: jest.fn(async () => undefined),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null), setItemAsync: jest.fn(async () => undefined), deleteItemAsync: jest.fn(async () => undefined),
}));

test('deleting all data never leaves a "ready" session without a database or child, and ends in onboarding', async () => {
  const repo = await testRepo();
  await completeOnboarding(repo, { ...freshDraft(), child: { ...freshDraft().child, nickname: 'Sam', homeTz: 'America/Chicago' } });
  await useSession.getState().useRepoForTests(repo);
  expect(useSession.getState().status).toBe('ready');

  const seen: { status: string; repo: boolean; child: boolean; profile: boolean }[] = [];
  const unsub = useSession.subscribe((s) => seen.push({ status: s.status, repo: !!s.repo, child: !!s.child, profile: !!s.profile }));
  await useSession.getState().deleteAllData();
  unsub();

  const broken = seen.filter((s) => s.status === 'ready' && (!s.repo || !s.child || !s.profile));
  expect(broken).toEqual([]);
  expect(useSession.getState().status).toBe('onboarding');
  expect(useSession.getState().child).toBeNull();
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the mocked module, read after the run
  expect(require('expo-location').stopGeofencingAsync).toHaveBeenCalled();
});
