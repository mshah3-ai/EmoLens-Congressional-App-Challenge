/**
 * Helpers for tests against the LOCAL Supabase (`supabase start`). Test people sign in exactly like real ones: an
 * emailed 6-digit code, which the local stack delivers to Mailpit (http://127.0.0.1:54324) instead of a real inbox.
 * No secret key is used. `db()` connects to the local database directly, only to set up situations the app can't
 * create on purpose (an expired share link) and to check that deleted data is really gone.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';
import { fetch as undiciFetch } from 'undici';

/**
 * Node's own HTTP client, used for every request here: the app's test setup (Expo's runtime) replaces the global fetch,
 * and these helpers are shared with the app's real-cloud test.
 */
const http = undiciFetch as unknown as typeof fetch;

export interface LocalEnv { url: string; publishableKey: string; dbUrl: string; mailpit: string; }

/** The repository folder (the one with supabase/config.toml), found from the current folder upwards. */
function repoRoot(): string {
  let dir = process.cwd();
  while (!existsSync(join(dir, 'supabase', 'config.toml'))) {
    const up = dirname(dir);
    if (up === dir) throw new Error('supabase/config.toml not found: run `supabase init` / start from the repository');
    dir = up;
  }
  return dir;
}

let cached: LocalEnv | null = null;
/** Reads the local stack's addresses and its (fixed, non-secret) publishable key from `supabase status`. */
export function localEnv(): LocalEnv {
  if (cached) return cached;
  const out = execFileSync('supabase', ['status', '-o', 'env'], { cwd: repoRoot(), encoding: 'utf8' });
  const env = Object.fromEntries(out.split('\n').map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter((m): m is RegExpMatchArray => !!m).map((m) => [m[1], m[2]]));
  const publishableKey = env.PUBLISHABLE_KEY ?? env.ANON_KEY;
  if (!env.API_URL || !publishableKey) throw new Error('Local Supabase is not running: run `supabase start`');
  cached = { url: env.API_URL, publishableKey, dbUrl: env.DB_URL, mailpit: env.MAILPIT_URL ?? env.INBUCKET_URL ?? 'http://127.0.0.1:54324' };
  return cached;
}

export const anonClient = (): SupabaseClient =>
  createClient(localEnv().url, localEnv().publishableKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: http } });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface MailSummary { ID: string; Created: string }

async function messagesTo(email: string): Promise<MailSummary[]> {
  const res = await http(`${localEnv().mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}&limit=20`);
  return ((await res.json()) as { messages?: MailSummary[] }).messages ?? [];
}

/**
 * The ids of the emails `email` has already received. Take this BEFORE asking for a code, then pass it to `codeFor`.
 * (Comparing times doesn't work: Docker's clock can be a minute off from the Mac's.)
 */
export async function inbox(email: string): Promise<Set<string>> {
  return new Set((await messagesTo(email)).map((m) => m.ID));
}

/** The 6-digit code in the first email to `email` that wasn't in `seen` (Mailpit's API). */
export async function codeFor(email: string, seen: Set<string>): Promise<string> {
  for (let i = 0; i < 80; i++) {
    const msg = (await messagesTo(email)).find((m) => !seen.has(m.ID));
    if (msg) {
      const body = (await (await http(`${localEnv().mailpit}/api/v1/message/${msg.ID}`)).json()) as { Text?: string; HTML?: string };
      const code = /\b(\d{6})\b/.exec(`${body.Text ?? ''} ${body.HTML ?? ''}`)?.[1];
      if (code) return code;
    }
    await sleep(250);
  }
  throw new Error(`no sign-in code arrived for ${email}`);
}

/** A client signed in as `email` (the account is created on first sign-in), and its user id. */
export async function signIn(email: string): Promise<{ sb: SupabaseClient; userId: string }> {
  const sb = anonClient();
  const seen = await inbox(email);
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
  const { data, error: e2 } = await sb.auth.verifyOtp({ email, token: await codeFor(email, seen), type: 'email' });
  if (e2 || !data.user) throw e2 ?? new Error('no user');
  return { sb, userId: data.user.id };
}

/** A unique test address, so tests never collide with earlier runs. */
export const email = (who: string) => `${who}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.local`;

/** Calls an edge function; returns the HTTP status and the JSON body. */
export async function call(sb: SupabaseClient | null, fn: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: localEnv().publishableKey };
  const token = sb ? (await sb.auth.getSession()).data.session?.access_token : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await http(`${localEnv().url}/functions/v1/${fn}`, { method: 'POST', headers, body: JSON.stringify(body) });
  let json: Record<string, unknown> = {};
  try { json = (await res.json()) as Record<string, unknown>; } catch { /* empty */ }
  return { status: res.status, body: json };
}

/** A direct connection to the local database (superuser): for test setup and checks only. */
export async function db<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: localEnv().dbUrl });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

/** Standard columns for a row made "on a phone". */
export const std = (userId: string, device = 'test-device') => {
  const now = new Date().toISOString();
  return { created_at: now, updated_at: now, created_by: userId, device_id: device };
};

/** A child owned by `owner`, created the way the app does it (insert as the owner; the owner membership follows). */
export async function makeChild(owner: { sb: SupabaseClient; userId: string }, nickname = 'Sam'): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await owner.sb.from('children').insert({ id, owner_id: owner.userId, nickname, home_tz: 'America/Chicago', episodes_per_week_estimate: 3, ...std(owner.userId) });
  if (error) throw error;
  return id;
}

/** Invites `role` and has `who` accept; returns the membership's role. */
export async function addMember(owner: { sb: SupabaseClient }, childId: string, who: { sb: SupabaseClient }, role: string): Promise<string> {
  const inv = await call(owner.sb, 'invite-create', { child_id: childId, role });
  if (inv.status !== 200) throw new Error(`invite-create ${inv.status} ${JSON.stringify(inv.body)}`);
  const acc = await call(who.sb, 'invite-accept', { code: inv.body.code });
  if (acc.status !== 200) throw new Error(`invite-accept ${acc.status} ${JSON.stringify(acc.body)}`);
  return String(acc.body.role);
}
