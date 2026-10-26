/**
 * @jest-environment node
 * Removed from the care team (SPEC 23.3, 27.4; DECISIONS #118): a removed member's phone never keeps the child's data.
 * Normally the sync that finds out deletes it (sync.test.ts). This covers a phone that is flagged as removed but still
 * has the copy: the app closed before the deletion finished, or the flag was set by a version that still offered
 * "keep a private copy". The next start deletes it before any screen shows the family's data, and the message stays
 * until OK, also across a restart.
 */
import { completeOnboarding } from '../src/db/repo/onboarding';
import { setSettings } from '../src/db/repo/settings';
import { freshDraft } from '../src/store/onboarding';
import { useSession } from '../src/store/session';
import { deleteDatabaseFile, openEncrypted } from '../src/db/opsqlite';
import { testRepo } from './nodeDb';

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
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    store, AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => { store.set(k, v); }),
    deleteItemAsync: jest.fn(async (k: string) => { store.delete(k); }),
  };
});

const TEACHER = '33333333-3333-4333-8333-333333333333';

test.each(['teacher', 'caregiver'] as const)('a %s phone still flagged as removed deletes its copy at the next start; the message lasts until OK', async (role) => {
  const old = await testRepo();
  await completeOnboarding(old, { ...freshDraft(), child: { ...freshDraft().child, nickname: 'Max', homeTz: 'America/Los_Angeles' } });
  await setSettings(old.db, { account_user_id: TEACHER, care_team_enabled: true, member_role: role, removed_from_team: true });
  jest.mocked(openEncrypted).mockImplementationOnce(() => old.db);
  jest.mocked(deleteDatabaseFile).mockClear();

  const seen: string[] = [];
  const unsub = useSession.subscribe((s) => { if (s.child) seen.push(s.status); });
  await useSession.getState().boot();
  unsub();

  expect(seen).not.toContain('ready'); // no screen ever showed the family's data
  expect(deleteDatabaseFile).toHaveBeenCalledWith('emolens.db', 'key');
  expect(useSession.getState()).toMatchObject({ status: 'onboarding', child: null, removedNotice: { name: 'Max' } });

  // closed before OK: the message is still there at the next start; after OK it is gone for good
  useSession.setState({ removedNotice: null });
  await useSession.getState().boot();
  expect(useSession.getState().removedNotice).toEqual({ name: 'Max' });
  await useSession.getState().dismissRemovedNotice();
  await useSession.getState().boot();
  expect(useSession.getState()).toMatchObject({ status: 'onboarding', removedNotice: null });
});
