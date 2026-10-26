/**
 * The steps every ai-* function takes after its own request check: count the request against the caller's daily
 * limit, then make one Claude API call. Errors are short codes: `ai_unavailable` (502), `daily_limit` (429),
 * `ai_declined` (the model's safety filter said no, even after the automatic fallback).
 */
import { aiConfig, callClaude, chargeAiUse, type AiMessage, type MessageParams } from './ai.ts';
import type { SupabaseClient } from './deps.ts';
import { fail } from './http.ts';

export async function runAi(
  admin: SupabaseClient, userId: string, headers: Record<string, string>, build: (model: string) => MessageParams,
): Promise<{ ok: true; message: AiMessage } | { ok: false; response: Response }> {
  const cfg = aiConfig((n) => Deno.env.get(n));
  // counted first, so the limit holds no matter what happens next (and the limit can be tested without a key)
  if (!await chargeAiUse(admin, userId, cfg.dailyLimit)) return { ok: false, response: fail('daily_limit', 429, headers) };
  const res = await callClaude(build(cfg.model), cfg); // no key set up → ai_unavailable
  if (!res.ok) return { ok: false, response: fail('ai_unavailable', 502, headers) };
  return { ok: true, message: res.message };
}
