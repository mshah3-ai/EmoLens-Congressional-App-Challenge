/**
 * The few cloud operations sync needs, behind one small interface. The phone uses the Supabase version (client.ts);
 * the tests use an in-memory fake with the same rules, so sync logic is tested without a network.
 */
export interface CloudError {
  /** Postgres / PostgREST code (e.g. '42501' = not allowed by row-level security) or an HTTP status as text. */
  code: string;
  status: number | null;
  message: string;
}

export type CloudResult<T> = { data: T; error: null } | { data: null; error: CloudError };

export interface Membership { child_id: string; user_id: string; role: 'owner' | 'caregiver' | 'teacher' | 'clinician'; status: 'active' | 'removed'; }
export interface Profile { user_id: string; display_name: string | null; }
export interface ShareLinkRow {
  id: string; audience: 'clinician' | 'school' | 'family'; range_from: string; range_to: string;
  expires_at: string; revoked_at: string | null; created_at: string;
}

export interface CloudApi {
  /** Insert-or-update rows (last-writer-wins happens in the database). `onConflict` = the key columns. */
  upsert(table: string, rows: Record<string, unknown>[], onConflict: string): Promise<CloudResult<null>>;
  /** Rows of one child changed after `since` (server time), oldest first, at most `limit`. */
  pullPage(table: string, childColumn: string, childId: string, since: string, limit: number): Promise<CloudResult<Record<string, unknown>[]>>;
  /** Memberships visible to the signed-in user for this child (the whole team, or just their own if removed). */
  memberships(childId: string): Promise<CloudResult<Membership[]>>;
  profiles(userIds: string[]): Promise<CloudResult<Profile[]>>;
  /** Sets the signed-in user's name shown to their care team. */
  setDisplayName(userId: string, name: string): Promise<CloudResult<null>>;
  /** The school-hours forecast rows of this child from `fromDate` on (for a teacher's phone). */
  schoolForecasts(childId: string, fromDate: string): Promise<CloudResult<{ local_date: string; blocks: unknown; computed_at: string }[]>>;
  /** The child's share links (only the owner can read them; never the snapshot or the token's hash). */
  shareLinks(childId: string): Promise<CloudResult<ShareLinkRow[]>>;
  /** Calls an edge function with the signed-in user's token (default timeout 10 s; the AI functions need longer). */
  call<T>(fn: string, body: Record<string, unknown>, opts?: { timeoutMs?: number }): Promise<CloudResult<T>>;
}

/** Row-level security refused the write (or the user isn't signed in any more). */
export const isForbidden = (e: CloudError) => e.code === '42501' || e.status === 401 || e.status === 403;
