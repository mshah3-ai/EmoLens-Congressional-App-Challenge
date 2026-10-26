/**
 * Everything the four ai-* functions share (SPEC 7.4, 19, 20, 21, 24.2):
 *  - checking what the app sent (only data, in the expected shape and size: never prompts or tools);
 *  - the daily limit per person (AI_DAILY_REQUEST_LIMIT, counted in the ai_usage table);
 *  - building the request to the Claude API and calling it with Anthropic's official SDK.
 * The checks and request builders are pure functions, unit-tested in _tests/ai.test.ts without any network.
 */
import { Anthropic, type SupabaseClient } from './deps.ts';
import {
  ASK_TOOLS, ASK_TOOL_NAMES, STRUCTURED_LOG_SCHEMA, askSystemPrompt, digestSystemPrompt, isLang, sessionPrepSystemPrompt,
  structureSystemPrompt, type Lang,
} from './prompts.ts';

/** The model named in SPEC 5, checked against Anthropic's current model list (2026-10-08). Override: ANTHROPIC_MODEL. */
export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const DEFAULT_DAILY_LIMIT = 60;

export interface AiConfig { apiKey: string | null; model: string; dailyLimit: number; }

export function aiConfig(get: (name: string) => string | undefined): AiConfig {
  const limit = Number(get('AI_DAILY_REQUEST_LIMIT'));
  return {
    apiKey: get('ANTHROPIC_API_KEY')?.trim() || null,
    model: get('ANTHROPIC_MODEL')?.trim() || DEFAULT_MODEL,
    dailyLimit: Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_DAILY_LIMIT,
  };
}

// ------------------------------------------------------------------------------------------------------------------
// checking requests
// ------------------------------------------------------------------------------------------------------------------

/** Biggest request body we accept (a long chat with tool results stays far below this). */
export const AI_MAX_BYTES = 600_000;
export const MAX_TEXT_CHARS = 20_000;

export type Check<T> = { ok: true; value: T } | { ok: false; error: 'bad_request' | 'too_large' };
const bad = { ok: false, error: 'bad_request' } as const;
const tooBig = (v: unknown) => JSON.stringify(v).length > AI_MAX_BYTES;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length > 64) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

type Block = Record<string, unknown>;
export type ChatMessage = { role: 'user' | 'assistant'; content: Block[] };

/** Content blocks the app may send back, by role. Thinking blocks are passed back unchanged (they carry signatures). */
const USER_BLOCKS = new Set(['text', 'tool_result']);
const ASSISTANT_BLOCKS = new Set(['text', 'thinking', 'redacted_thinking', 'tool_use']);

function validBlock(role: 'user' | 'assistant', b: unknown): b is Block {
  if (!isObj(b) || typeof b.type !== 'string') return false;
  if (!(role === 'user' ? USER_BLOCKS : ASSISTANT_BLOCKS).has(b.type)) return false;
  switch (b.type) {
    case 'text': return typeof b.text === 'string';
    case 'tool_result': return typeof b.tool_use_id === 'string' && typeof b.content === 'string'
      && (b.is_error === undefined || typeof b.is_error === 'boolean');
    case 'tool_use': return typeof b.id === 'string' && typeof b.name === 'string' && ASK_TOOL_NAMES.includes(b.name) && isObj(b.input);
    case 'thinking': return typeof b.thinking === 'string' && typeof b.signature === 'string';
    case 'redacted_thinking': return typeof b.data === 'string';
  }
  return false;
}

/** `final`: the app reached its tool-round limit (SPEC 19.2 step 5), so this request must answer without tools. */
export interface AskRequest { messages: ChatMessage[]; language: Lang; tz: string; final: boolean; }

/** ai-ask: `{messages, language, tz, final?}`. Anything else in the body (a "system" or "tools" field, say) is ignored. */
export function checkAskRequest(body: Record<string, unknown>): Check<AskRequest> {
  const { messages, language, tz } = body;
  if (!isLang(language) || !isTimeZone(tz) || !Array.isArray(messages) || messages.length === 0) return bad;
  if (tooBig(messages)) return { ok: false, error: 'too_large' };
  const out: ChatMessage[] = [];
  for (const m of messages) {
    if (!isObj(m) || (m.role !== 'user' && m.role !== 'assistant') || !Array.isArray(m.content) || m.content.length === 0) return bad;
    const role = m.role;
    if (!m.content.every((b) => validBlock(role, b))) return bad;
    // copy only the known fields of each block, so nothing unexpected (like cache settings) gets through
    out.push({ role, content: (m.content as Block[]).map((b) => pickBlock(b)) });
  }
  if (out[0].role !== 'user' || out[out.length - 1].role !== 'user') return bad;
  return { ok: true, value: { messages: out, language, tz, final: body.final === true } };
}

