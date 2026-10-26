/**
 * App session state (zustand, SPEC 3.1). The database is the source of truth for data; this store only keeps
 * handles and small cached values:
 *   - which database is open (real `emolens.db` or demo `emolens-demo.db`) and a `Repo` for it
 *   - the child profile and settings
 *   - `dataVersion`, bumped after every write so screens re-read what they show
 * Boot order: key from Keychain/Keystore -> open encrypted DB -> migrations -> load profile -> daily upkeep.
 */
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { ChildProfile } from '@emolens/shared';
import { migrate } from '../db/migrate';
import { deleteDatabaseFile, openEncrypted } from '../db/opsqlite';
import { deleteKeys, getOrCreateDbKey, getOrCreateDeviceId } from '../db/keys';
import { getChild, toChildProfile } from '../db/repo/children';
import { recordError, safeMessage } from '../db/repo/errors';
import { ensureDoseRows, markMissedDoses } from '../db/repo/meds';
import { getAllSettings, setSettings, SETTING_DEFAULTS, type Settings } from '../db/repo/settings';
import { deleteVoiceFiles } from '../voice/model';
import { Repo } from '../db/repo/writer';
import type { ChildRow } from '../db/rows';
import { buildDemo, type DemoProgress } from '../demo/build';
import { applyImport, type ImportPreview, type ImportResult } from '../backup/import';
import i18n, { currentLang, deviceTimeZone, setLanguage } from '../i18n';
import { toast } from '../ui/Toast';
import { cancelAllNotifications } from '../notifications';
import { stopGeofences } from '../integrations/location';
import { cancelForecastNotifications } from '../notifications/forecast';
import { resetScheduledInfo } from '../forecast/alerts';
import { signOut } from '../cloud/client';

export const REAL_DB = 'emolens.db';
export const DEMO_DB = 'emolens-demo.db';
const DEMO_FLAG = 'emolens.demo.active';
/** After a removal from the care team: only the child's nickname, so the message can name them (DECISIONS #118). */
const REMOVED_NOTICE = 'emolens.removed.notice';

async function readRemovedNotice(): Promise<{ name: string } | null> {
  try {
    const v = JSON.parse((await SecureStore.getItemAsync(REMOVED_NOTICE)) ?? 'null') as { name?: unknown } | null;
    return v ? { name: typeof v.name === 'string' ? v.name : '' } : null;
  } catch {
    return null;
  }
}

/** `building_demo`: the demo profile is being filled with simulated days (a progress screen is shown). */
export type Status = 'booting' | 'building_demo' | 'onboarding' | 'ready' | 'migration_failed' | 'error';

interface SessionState {
  status: Status;
  error: string | null;
  repo: Repo | null;
  isDemo: boolean;
  child: ChildRow | null;
  profile: ChildProfile | null;
  settings: Settings;
  dataVersion: number;
  /** Progress while the demo profile is being built. */
  demoProgress: DemoProgress | null;
  /** Set after this phone's copy was deleted because the owner removed this person from the care team. */
  removedNotice: { name: string } | null;
  boot: () => Promise<void>;
  /** Re-read the child and settings from the database, then refresh screens. */
  reload: () => Promise<void>;
  /** Tell screens that data changed. */
  bump: () => void;
  updateSettings: (values: Partial<Settings>) => Promise<void>;
  setDemo: (on: boolean) => Promise<void>;
  /** Demo only: delete the demo database and simulate it again so it ends today. */
  regenerateDemo: () => Promise<void>;
  deleteAllData: () => Promise<void>;
  /**
   * SPEC 23.3 / 27.4 (DECISIONS #118): the owner removed this person from the care team. Signs out and deletes this
   * phone's copy of the family's data right away (there is no "keep" choice), then shows the removedNotice.
   */
  leaveRemovedTeam: () => Promise<void>;
  /** The person read the notice: back to Welcome. */
  dismissRemovedNotice: () => Promise<void>;
  /** SPEC 22.5: merge a checked backup into this phone's database (or replace this phone's data with it), then reload. */
  importBackup: (preview: ImportPreview, replace: boolean) => Promise<ImportResult>;
  /** Tests only: use an already-open database. */
  useRepoForTests: (repo: Repo) => Promise<void>;
}

