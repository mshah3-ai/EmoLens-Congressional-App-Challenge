/**
 * A Supabase client for server code (pages, route handlers, server actions) acting as the signed-in person: their
 * session lives in cookies, so every query goes through row-level security as them. Made fresh for each request.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseEnv } from '../env';

export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = supabaseEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a server component, where cookies are read-only; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

/** The signed-in user's id, or null. getClaims() checks the token's signature (unlike reading the session). */
export async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return (data?.claims?.sub as string | undefined) ?? null;
}