function pickBlock(b: Block): Block {
  switch (b.type) {
    case 'text': return { type: 'text', text: b.text };
    case 'tool_result': return b.is_error === undefined
      ? { type: 'tool_result', tool_use_id: b.tool_use_id, content: b.content }
      : { type: 'tool_result', tool_use_id: b.tool_use_id, content: b.content, is_error: b.is_error };
    case 'tool_use': return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
    case 'thinking': return { type: 'thinking', thinking: b.thinking, signature: b.signature };
    default: return { type: 'redacted_thinking', data: b.data };
  }
}

export interface StructureContext {
  now_local: string; tz: string; medication_names: string[]; strategy_names: string[]; place_labels: string[];
  food_recent_items: string[]; document_type: 'voice_note' | 'school_report' | 'other';
}
export interface StructureRequest { text: string; context: StructureContext; language: Lang; }

const strings = (v: unknown, max = 200) =>
  Array.isArray(v) && v.length <= max && v.every((s) => typeof s === 'string' && s.length <= 200) ? v as string[] : null;

/** ai-structure: `{text, context, language}`. */
export function checkStructureRequest(body: Record<string, unknown>): Check<StructureRequest> {
  const { text, context: c, language } = body;
  if (!isLang(language) || typeof text !== 'string' || !text.trim() || !isObj(c)) return bad;
  if (text.length > MAX_TEXT_CHARS) return { ok: false, error: 'too_large' };
  const lists = [strings(c.medication_names), strings(c.strategy_names), strings(c.place_labels), strings(c.food_recent_items)];
  const docType = c.document_type ?? 'voice_note';
  if (typeof c.now_local !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(c.now_local) || !isTimeZone(c.tz)
    || lists.some((l) => l == null) || (docType !== 'voice_note' && docType !== 'school_report' && docType !== 'other')) return bad;
  const [medication_names, strategy_names, place_labels, food_recent_items] = lists as string[][];
  return { ok: true, value: { text, language, context: {
    now_local: c.now_local.slice(0, 16), tz: c.tz as string, medication_names, strategy_names, place_labels, food_recent_items, document_type: docType,
  } } };
}

/** ai-digest: `{stats, language}` (the week's statistics JSON only). */
export function checkDigestRequest(body: Record<string, unknown>): Check<{ stats: Record<string, unknown>; language: Lang }> {
  const { stats, language } = body;
  if (!isLang(language) || !isObj(stats)) return bad;
  if (tooBig(stats)) return { ok: false, error: 'too_large' };
  return { ok: true, value: { stats, language } };
}

/** ai-session-prep: `{child_id, summary, language}`. */
export function checkSessionPrepRequest(body: Record<string, unknown>): Check<{ childId: string; summary: Record<string, unknown>; language: Lang }> {
  const { child_id, summary, language } = body;
  if (!isLang(language) || typeof child_id !== 'string' || !isObj(summary)) return bad;
  if (tooBig(summary)) return { ok: false, error: 'too_large' };
  return { ok: true, value: { childId: child_id, summary, language } };
}

// ------------------------------------------------------------------------------------------------------------------
// building the Claude API requests
// ------------------------------------------------------------------------------------------------------------------

export type MessageParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

/**
 * Settings shared by every request:
 *  - `fallbacks: 'default'`: if the model's safety filter declines, the API retries on a fallback model by itself;
 *  - automatic prompt caching (`cache_control`), so the fixed prompt and tools are cheaper on the next call.
 * Thinking is left on its default (adaptive): the model decides how much to think; `effort` sets how hard it tries.
 */
