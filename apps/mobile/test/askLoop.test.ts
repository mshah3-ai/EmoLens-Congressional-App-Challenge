/**
 * @jest-environment node
 *
 * Phase 8 acceptance (SPEC 32): "the tool loop answers 'How many hard moments last week?' correctly from demo data".
 * The demo family is built by the real simulator into a real SQLite database; the real tool executors run on it.
 * Only the AI is a stand-in: a small script that behaves like the model (asks for get_episodes for last week, then
 * answers with the `total` the tool returned). That proves the loop and the tools give the right number. The same
 * question against the real model is in askLoop.live.test.ts (run by hand with a key).
 */
import { SUSPECTED_TRIGGERS } from '@emolens/shared';
import { DEMO_SUSPECTED } from '@emolens/simulator';
import { addDays, isoWeekday, localDateOf } from '@emolens/engine';
import { buildDemo } from '../src/demo/build';
import { getChild, toChildProfile } from '../src/db/repo/children';
import { getAllSettings } from '../src/db/repo/settings';
import { all } from '../src/db/types';
import { askEmoLens, FINAL_ANSWER_NUDGE, MAX_TOOL_ROUNDS, loadConversation, turnsOf } from '../src/ai/ask';
import type { ApiBlock, ApiMessage } from '../src/ai/client';
import type { ToolEnv } from '../src/ai/tools';
import { FakeCloud } from './fakeCloud';
import { testRepo } from './nodeDb';

jest.setTimeout(180_000);

const TZ = 'America/New_York';
const NOW = Date.parse('2026-09-29T15:10:00.000Z'); // Tuesday 11:10 in New York
const QUESTION = 'How many hard moments last week?';
const GATE = { enabled: true, signedIn: true };

let env: ToolEnv;

beforeAll(async () => {
  const repo = await testRepo();
  await buildDemo(repo, { lang: 'en', tz: TZ, now: NOW, days: 30, yieldToUi: false });
  const profile = toChildProfile((await getChild(repo.db))!, SUSPECTED_TRIGGERS.filter((t) => DEMO_SUSPECTED.includes(t.id)).map((t) => t.id));
  env = { repo, profile, settings: await getAllSettings(repo.db), now: NOW, lang: 'en' };
});

/** Last week = the Monday-Sunday week before this one, in the family's time zone. */
function lastWeek(): { from: string; to: string } {
  const today = localDateOf(NOW, TZ);
  const thisMonday = addDays(today, 1 - isoWeekday(today));
  return { from: addDays(thisMonday, -7), to: addDays(thisMonday, -1) };
}

type Body = { messages: ApiMessage[]; language: string; tz: string; final: boolean };
const lastMessage = (b: Body) => b.messages[b.messages.length - 1];
const toolResults = (m: ApiMessage) => m.content.filter((x) => x.type === 'tool_result');

/** Behaves like the model for this question: one get_episodes call, then an answer from the tool's total. */
function scriptedModel(fake: FakeCloud) {
  let n = 0;
  fake.aiHandler = (_fn, raw) => {
    const body = raw as unknown as Body;
    const last = lastMessage(body);
    const results = toolResults(last);
    if (results.length === 0) {
      n++;
      const w = lastWeek();
      return { data: { stop_reason: 'tool_use', content: [
        { type: 'thinking', thinking: '', signature: `sig-${n}` },
        { type: 'text', text: 'Let me check the log.' },
        { type: 'tool_use', id: `toolu_${n}`, name: 'get_episodes', input: { start_date: w.from, end_date: w.to } },
      ] } };
    }
    const r = JSON.parse(String(results[0].content)) as { total: number; range: { from: string; to: string } };
    return { data: { stop_reason: 'end_turn', content: [
      { type: 'text', text: `[CHILD] had ${r.total} hard moments last week (${r.range.from} to ${r.range.to}).` },
    ] } };
  };
}

