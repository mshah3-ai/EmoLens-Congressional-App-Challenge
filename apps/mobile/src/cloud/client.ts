/**
 * The Supabase connection (only used once someone creates an account; local-only phones never connect).
 *  - Configured by EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in apps/mobile/.env. The
 *    publishable key is meant to be inside apps: by itself it can read nothing, because row-level security only lets
 *    signed-in team members see their child's rows. The secret key is never in the app.
 *  - Sign-in is an emailed 6-digit code (SPEC 8 step 3). The session (a token that proves who you are) is stored in
 *    the Keychain/Keystore through expo-secure-store, split into pieces because Android limits one item's size.
 *  - `supabaseApi()` implements the small CloudApi that sync uses.
 */
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
// the old name (SPEC 5) still works; Supabase now calls it the publishable key (DECISIONS)
const KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const PORTAL_URL = process.env.EXPO_PUBLIC_PORTAL_URL ?? '';

/** Is this build connected to a Supabase project? (Without it, accounts and Care Team are unavailable.) */
export const cloudConfigured = (): boolean => URL.length > 0 && KEY.length > 0;

const CHUNK = 1800;
const storeOptions: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
const safeKey = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

/** Keychain storage for the sign-in session, in pieces of 1800 characters. */
export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    const k = safeKey(key);
    const count = await SecureStore.getItemAsync(`${k}.n`, storeOptions);
    if (count == null) return null;
    let out = '';
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${k}.${i}`, storeOptions);
      if (part == null) return null;
      out += part;
    }
    return out;
  },
  async setItem(key: string, value: string): Promise<void> {
    const k = safeKey(key);
    await this.removeItem(key);
    const n = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(`${k}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK), storeOptions);
    await SecureStore.setItemAsync(`${k}.n`, String(n), storeOptions);
  },
  async removeItem(key: string): Promise<void> {
    const k = safeKey(key);
    const count = Number((await SecureStore.getItemAsync(`${k}.n`, storeOptions)) ?? 0);
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${k}.${i}`, storeOptions);
    await SecureStore.deleteItemAsync(`${k}.n`, storeOptions);
  },
};

let client: SupabaseClient | null = null;

/** The one Supabase client, or null when the build isn't configured. */
export function supabase(): SupabaseClient | null {
  if (!cloudConfigured()) return null;
  if (!client) {
    client = createClient(URL, KEY, {
      auth: { storage: secureSessionStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    });
    // Refresh the session only while the app is open (Supabase's recommendation for React Native).
    AppState.addEventListener('change', (state) => {
      if (state === 'active') void client?.auth.startAutoRefresh();
      else void client?.auth.stopAutoRefresh();
    });
  }
  return client;
}

/** Tests only. */
export function setSupabaseForTests(c: SupabaseClient | null): void { client = c; }

// ---------------------------------------------------------------------------------------------------------------
// sign-in
// ---------------------------------------------------------------------------------------------------------------

export type AuthError = 'not_configured' | 'invalid_email' | 'wrong_code' | 'rate_limited' | 'offline';

function authError(e: { status?: number; code?: string; message?: string }): AuthError {
  if (e.status === 429 || e.code === 'over_email_send_rate_limit' || e.code === 'over_request_rate_limit') return 'rate_limited';
  if (e.code === 'otp_expired' || e.code === 'invalid_credentials' || e.status === 403 || e.status === 401) return 'wrong_code';
  if (e.code === 'email_address_invalid' || e.code === 'validation_failed' || e.status === 400 || e.status === 422) return 'invalid_email';
  return 'offline';
}

/** Emails a 6-digit sign-in code (an account is created the first time). */
export async function sendCode(email: string): Promise<AuthError | null> {
  const sb = supabase();
  if (!sb) return 'not_configured';
  const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
  return error ? authError(error) : null;
}

/** Checks the code; on success returns the account's id and email. */
export async function verifyCode(email: string, code: string): Promise<{ userId: string; email: string } | { error: AuthError }> {
  const sb = supabase();
  if (!sb) return { error: 'not_configured' };
  const { data, error } = await sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
  if (error || !data.user) return { error: error ? authError(error) : 'wrong_code' };
  return { userId: data.user.id, email: data.user.email ?? email.trim() };
}

export async function signOut(): Promise<void> {
  await supabase()?.auth.signOut({ scope: 'local' }).catch(() => undefined);
}

/** The signed-in account's id, or null. */
export async function currentUserId(): Promise<string | null> {
  const sb = supabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.user.id ?? null;
}

export { supabaseApi } from './supabaseApi';
