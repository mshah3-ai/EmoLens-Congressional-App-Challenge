/**
 * When Care Team sync runs and what one sync does (SPEC 23.3).
 *
 * When: when the app opens or comes back, 5 s after a save (several quick saves count once), in the background refresh,
 * right away when Supabase Realtime says another phone changed something, and on "Sync now".
 *
 * One sync, in order:
 *  1. the owner's first sync uploads the whole history (enable.ts);
 *  2. check this person is still on the team (if not: stop and delete this phone's copy, DECISIONS #118);
 *  3. push what changed here, then pull what changed elsewhere;
 *  4. refresh the team list; a teacher's phone also downloads today's school-hours forecast;
 *  5. if anything arrived: recompute the forecast and refresh the screens.
 * Never in demo mode (SPEC 9.10), never without an account, and never while another sync is running.
 */
import { AppState } from 'react-native';
import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { recordError } from '../db/repo/errors';
import { setSettings } from '../db/repo/settings';
import { setOutboxListener, type Repo } from '../db/repo/writer';
import { localDateOf } from '@emolens/engine';
import { requestForecast } from '../forecast';
import { useSession } from '../store/session';
import { isForbidden, type CloudApi, type CloudError } from '../cloud/api';
import { currentUserId, supabase } from '../cloud/client';
import { cloudApi, usingFakeCloud } from '../cloud/current';
import { initialPush } from './enable';
import { afterPullAlerts } from './alerts';
import { MAX_ATTEMPTS, backoffMs, outboxCount, push } from './push';
import { pull } from './pull';
import { refreshTeam } from './team';
import { SYNC_ORDER } from './tables';

export type SyncState = 'off' | 'idle' | 'syncing' | 'offline' | 'error' | 'removed' | 'signed_out';

interface SyncStatus {
  state: SyncState;
  lastSyncAt: number | null;
  /** Changes waiting to be uploaded. */
  pending: number;
  /** Failed uploads in a row; 10 shows the sync-error banner (SPEC 23.3). */
  attempts: number;
}

/** The i18n key describing each state (Team tab, child device screen). */
export const SYNC_STATE_KEYS: Record<SyncState, string> = {
  off: 'team.sync.off', idle: 'team.sync.idle', syncing: 'team.sync.syncing', offline: 'team.sync.offline',
  error: 'team.sync.error', removed: 'team.sync.removed', signed_out: 'team.sync.signedOut',
};

export const useSyncStatus = create<SyncStatus>(() => ({ state: 'off', lastSyncAt: null, pending: 0, attempts: 0 }));


/** Is Care Team sync on for the open profile? */
function syncTarget(): { repo: Repo; childId: string; userId: string; role: string } | null {
  const { repo, child, settings, isDemo, status } = useSession.getState();
  if (isDemo || status !== 'ready' || !repo || !child || !settings.care_team_enabled || !settings.account_user_id || !settings.member_role) return null;
  return { repo, childId: child.id, userId: settings.account_user_id, role: settings.member_role };
}

let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Syncs now (one at a time; a request during a sync runs one more afterwards). */
export async function syncNow(): Promise<void> {
  if (running) { again = true; return running; }
  const target = syncTarget();
  const api = cloudApi();
  if (!target || !api) { useSyncStatus.setState({ state: 'off' }); return; }
  running = (async () => {
    useSyncStatus.setState({ state: 'syncing' });
    try {
      await syncOnce(target, api);
    } catch (e) {
      await recordError(target.repo.db, 'sync', e);
      useSyncStatus.setState({ state: 'error' });
    } finally {
      running = null;
      if (again) { again = false; requestSync(0); }
    }
  })();
  return running;
}