test('acceptance: "How many hard moments last week?" is answered with the right number from demo data', async () => {
  // the right answer, counted independently: every hard moment whose LOCAL date falls in last Monday..Sunday
  const w = lastWeek();
  const eps = await all<{ id: string; started_at: string }>(env.repo.db, 'SELECT id, started_at FROM episodes WHERE child_id = ? AND deleted_at IS NULL', [env.profile.id]);
  const expected = eps.filter((e) => { const d = localDateOf(Date.parse(e.started_at), TZ); return d >= w.from && d <= w.to; });
  expect(expected.length).toBeGreaterThan(0);

  const fake = new FakeCloud();
  scriptedModel(fake);
  const out = await askEmoLens(env, { conversationId: 'conv-1', question: QUESTION, gate: GATE, api: fake.as('u1') });

  expect(out).toMatchObject({ ok: true, rounds: 1 });
  if (!out.ok) return;
  expect(out.answer).toBe(`${env.profile.nickname} had ${expected.length} hard moments last week (${w.from} Mon to ${w.to} Sun).`);
  // "Based on N entries": exactly last week's hard moments
  expect([...out.sources].sort()).toEqual(expected.map((e) => `E:${e.id}`).sort());

  // the protocol: 2 requests, append-only, the AI's own content sent back unchanged, one tool_result per tool_use
  expect(fake.aiRequests.map((r) => r.fn)).toEqual(['ai-ask', 'ai-ask']);
  const [first, second] = fake.aiRequests.map((r) => r.body as unknown as Body);
  expect(first.messages).toHaveLength(1);
  expect(second.messages[0]).toEqual(first.messages[0]);
  expect(second.messages[1].content).toEqual([
    { type: 'thinking', thinking: '', signature: 'sig-1' },
    { type: 'text', text: 'Let me check the log.' },
    { type: 'tool_use', id: 'toolu_1', name: 'get_episodes', input: { start_date: w.from, end_date: w.to } },
  ]);
  expect(toolResults(second.messages[2]).map((b) => b.tool_use_id)).toEqual(['toolu_1']);
  expect(first).toMatchObject({ language: 'en', tz: TZ, final: false });

  // the tool result: local times with the weekday, a ref on every row, nickname never present
  const result = JSON.parse(String(toolResults(second.messages[2])[0].content)) as { rows: { ref: string; at: string }[]; total: number; truncated: boolean };
  expect(result.total).toBe(expected.length);
  expect(result.truncated).toBe(false);
  for (const row of result.rows) {
    expect(row.ref).toMatch(/^E:/);
    expect(row.at).toMatch(/^2026-09-2\d (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d\d:\d\d$/);
  }
  for (const r of fake.aiRequests) expect(JSON.stringify(r.body).toLowerCase()).not.toContain(env.profile.nickname.toLowerCase());

  // stored for the chat screen: question + final answer (tool rounds hidden), nickname put back
  const stored = await loadConversation(env, 'conv-1');
  expect(stored.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  expect(turnsOf(stored, env.profile.nickname)).toMatchObject([{ question: QUESTION, answer: out.answer, sources: out.sources }]);
});

test('a follow-up question re-sends the earlier conversation byte for byte (append-only)', async () => {
  const fake = new FakeCloud();
  scriptedModel(fake);
  await askEmoLens(env, { conversationId: 'conv-2', question: QUESTION, gate: GATE, api: fake.as('u1') });
  const before = (fake.aiRequests[1].body as unknown as Body).messages;
  const firstAnswer = (await loadConversation(env, 'conv-2'))[3];
  await askEmoLens(env, { conversationId: 'conv-2', question: 'And the week before?', gate: GATE, api: fake.as('u1') });
  const next = (fake.aiRequests[2].body as unknown as Body).messages;
  expect(next.slice(0, 3)).toEqual(before);
  expect(next[3]).toEqual({ role: 'assistant', content: firstAnswer.content });
  expect(next[4]).toEqual({ role: 'user', content: [{ type: 'text', text: 'And the week before?' }] });
});

test(`after ${MAX_TOOL_ROUNDS} tool rounds the app asks for a final answer, and the server is told "no more tools"`, async () => {
  const fake = new FakeCloud();
  let calls = 0;
  fake.aiHandler = (_fn, raw) => {
    const body = raw as unknown as Body;
    calls++;
    if (body.final) return { data: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Here is what I found so far.' }] } };
    return { data: { stop_reason: 'tool_use', content: [
      { type: 'tool_use', id: `t${calls}a`, name: 'get_patterns', input: {} },
      { type: 'tool_use', id: `t${calls}b`, name: 'get_model_health', input: {} },
    ] } };
  };
  const out = await askEmoLens(env, { conversationId: 'conv-3', question: 'Tell me everything', gate: GATE, api: fake.as('u1') });
  expect(out).toMatchObject({ ok: true, rounds: MAX_TOOL_ROUNDS, answer: 'Here is what I found so far.' });
  expect(fake.aiRequests).toHaveLength(MAX_TOOL_ROUNDS + 1);
  const last = fake.aiRequests[MAX_TOOL_ROUNDS].body as unknown as Body;
  expect(last.final).toBe(true);
  // both tool results of a round travel in ONE user message, followed by the "answer now" note
  const lastUser = lastMessage(last);
  expect(lastUser.content.map((b: ApiBlock) => b.type)).toEqual(['tool_result', 'tool_result', 'text']);
  expect(lastUser.content[2]).toEqual({ type: 'text', text: FINAL_ANSWER_NUDGE });
});

test('a bad tool call becomes an error result the AI can read; nothing crashes', async () => {
  const fake = new FakeCloud();
  fake.aiHandler = (_fn, raw) => {
    const body = raw as unknown as Body;
    const results = toolResults(lastMessage(body));
    if (results.length === 0) return { data: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'x1', name: 'get_episodes', input: { start_date: 'last week' } }] } };
    return { data: { stop_reason: 'end_turn', content: [{ type: 'text', text: `error=${results[0].is_error}; ${String(results[0].content)}` }] } };
  };
  const out = await askEmoLens(env, { conversationId: 'conv-4', question: QUESTION, gate: GATE, api: fake.as('u1') });
  expect(out).toMatchObject({ ok: true });
  if (out.ok) expect(out.answer).toBe('error=true; {"error":"start_date must be a date like 2026-10-05"}');
});

test('errors: AI off (nothing sent), the daily limit, the AI declining; a failed turn leaves no half conversation', async () => {
  const fake = new FakeCloud();
  const off = await askEmoLens(env, { conversationId: 'conv-5', question: QUESTION, gate: { enabled: false, signedIn: true }, api: fake.as('u1') });
  expect(off).toEqual({ ok: false, error: 'not_enabled' });
  expect(fake.aiRequests).toHaveLength(0);

  fake.aiHandler = () => ({ error: 'daily_limit', status: 429 });
  expect(await askEmoLens(env, { conversationId: 'conv-5', question: QUESTION, gate: GATE, api: fake.as('u1') })).toEqual({ ok: false, error: 'daily_limit' });
  fake.aiHandler = () => ({ data: { stop_reason: 'refusal', content: [] } });
  expect(await askEmoLens(env, { conversationId: 'conv-5', question: QUESTION, gate: GATE, api: fake.as('u1') })).toEqual({ ok: false, error: 'ai_declined' });
  expect(await loadConversation(env, 'conv-5')).toEqual([]);
});
