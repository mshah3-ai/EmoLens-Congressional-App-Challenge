/**
 * The portal's only settings: the Supabase project address and its PUBLISHABLE key (made to be public; row-level
 * security decides what each signed-in person can read). The secret key is never used here (SPEC 24.4).
 */
export function supabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in apps/portal/.env.local');
  return { url, key };
}