const BASE = { cache_control: { type: 'ephemeral' }, fallbacks: 'default' } as const;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export function askParams(req: AskRequest, model: string, now: number): MessageParams {
  return {
    ...BASE, model, max_tokens: 8000,
    system: askSystemPrompt(req.language, req.tz, now),
    tools: ASK_TOOLS as unknown as Anthropic.Beta.Messages.BetaTool[], // fixed JSON schemas (SPEC A.2)
    messages: req.messages as unknown as Anthropic.Beta.Messages.BetaMessageParam[], // checked by checkAskRequest
    output_config: { effort: 'medium' },
    // after the last allowed tool round the model must answer with what it has (the tools stay listed, unchanged)
    ...(req.final ? { tool_choice: { type: 'none' } as const } : {}),
    // The system prompt names today's date, so it changes at midnight. Earlier thinking blocks are then dropped
    // instead of failing the request (the conversation check of "preserved thinking"; DECISIONS #122).
    thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
    betas: [FALLBACK_BETA, 'thinking-binding-controls-2026-08-01'],
  };
}

export function structureParams(req: StructureRequest, model: string): MessageParams {
  const user = `<context>${JSON.stringify(req.context)}</context>\n<text>\n${req.text}\n</text>`;
  return {
    ...BASE, model, max_tokens: 8000,
    system: structureSystemPrompt(req.language),
    messages: [{ role: 'user', content: user }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: STRUCTURED_LOG_SCHEMA } },
    betas: [FALLBACK_BETA],
  };
}

export function digestParams(stats: Record<string, unknown>, language: Lang, model: string): MessageParams {
  return {
    ...BASE, model, max_tokens: 4000,
    system: digestSystemPrompt(language),
    messages: [{ role: 'user', content: JSON.stringify(stats) }],
    output_config: { effort: 'low' },
    betas: [FALLBACK_BETA],
  };
}

export function sessionPrepParams(summary: Record<string, unknown>, language: Lang, model: string): MessageParams {
  return {
    ...BASE, model, max_tokens: 16000,
    system: sessionPrepSystemPrompt(language),
    messages: [{ role: 'user', content: JSON.stringify(summary) }],
    output_config: { effort: 'medium' },
    betas: [FALLBACK_BETA],
  };
}

// ------------------------------------------------------------------------------------------------------------------
// calling the API
// ------------------------------------------------------------------------------------------------------------------

export type AiMessage = Anthropic.Beta.Messages.BetaMessage;
export type AiResult = { ok: true; message: AiMessage } | { ok: false; error: 'ai_unavailable' };

/**
 * One Claude API call. Any failure (no key set up, network, overloaded, a rejected request) becomes `ai_unavailable`;
 * the app then shows a friendly "try again later". The error itself is logged by name only, never its message
 * (which could quote the request).
 */
export async function callClaude(params: MessageParams, cfg: AiConfig, fetchImpl?: typeof fetch): Promise<AiResult> {
  if (!cfg.apiKey) return { ok: false, error: 'ai_unavailable' };
  const client = new Anthropic({ apiKey: cfg.apiKey, maxRetries: 1, timeout: 90_000, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  try {
    return { ok: true, message: await client.beta.messages.create(params) };
  } catch (e) {
    console.error('ai call failed', e instanceof Anthropic.APIError ? `status ${e.status}` : e instanceof Error ? e.name : typeof e);
    return { ok: false, error: 'ai_unavailable' };
  }
}

/** The text of an answer (thinking and other blocks left out). */
export function answerText(m: AiMessage): string {
  return m.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
}

/**
 * The assistant content the app stores and sends back on the next turn. If a fallback happened mid-answer, the API's
 * rule for sending it back is: drop the `fallback` marker and any thinking / tool_use blocks before it (text stays).
 * Block types the app doesn't know are dropped too.
 */
export function echoableContent(m: AiMessage): Block[] {
  const content = m.content as unknown as Block[];
  const lastFallback = content.map((b) => b.type).lastIndexOf('fallback');
  return content.filter((b, i) => {
    if (i < lastFallback) return b.type === 'text';
    return ASSISTANT_BLOCKS.has(b.type as string);
  });
}

// ------------------------------------------------------------------------------------------------------------------
// the daily limit
// ------------------------------------------------------------------------------------------------------------------

/** Counts this request for the user (one per AI call) and says whether it is still within today's limit. */
export async function chargeAiUse(admin: SupabaseClient, userId: string, limit: number): Promise<boolean> {
  const { data, error } = await admin.rpc('ai_usage_increment', { p_user: userId });
  if (error || typeof data !== 'number') throw new Error('ai usage count failed');
  return withinLimit(data, limit);
}

export const withinLimit = (count: number, limit: number) => count <= limit;
