/**
 * The account on this phone (SPEC 8 step 3, 27.4).
 *  - Signing in remembers who is signed in; from then on new entries carry that account's id in `created_by`.
 *  - Signing out: the owner keeps their data on the phone and stops syncing on it (the team keeps the cloud copy);
 *    anyone else's copy of the family's data is deleted from the phone, because it isn't theirs to keep.
 *  - Deleting the account removes everything this person owns in the cloud (account-delete), then everything local.
 */
import type { Db } from '../db/types';
import { setSettings, type Settings } from '../db/repo/settings';
import type { Repo } from '../db/repo/writer';
import type { CloudApi, CloudError } from './api';
import { signOut } from './client';

export async function rememberSignIn(repo: Repo, userId: string, email: string): Promise<void> {
  await setSettings(repo.db, { account_user_id: userId, account_email: email, mode: 'account' });
  repo.env.createdBy = userId;
}

/** What signing out does on this phone: 'keep' (owner or no team) or 'delete' (a team member's copy). */
export const signOutEffect = (s: Pick<Settings, 'member_role' | 'care_team_enabled'>): 'keep' | 'delete' =>
  s.care_team_enabled && s.member_role != null && s.member_role !== 'owner' ? 'delete' : 'keep';

/** Signs out, keeping the phone's data (the caller deletes it when `signOutEffect` says so). */
export async function signOutKeepingData(db: Db, repo: Repo): Promise<void> {
  await signOut();
  await setSettings(db, {
    account_user_id: null, account_email: null, mode: 'local_only', care_team_enabled: false, care_team_pushed: false,
    member_role: null, removed_from_team: false, primary_forecaster: true, receive_alerts: true,
  });
  await db.execute('DELETE FROM outbox');
  await db.execute('DELETE FROM sync_state');
  await db.execute('DELETE FROM team_members');
  repo.env.createdBy = 'local';
}

/** Deletes the account in the cloud. The caller then deletes the phone's data. */
export async function deleteCloudAccount(api: CloudApi): Promise<CloudError | null> {
  const res = await api.call<{ deleted: boolean }>('account-delete', {});
  if (res.error) return res.error;
  await signOut();
  return null;
}
