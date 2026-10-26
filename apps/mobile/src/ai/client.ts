/**
 * The one door for every AI request (SPEC 19, 27.1). No other code calls an ai-* function. On the way out it:
 *  1. checks the AI features are on (the consent screen was accepted) and the person is signed in;
 *  2. replaces the child's nickname with [CHILD] in every piece of text (user questions, tool results, voice-note
 *     text, the digest statistics). Ask EmoLens answers already contain only [CHILD], and are sent back unchanged
 *     (they carry signatures that must not be altered);
 *  3. turns errors into a few short codes the screens translate. When a request fails and the phone itself has no
 *     internet, the code is "offline" (BUGS #31): with a local test server the request can still reach the server,
 *     which then can't reach the AI.
 */
import { redactDeep, redactText } from '@emolens/shared';
import type { CloudApi } from '../cloud/api';
import { cloudApi } from '../cloud/current';
import { deviceOffline } from '../cloud/network';

export type AiFn = 'ai-ask' | 'ai-structure' | 'ai-digest';
export type AiErrorCode = 'not_enabled' | 'signed_out' | 'daily_limit' | 'ai_unavailable' | 'ai_declined' | 'offline' | 'failed';
export type AiResult<T> = { ok: true; data: T } | { ok: false; error: AiErrorCode };

/** AI calls can take a while (the model may think, or run several tools). */
export const AI_TIMEOUT_MS = 60_000;

/** A content block of an Ask EmoLens message, in the Claude Messages API shape. */
export type ApiBlock = { type: string; [key: string]: unknown };
export interface ApiMessage { role: 'user' | 'assistant'; content: ApiBlock[]; }

/** Redacts the text inside the user's messages (questions and tool results); assistant messages pass unchanged. */
export function redactMessages(messages: ApiMessage[], nickname: string): ApiMessage[] {
  return messages.map((m) => (m.role === 'assistant' ? m : {
    role: m.role,
    content: m.content.map((b) => {
      if (b.type === 'text' && typeof b.text === 'string') return { ...b, text: redactText(b.text, nickname) };
      if (b.type === 'tool_result' && typeof b.content === 'string') return { ...b, content: redactText(b.content, nickname) };
      return redactDeep(b, nickname);
    }),
  }));
}

/** Exactly what will be sent for `fn` (exported so tests can check it). */
export function redactPayload(fn: AiFn, payload: Record<string, unknown>, nickname: string): Record<string, unknown> {
  if (fn === 'ai-ask') {
    const { messages, ...rest } = payload;
    return { ...redactDeep(rest, nickname), messages: redactMessages(messages as ApiMessage[], nickname) };
  }
  return redactDeep(payload, nickname);
}

export interface AiGate { enabled: boolean; signedIn: boolean; }

export async function aiCall<T>(fn: AiFn, payload: Record<string, unknown>, nickname: string, gate: AiGate,
  api: CloudApi | null = cloudApi(), isOffline: () => Promise<boolean> = deviceOffline): Promise<AiResult<T>> {
  if (!gate.enabled) return { ok: false, error: 'not_enabled' };
  if (!gate.signedIn || !api) return { ok: false, error: 'signed_out' };
  const res = await api.call<T>(fn, redactPayload(fn, payload, nickname), { timeoutMs: AI_TIMEOUT_MS });
  if (!res.error) return { ok: true, data: res.data };
  const code = res.error.code;
  if (code === 'daily_limit' || code === 'ai_declined') return { ok: false, error: code };
  if (code === 'network' || await isOffline()) return { ok: false, error: 'offline' };
  if (code === 'ai_unavailable') return { ok: false, error: code };
  if (res.error.status === 401) return { ok: false, error: 'signed_out' };
  return { ok: false, error: 'failed' };
}
