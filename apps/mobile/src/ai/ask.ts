/**
 * Ask EmoLens (SPEC 19.2): the "agentic" loop that answers a question from this phone's own data.
 *
 *  1. The question (nickname replaced by [CHILD]) goes to the ai-ask function with the conversation so far.
 *  2. If the AI answers with tool calls ("get_episodes for Sep 28 - Oct 4"), the phone runs each tool on its own
 *     database and sends all the results back in one message. Repeat.
 *  3. After 6 tool rounds the phone asks for a final answer with what it has (the server then allows no more tools).
 *  4. The final text is shown with the nickname put back, plus "Based on N entries" (the refs the tools returned).
 *
 * The conversation is append-only: every message is stored exactly as sent or received, and sent again unchanged on
 * the next question (the AI's thinking blocks carry signatures that must not change).
 */
import { restoreText } from '@emolens/shared';
import { all } from '../db/types';
import { newId } from '../db/time';
import { aiCall, redactMessages, type AiErrorCode, type AiGate, type ApiBlock, type ApiMessage } from './client';
import { runTool, type ToolEnv } from './tools';
import type { CloudApi } from '../cloud/api';

export const MAX_TOOL_ROUNDS = 6;
/** Same words as the server's FINAL_ANSWER_NUDGE (supabase/functions/_shared/prompts.ts). */
export const FINAL_ANSWER_NUDGE = 'Please answer now using only the information you already have.';

interface StoredMessage extends ApiMessage { id: string; sources: string[]; createdAt: string; }

export async function loadConversation(env: ToolEnv, conversationId: string): Promise<StoredMessage[]> {
  const rows = await all<{ id: string; role: 'user' | 'assistant'; content_json: string; sources_json: string; created_at: string }>(env.repo.db,
    'SELECT id, role, content_json, sources_json, created_at FROM chat_messages WHERE child_id = ? AND conversation_id = ? ORDER BY created_at, rowid',
    [env.profile.id, conversationId]);
  return rows.map((r) => ({ id: r.id, role: r.role, content: JSON.parse(r.content_json) as ApiBlock[], sources: JSON.parse(r.sources_json) as string[], createdAt: r.created_at }));
}

/** The newest conversation's id, or null when there is none yet. */
export async function latestConversationId(env: ToolEnv): Promise<string | null> {
  const r = await all<{ conversation_id: string }>(env.repo.db,
    'SELECT conversation_id FROM chat_messages WHERE child_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1', [env.profile.id]);
  return r[0]?.conversation_id ?? null;
}

export interface ChatTurn { id: string; question: string; answer: string | null; sources: string[]; createdAt: string; }

const textOf = (blocks: ApiBlock[]) => blocks.flatMap((b) => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : [])).join('\n').trim();
const isToolResults = (m: ApiMessage) => m.role === 'user' && m.content.some((b) => b.type === 'tool_result');

/** What the chat screen shows: each question with its final answer (tool rounds hidden), nickname put back. */
export function turnsOf(messages: StoredMessage[], nickname: string): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of messages) {
    if (m.role === 'user' && !isToolResults(m)) {
      turns.push({ id: m.id, question: restoreText(textOf(m.content), nickname), answer: null, sources: [], createdAt: m.createdAt });
    } else if (m.role === 'assistant' && turns.length > 0) {
      const t = turns[turns.length - 1];
      const text = textOf(m.content);
      if (text) t.answer = restoreText(text, nickname);
      if (m.sources.length) t.sources = m.sources;
    }
  }
  return turns;
}

export type AskOutcome =
  | { ok: true; answer: string; sources: string[]; rounds: number }
  | { ok: false; error: AiErrorCode | 'empty' };

interface AskReply { content: ApiBlock[]; stop_reason: string | null; }

export interface AskOptions { conversationId: string; question: string; gate: AiGate; api?: CloudApi | null; }

export async function askEmoLens(env: ToolEnv, o: AskOptions): Promise<AskOutcome> {
  const nickname = env.profile.nickname;
  const history: ApiMessage[] = (await loadConversation(env, o.conversationId)).map(({ role, content }) => ({ role, content }));
  // the new messages of this turn (saved only when the turn finishes, so a failed turn leaves no half conversation)
  const added: ApiMessage[] = [{ role: 'user', content: [{ type: 'text', text: o.question.trim() }] }];
  const sources: string[] = [];
  let rounds = 0;

  for (;;) {
    const res = await aiCall<AskReply>('ai-ask', {
      messages: [...history, ...added], language: env.lang, tz: env.profile.homeTz, final: rounds >= MAX_TOOL_ROUNDS,
    }, nickname, o.gate, o.api);
    if (!res.ok) return { ok: false, error: res.error };
    const reply = res.data;
    // stored as sent back next time: the same redaction the request will apply (idempotent on [CHILD] text)
    added.push({ role: 'assistant', content: reply.content });
    if (reply.stop_reason === 'refusal') return { ok: false, error: 'ai_declined' };
    const calls = reply.content.filter((b) => b.type === 'tool_use');
    if (reply.stop_reason !== 'tool_use' || calls.length === 0 || rounds >= MAX_TOOL_ROUNDS) break;
    rounds++;
    // run every tool of this round, and send all results back in ONE message
    const results: ApiBlock[] = [];
    for (const call of calls) {
      const run = await runTool(String(call.name), call.input, env);
      for (const r of run.refs) if (!sources.includes(r)) sources.push(r);
      results.push(run.isError
        ? { type: 'tool_result', tool_use_id: String(call.id), content: run.content, is_error: true }
        : { type: 'tool_result', tool_use_id: String(call.id), content: run.content });
    }
    if (rounds >= MAX_TOOL_ROUNDS) results.push({ type: 'text', text: FINAL_ANSWER_NUDGE });
    added.push({ role: 'user', content: results });
  }

  const answer = textOf(added[added.length - 1].content);
  if (!answer) return { ok: false, error: 'empty' };
  await saveTurn(env, o.conversationId, added, sources);
  return { ok: true, answer: restoreText(answer, nickname), sources, rounds };
}

/**
 * Saves the turn's messages. User text is stored already redacted (exactly what was sent), so the conversation sent
 * next time is byte-for-byte the same; screens put the nickname back when showing it.
 */
async function saveTurn(env: ToolEnv, conversationId: string, messages: ApiMessage[], sources: string[]): Promise<void> {
  const stored = redactMessages(messages, env.profile.nickname);
  const base = Date.now();
  await env.repo.db.transaction(async (tx) => {
    for (let i = 0; i < stored.length; i++) {
      const last = i === stored.length - 1;
      await tx.execute(
        'INSERT INTO chat_messages (id, child_id, conversation_id, role, content_json, sources_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [newId(), env.profile.id, conversationId, stored[i].role, JSON.stringify(stored[i].content), JSON.stringify(last ? sources : []),
          new Date(base + i).toISOString()]);
    }
  });
}

/** "Clear conversation": the old messages are deleted; the next question starts a new conversation. */
export async function clearConversations(env: ToolEnv): Promise<string> {
  await env.repo.db.execute('DELETE FROM chat_messages WHERE child_id = ?', [env.profile.id]);
  return newConversationId();
}

export const newConversationId = (): string => newId();
