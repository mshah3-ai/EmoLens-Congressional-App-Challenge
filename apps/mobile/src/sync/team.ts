/**
 * The care team as this phone knows it (SPEC 9.8): members, roles and names, copied into `team_members` at every
 * sync for the Team tab and the activity feed. Also tells sync whether this person is still on the team.
 */
import { all, type Db, type Executor } from '../db/types';
import type { CloudApi, CloudError, Membership } from '../cloud/api';

export type MyStatus = 'active' | 'removed';

export interface TeamRow { user_id: string; role: Membership['role']; status: Membership['status']; display_name: string | null; }

/** Downloads the team and saves it. Returns this person's own status, or the error. */
export async function refreshTeam(db: Db, api: CloudApi, childId: string, me: string): Promise<{ me: MyStatus; error: CloudError | null }> {
  const m = await api.memberships(childId);
  if (m.error) return { me: 'active', error: m.error };
  const mine = m.data.find((x) => x.user_id === me);
  // Not on the list, or marked removed: the owner removed this person (RLS then shows only their own row, or none).
  if (!mine || mine.status !== 'active') return { me: 'removed', error: null };
  const p = await api.profiles(m.data.map((x) => x.user_id));
  const names = new Map((p.data ?? []).map((x) => [x.user_id, x.display_name]));
  await db.transaction(async (tx) => {
    await tx.execute('DELETE FROM team_members WHERE child_id = ?', [childId]);
    for (const x of m.data) {
      await tx.execute('INSERT INTO team_members (child_id, user_id, role, status, display_name) VALUES (?, ?, ?, ?, ?)',
        [childId, x.user_id, x.role, x.status, names.get(x.user_id) ?? null]);
    }
  });
  return { me: 'active', error: null };
}

export const teamMembers = (ex: Executor, childId: string) =>
  all<TeamRow>(ex, `SELECT user_id, role, status, display_name FROM team_members WHERE child_id = ? AND status = 'active'
    ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'caregiver' THEN 1 WHEN 'teacher' THEN 2 ELSE 3 END, display_name`, [childId]);

export interface ActivityItem { kind: 'episode' | 'meal' | 'note' | 'strategy' | 'dose' | 'sleep' | 'illness'; at: string; by: string; name: string | null; role: string | null; }

/**
 * The last 50 entries other team members added (SPEC 9.8: "Ms. Lopez logged a hard moment at school, 11:20").
 * Only rows this phone has, so a teacher's feed never shows what RLS keeps from them.
 */
export async function activityFeed(ex: Executor, childId: string, me: string): Promise<ActivityItem[]> {
  const rows = await all<{ kind: ActivityItem['kind']; at: string; by: string }>(ex, `
    SELECT * FROM (
      SELECT 'episode' AS kind, started_at AS at, created_by AS by FROM episodes WHERE child_id = ? AND deleted_at IS NULL
      UNION ALL SELECT 'meal', eaten_at, created_by FROM meals WHERE child_id = ? AND deleted_at IS NULL
      UNION ALL SELECT 'note', noted_at, created_by FROM notes WHERE child_id = ? AND deleted_at IS NULL
      UNION ALL SELECT 'strategy', used_at, created_by FROM strategy_uses WHERE child_id = ? AND deleted_at IS NULL
      UNION ALL SELECT 'sleep', sleep_end, created_by FROM sleep_entries WHERE child_id = ? AND deleted_at IS NULL
      UNION ALL SELECT 'illness', started_at, created_by FROM illness_logs WHERE child_id = ? AND deleted_at IS NULL
      UNION ALL SELECT 'dose', COALESCE(d.taken_at, d.scheduled_for), d.created_by FROM med_doses d JOIN medications m ON m.id = d.medication_id
        WHERE m.child_id = ? AND d.deleted_at IS NULL AND d.status IN ('taken','late')
    ) WHERE by <> ? AND by <> 'local' ORDER BY at DESC LIMIT 50`, [...Array<string>(7).fill(childId), me]);
  const team = new Map((await all<TeamRow>(ex, 'SELECT user_id, role, status, display_name FROM team_members WHERE child_id = ?', [childId]))
    .map((t) => [t.user_id, t]));
  return rows.map((r) => ({ ...r, name: team.get(r.by)?.display_name ?? null, role: team.get(r.by)?.role ?? null }));
}
