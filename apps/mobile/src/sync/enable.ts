/**
 * Turning on Care Team (SPEC 23.1) and joining someone else's (SPEC 23.2).
 *
 * Turn on (the owner): entries made before the account existed say created_by = 'local'; they become the owner's.
 * Then the first sync uploads the whole history, 500 rows at a time, parents first (`initialPush`). Uploading the
 * same row twice is harmless, so if the phone loses its connection halfway, the next sync simply starts again.
 *
 * Join (anyone invited): the invite code is checked by the invite-accept function, which adds the membership; then
 * the first pull downloads the child and everything this person's role may see.
 */
import { all, type Db } from '../db/types';
import { setSettings, type Settings } from '../db/repo/settings';
import type { CloudApi, CloudError } from '../cloud/api';
import { convertAll } from './push';
import { pull } from './pull';
import { refreshTeam } from './team';
import { SYNC_SPECS } from './tables';

export const INITIAL_BATCH = 500;

/** Every local row, parents first, in batches of 500 (SPEC 23.1). Returns the first error, or null. */
export async function initialPush(db: Db, api: CloudApi, userId: string): Promise<CloudError | null> {
  for (const spec of SYNC_SPECS) {
    for (let offset = 0; ; offset += INITIAL_BATCH) {
      const rows = await all<Record<string, string | number | null>>(db, `SELECT * FROM ${spec.local} ORDER BY id LIMIT ? OFFSET ?`, [INITIAL_BATCH, offset]);
      if (!rows.length) break;
      const converted = await convertAll(db, spec, rows, { userId, isOwner: true });
      if (converted.length) {
        const res = await api.upsert(spec.cloud, converted, spec.naturalKey ? spec.naturalKey.join(',') : 'id');
        if (res.error) return res.error;
      }
      if (rows.length < INITIAL_BATCH) break;
    }
  }
  return null;
}

/** Tables with created_by (all synced tables except places). */
const WITH_CREATED_BY = SYNC_SPECS.filter((s) => s.standard).map((s) => s.local);

/** The owner turns on Care Team on this phone. The upload itself happens in the next sync. */
export async function turnOnCareTeam(db: Db, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    for (const t of WITH_CREATED_BY) await tx.execute(`UPDATE ${t} SET created_by = ? WHERE created_by = 'local'`, [userId]);
    // anything queued earlier is covered by the full upload
    await tx.execute('DELETE FROM outbox');
    await tx.execute('DELETE FROM sync_state');
  });
  await setSettings(db, { care_team_enabled: true, care_team_pushed: false, member_role: 'owner', mode: 'account', removed_from_team: false });
}

export type JoinError = 'not_found' | 'expired' | 'too_many_tries' | 'already_member' | 'offline' | 'no_child';

export interface JoinResult { childId: string; role: NonNullable<Settings['member_role']>; nickname: string | null; }

/** Uses an invite code. For a caregiver or teacher, also downloads the child's data onto this (empty) phone. */
export async function joinCareTeam(db: Db, api: CloudApi, userId: string, code: string,
  choices: { receiveAlerts: boolean; childDevice: boolean }): Promise<JoinResult | { error: JoinError }> {
  const res = await api.call<{ child_id: string; role: JoinResult['role']; nickname: string | null }>('invite-accept', { code });
  if (res.error) {
    const known: JoinError[] = ['not_found', 'expired', 'too_many_tries', 'already_member'];
    return { error: known.includes(res.error.code as JoinError) ? res.error.code as JoinError : 'offline' };
  }
  const { child_id: childId, role, nickname } = res.data;
  if (role === 'clinician') return { childId, role, nickname }; // clinicians use the portal (SPEC 24)

  const pulled = await pull(db, api, childId);
  if (pulled.error) return { error: 'offline' };
  const child = await all<{ id: string }>(db, 'SELECT id FROM children WHERE id = ?', [childId]);
  if (!child.length) return { error: 'no_child' };
  await refreshTeam(db, api, childId, userId);
  await setSettings(db, {
    mode: 'account', care_team_enabled: true, care_team_pushed: true, member_role: role, removed_from_team: false,
    // Only the owner's phone forecasts and creates heads-ups at first (SPEC 6.3); others may still get the heads-ups.
    primary_forecaster: false,
    receive_alerts: role === 'teacher' ? false : choices.receiveAlerts,
    device_role: choices.childDevice ? 'child_device' : 'caregiver_device',
  });
  return { childId, role, nickname };
}