async function loadProfile(repo: Repo) {
  const settings = await getAllSettings(repo.db);
  const child = await getChild(repo.db);
  const profile = child ? toChildProfile(child, settings.suspected_triggers) : null;
  return { settings, child, profile };
}

/** Daily upkeep on every app open (SPEC 10.3): create today's dose rows, mark overdue ones missed. */
async function upkeep(repo: Repo, profile: ChildProfile | null) {
  if (!profile) return;
  try {
    await ensureDoseRows(repo, profile);
    await markMissedDoses(repo, profile.id);
  } catch (e) {
    await recordError(repo.db, 'doses', e);
  }
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'booting',
  error: null,
  repo: null,
  isDemo: false,
  child: null,
  profile: null,
  settings: SETTING_DEFAULTS,
  dataVersion: 0,
  demoProgress: null,
  removedNotice: null,

  boot: async () => {
    set({ status: 'booting', error: null });
    get().repo?.db.close();
    try {
      const isDemo = (await SecureStore.getItemAsync(DEMO_FLAG)) === '1';
      const [key, deviceId] = await Promise.all([getOrCreateDbKey(), getOrCreateDeviceId()]);
      const db = openEncrypted(isDemo ? DEMO_DB : REAL_DB, key);
      try {
        await migrate(db);
      } catch (e) {
        // Never delete data on a failed migration (SPEC 29).
        set({ status: 'migration_failed', error: safeMessage(e), repo: new Repo(db, { deviceId, createdBy: 'local' }), isDemo });
        return;
      }
      const repo = new Repo(db, { deviceId, createdBy: 'local' });
      if (isDemo && !(await getChild(db))) {
        // First time in demo mode (or after "Regenerate"): live through ~120 simulated days (SPEC 9.10). Saved afterwards.
        set({ status: 'building_demo', repo, isDemo, demoProgress: { phase: 'simulating', day: 0, days: 0 } });
        try {
          await buildDemo(repo, { lang: currentLang(), tz: deviceTimeZone(), onProgress: (p) => set({ demoProgress: p }) });
        } catch (e) {
          // Never leave the parent stuck in a broken demo: remove it, go back to the real profile, and say so.
          db.close();
          try { deleteDatabaseFile(DEMO_DB, key); } catch { /* ignore */ }
          await SecureStore.deleteItemAsync(DEMO_FLAG);
          set({ demoProgress: null, repo: null });
          await get().boot();
          const real = get().repo;
          if (real) await recordError(real.db, 'demo-build', e);
          toast(i18n.t('demo.buildFailed'));
          return;
        }
        set({ demoProgress: null });
      }
      const { settings, child, profile } = await loadProfile(repo);
      if (!isDemo && settings.removed_from_team) {
        // removed earlier, but the copy wasn't deleted yet (the app closed first, or a phone flagged before #118)
        set({ repo, isDemo, settings, child, profile });
        await get().leaveRemovedTeam();
        return;
      }
      const removedNotice = await readRemovedNotice();
      // new entries carry the signed-in account's id (SPEC 6.1 created_by); never in demo mode
      if (!isDemo && settings.account_user_id) repo.env.createdBy = settings.account_user_id;
      if (child) setLanguage(settings.language);
      await upkeep(repo, profile);
      set((s) => ({
        repo, isDemo, settings, child, profile, removedNotice, dataVersion: s.dataVersion + 1,
        status: settings.onboarding_complete && child ? 'ready' : 'onboarding',
      }));
    } catch (e) {
      set({ status: 'error', error: safeMessage(e) });
    }
  },

  reload: async () => {
    const repo = get().repo;
    if (!repo) return;
    const { settings, child, profile } = await loadProfile(repo);
    set((s) => ({ settings, child, profile, dataVersion: s.dataVersion + 1, status: settings.onboarding_complete && child ? 'ready' : 'onboarding' }));
  },

  bump: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),

  updateSettings: async (values) => {
    const repo = get().repo;
    if (!repo) return;
    await setSettings(repo.db, values);
    if (values.language) setLanguage(values.language);
    set((s) => ({ settings: { ...s.settings, ...values }, dataVersion: s.dataVersion + 1 }));
    if (values.suspected_triggers) await get().reload();
  },

  setDemo: async (on) => {
    // One profile's alerts must never fire while the other is open; the next forecast run schedules the right ones.
    await cancelForecastNotifications().catch(() => undefined);
    resetScheduledInfo();
    if (on) await SecureStore.setItemAsync(DEMO_FLAG, '1');
    else await SecureStore.deleteItemAsync(DEMO_FLAG);
    await get().boot();
  },

  regenerateDemo: async () => {
    if (!get().isDemo) return;
    const key = await getOrCreateDbKey();
    const old = get().repo;
    set({ status: 'booting', repo: null, child: null, profile: null });
    old?.db.close();
    try { deleteDatabaseFile(DEMO_DB, key); } catch { /* file may not exist */ }
    await cancelForecastNotifications().catch(() => undefined);
    resetScheduledInfo();
    await get().boot();
  },

  /** SPEC 27.4: close the DB, delete both database files, the keys, all scheduled notifications, place alerts (geofences), speech models and kept audio. */
  deleteAllData: async () => {
    const key = await getOrCreateDbKey();
    // "booting" first, in the same update that clears the session: the root layout then shows its spinner and every
    // screen that needs a session (Today, …) is removed before anything is deleted (BUGS.md #5).
    const old = get().repo;
    set({ status: 'booting', repo: null, child: null, profile: null });
    old?.db.close();
    for (const name of [REAL_DB, DEMO_DB]) {
      try { deleteDatabaseFile(name, key); } catch { /* file may not exist */ }
    }
    await SecureStore.deleteItemAsync(DEMO_FLAG);
    await deleteKeys();
    await cancelAllNotifications();
    await stopGeofences().catch(() => undefined); // the phone stops watching the family's places (Phase 10 DoD check)
    deleteVoiceFiles(); // speech models and kept voice recordings (Phase 8)
    await get().boot();
  },

  leaveRemovedTeam: async () => {
    // the notice is saved first, so it still shows if the app closes halfway through
    await SecureStore.setItemAsync(REMOVED_NOTICE, JSON.stringify({ name: get().child?.nickname ?? '' }));
    await signOut();
    await get().deleteAllData();
  },

  dismissRemovedNotice: async () => {
    try { await SecureStore.deleteItemAsync(REMOVED_NOTICE); } catch { /* nothing to delete */ }
    set({ removedNotice: null });
  },

  importBackup: async (preview, replace) => {
    const repo = get().repo;
    if (!repo) throw new Error('Session not ready');
    const result = await applyImport(repo.db, preview, { replace });
    if (replace) {
      // the old child's heads-ups and reminders must not fire; the next forecast run schedules the right ones
      await cancelForecastNotifications().catch(() => undefined);
      resetScheduledInfo();
    }
    await get().reload();
    setLanguage(get().settings.language);
    return result;
  },

  useRepoForTests: async (repo) => {
    const { settings, child, profile } = await loadProfile(repo);
    set({ repo, settings, child, profile, isDemo: false, status: child ? 'ready' : 'onboarding', dataVersion: 1 });
  },
}));

/** For screens that only render once the app is ready: non-null repo and child. */
export function useReady() {
  const repo = useSession((s) => s.repo);
  const child = useSession((s) => s.child);
  const profile = useSession((s) => s.profile);
  const settings = useSession((s) => s.settings);
  const bump = useSession((s) => s.bump);
  if (!repo || !child || !profile) throw new Error('Session not ready');
  return { repo, child, profile, settings, bump, tz: profile.homeTz };
}
