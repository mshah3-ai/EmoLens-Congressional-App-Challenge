/**
 * The frame every EmoLens edge function runs in:
 *  1. answers the browser's CORS "preflight" (portal only, see http.ts);
 *  2. accepts only POST with a JSON object body;
 *  3. for `auth: 'user'`, checks the sign-in token and finds out who is calling (never trusts a user id in the body);
 *  4. turns any unexpected crash into {"error":"server_error"} without logging the request (it may hold a child's data).
 */
import { createSupabaseContext, type SupabaseClient } from './deps.ts';
import { corsHeaders, fail, readJson } from './http.ts';

export interface Ctx {
  /** The signed-in user's id (from the verified token), or null for public functions. */
  userId: string | null;
  /** Acts as the signed-in user: row-level security applies. */
  supabase: SupabaseClient;
  /** Bypasses row-level security. Only use after an explicit permission check. */
  admin: SupabaseClient;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

export function serveFunction(auth: 'user' | 'none', handler: (ctx: Ctx) => Promise<Response>): void {
  Deno.serve(async (req: Request) => {
    const headers = corsHeaders(req, Deno.env.get('PORTAL_URL'));
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return fail('method_not_allowed', 405, headers);
    try {
      const { data: sc, error } = await createSupabaseContext(req, { auth });
      if (error || !sc) return fail('unauthorized', 401, headers);
      const userId = auth === 'user' ? sc.userClaims?.id ?? null : null;
      if (auth === 'user' && !userId) return fail('unauthorized', 401, headers);
      const body = await readJson(req);
      if (!body) return fail('bad_request', 400, headers);
      return await handler({ userId, supabase: sc.supabase, admin: sc.supabaseAdmin, body, headers });
    } catch (e) {
      // Only the error's name: never the request, the response or the message (which could quote data).
      console.error('function error', e instanceof Error ? e.name : typeof e);
      return fail('server_error', 500, headers);
    }
  });
}

/** Is `userId` an active owner of `childId`? (Checked with the admin client, so it can't be fooled by RLS.) */
export async function isOwner(admin: SupabaseClient, childId: string, userId: string): Promise<boolean> {
  const { data, error } = await admin.from('memberships').select('role')
    .eq('child_id', childId).eq('user_id', userId).eq('status', 'active').eq('role', 'owner').maybeSingle();
  if (error) throw new Error('membership lookup failed');
  return data != null;
}

/** Is `userId` an active member of `childId` with one of `roles`? (Admin client, like isOwner.) */
export async function hasRole(admin: SupabaseClient, childId: string, userId: string, roles: string[]): Promise<boolean> {
  const { data, error } = await admin.from('memberships').select('role')
    .eq('child_id', childId).eq('user_id', userId).eq('status', 'active').in('role', roles).maybeSingle();
  if (error) throw new Error('membership lookup failed');
  return data != null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
