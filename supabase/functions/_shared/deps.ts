/**
 * Third-party code used by the edge functions, pinned to exact versions in one place.
 * `@supabase/server` checks the caller's sign-in token (JWT) and makes two database clients:
 *   - `supabase`: acts as the signed-in user, so row-level security applies;
 *   - `supabaseAdmin`: uses the secret key that only exists inside Supabase's servers and bypasses row-level security.
 *     Functions use it only after checking, in code, that the caller is allowed to do the action.
 * `@anthropic-ai/sdk` is Anthropic's official client for the Claude API (used only by the ai-* functions, Phase 8).
 */
// 1.8.1: Deno refuses packages published less than a day ago (supply-chain protection), and 1.9.0 was too new.
export { createSupabaseContext } from 'npm:@supabase/server@1.8.1';
export type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';
// 0.131.0: the newest release more than a day old on 2026-10-08 (same supply-chain rule as above).
export { default as Anthropic } from 'npm:@anthropic-ai/sdk@0.131.0';