async function syncOnce(t: NonNullable<ReturnType<typeof syncTarget>>, api: CloudApi): Promise<void> {
  const db = t.repo.db;
  // The session must belong to the account this phone's data was created with.
  if (!usingFakeCloud() && (await currentUserId()) !== t.userId) { useSyncStatus.setState({ state: 'signed_out' }); return; }

  // The owner's first sync uploads everything; uploading the child creates the owner's membership, so it comes first.
  if (t.role === 'owner' && !useSession.getState().settings.care_team_pushed) {
    const err = await initialPush(db, api, t.userId);
    if (err) return fail(db, err);
    await setSettings(db, { care_team_pushed: true });
  }

  const team = await refreshTeam(db, api, t.childId, t.userId);
  if (team.error) return fail(db, team.error);
  if (team.me === 'removed') {
    // SPEC 27.4: the removed person's phone deletes its copy, for every role; there is no "keep" choice (DECISIONS
    // #118). The flag is saved first, so if the app closes before the deletion finishes, the next start finishes it.
    await setSettings(db, { removed_from_team: true });
    useSyncStatus.setState({ state: 'removed' });
    await useSession.getState().leaveRemovedTeam();
    return;
  }

  const pushed = await push(db, api, { userId: t.userId, isOwner: t.role === 'owner' });
  if (pushed.error) return fail(db, pushed.error, pushed.attempts);

  const pulled = await pull(db, api, t.childId);
  if (pulled.error) return fail(db, pulled.error);

  if (t.role === 'teacher') {
    const today = localDateOf(Date.now(), useSession.getState().profile?.homeTz ?? 'UTC');
    const sf = await api.schoolForecasts(t.childId, today);
    if (!sf.error) {
      await db.transaction(async (tx) => {
        await tx.execute('DELETE FROM school_forecasts WHERE child_id = ?', [t.childId]);
        for (const r of sf.data) {
          await tx.execute('INSERT INTO school_forecasts (child_id, local_date, blocks_json, computed_at) VALUES (?, ?, ?, ?)',
            [t.childId, r.local_date, JSON.stringify(r.blocks), r.computed_at]);
        }
      });
    }
  }

  const changed = Object.values(pulled.applied).reduce((a, b) => a + b, 0);
  if (changed) {
    await afterPullAlerts(db, pulled.ids.alert_responses ?? []);
    if (pulled.applied.children) await useSession.getState().reload();
    requestForecast(500);
    useSession.getState().bump();
  }
  useSyncStatus.setState({ state: 'idle', lastSyncAt: Date.now(), pending: await outboxCount(db), attempts: 0 });
}

async function fail(db: Repo['db'], error: CloudError, attempts = 0): Promise<void> {
  const pending = await outboxCount(db);
  if (error.status === 401) { useSyncStatus.setState({ state: 'signed_out', pending }); return; }
  if (isForbidden(error)) {
    // Not allowed at all: most likely removed from the team between two checks. The next sync confirms it.
    useSyncStatus.setState({ state: 'error', pending, attempts });
    return;
  }
  const offline = error.code === 'network' || error.status == null;
  useSyncStatus.setState({ state: attempts >= MAX_ATTEMPTS ? 'error' : offline ? 'offline' : 'error', pending, attempts });
  // try again later: 2^attempts seconds after a failed upload, a minute after anything else
  requestSync(attempts ? backoffMs(attempts) : 60_000);
}

/** Debounced sync (SPEC 23.3: "5 s after local writes (debounced)"). */
export function requestSync(delayMs = 5000): void {
  if (!syncTarget()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; void syncNow(); }, delayMs);
}

/** Tests: resolves when no sync is running. */
export async function syncIdle(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  while (running) await running;
}

// ---------------------------------------------------------------------------------------------------------------
// starting and stopping: saves, app foreground, Realtime
// ---------------------------------------------------------------------------------------------------------------

let channel: RealtimeChannel | null = null;
let channelChild: string | null = null;

function subscribeRealtime(childId: string | null): void {
  const sb = supabase();
  if (!sb || channelChild === childId) return;
  if (channel) { void sb.removeChannel(channel); channel = null; }
  channelChild = childId;
  if (!childId) return;
  // Only a signal: whatever changed, the pull fetches it (and row-level security decides what this phone may see).
  let ch = sb.channel(`child-${childId}`);
  for (const table of SYNC_ORDER) {
    ch = ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `${table === 'children' ? 'id' : 'child_id'}=eq.${childId}` },
      () => requestSync(1000));
  }
  ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: 'memberships', filter: `child_id=eq.${childId}` }, () => requestSync(1000));
  channel = ch.subscribe();
}

let started = false;
/** Called once by the root layout. */
export function startSync(): void {
  if (started) return;
  started = true;
  setOutboxListener(() => requestSync());
  AppState.addEventListener('change', (s) => {
    if (s === 'active') { requestSync(0); subscribeRealtime(syncTarget()?.childId ?? null); }
    else subscribeRealtime(null);
  });
  let last: string | null = null;
  useSession.subscribe(() => {
    const t = syncTarget();
    const key = t ? `${t.childId}|${t.userId}` : null;
    if (key === last) return;
    last = key;
    subscribeRealtime(t?.childId ?? null);
    if (t) requestSync(0); else useSyncStatus.setState({ state: 'off' });
  });
}
