/**
 * @jest-environment node
 *
 * LIVE check of the Phase 8 acceptance against the REAL model (not run by `pnpm test` or CI; it costs a few cents):
 *   supabase start  (with supabase/functions/.env holding ANTHROPIC_API_KEY)
 *   EMOLENS_LIVE_AI=1 pnpm --filter @emolens/mobile test:live-ai
 * A demo family is built for today, a test person signs in to the local Supabase, and the app's real Ask EmoLens loop
 * asks "How many hard moments last week?". The number in the answer must equal the number of hard moments in the
 * range the AI asked the tool for, and that range must be last week (Monday-Sunday, or the 7 days before today).
 * It also tries voice-note structuring and the digest summary once, and prints the real token use and cost.
 */
import { SUSPECTED_TRIGGERS } from '@emolens/shared';
import { StructuredLogSchema } from '@emolens/shared/schemas';
import { DEMO_SUSPECTED } from '@emolens/simulator';
import { addDays, isoWeekday, localDateOf } from '@emolens/engine';
import { buildDemo } from '../src/demo/build';
import { getChild, toChildProfile } from '../src/db/repo/children';
import { getAllSettings } from '../src/db/repo/settings';
import { all, one } from '../src/db/types';
import { supabaseApi } from '../src/cloud/supabaseApi';
import type { CloudApi } from '../src/cloud/api';
import { askEmoLens } from '../src/ai/ask';
import { aiCall } from '../src/ai/client';
import type { ToolEnv } from '../src/ai/tools';
import { writeAiNarrative } from '../src/digest/aiNarrative';
import { email, signIn } from '../../../supabase/tests/integration/local';
import { testRepo } from './nodeDb';

jest.setTimeout(600_000);
const live = process.env.EMOLENS_LIVE_AI === '1' ? describe : describe.skip;
const TZ = 'America/Chicago';
const GATE = { enabled: true, signedIn: true };
/** claude-sonnet-5-5 prices per million tokens (Anthropic's model list, 2026-10-08): input $2, output $10, cache read $0.20. */
const cost = (u: Usage) => (u.input_tokens * 2 + u.output_tokens * 10 + u.cache_read_input_tokens * 0.2 + u.cache_creation_input_tokens * 2.5) / 1e6;
interface Usage { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; }

live('LIVE: the real model through the local Supabase', () => {
  let env: ToolEnv;
  let api: CloudApi;
  const log: { fn: string; body: Record<string, unknown>; reply: unknown }[] = [];

  beforeAll(async () => {
    const now = Date.now();
    const repo = await testRepo();
    await buildDemo(repo, { lang: 'en', tz: TZ, now, days: 30, yieldToUi: false });
    const profile = toChildProfile((await getChild(repo.db))!, SUSPECTED_TRIGGERS.filter((t) => DEMO_SUSPECTED.includes(t.id)).map((t) => t.id));
    env = { repo, profile, settings: await getAllSettings(repo.db), now, lang: 'en' };
    const person = await signIn(email('live-ai'));
    const real = supabaseApi(person.sb);
    api = { ...real, call: async <T,>(fn: string, body: Record<string, unknown>, opts?: { timeoutMs?: number }) => {
      const r = await real.call<T>(fn, body, opts);
      log.push({ fn, body, reply: r.data ?? r.error });
      return r;
    } };
  });

  test('"How many hard moments last week?" is answered with the right number', async () => {
    const out = await askEmoLens(env, { conversationId: 'live-1', question: 'How many hard moments last week?', gate: GATE, api });
    const asks = log.filter((x) => x.fn === 'ai-ask');
    const usage = asks.map((x) => (x.reply as { usage?: Usage }).usage).filter((u): u is Usage => !!u);
    const total = usage.reduce((a, u) => ({ input_tokens: a.input_tokens + u.input_tokens, output_tokens: a.output_tokens + u.output_tokens,
      cache_read_input_tokens: a.cache_read_input_tokens + u.cache_read_input_tokens, cache_creation_input_tokens: a.cache_creation_input_tokens + u.cache_creation_input_tokens }),
    { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
    // the get_episodes calls the model made, and what the tool answered
    const calls = asks.flatMap((x) => ((x.reply as { content?: { type: string; name?: string; input?: { start_date: string; end_date: string } }[] }).content ?? [])
      .filter((b) => b.type === 'tool_use' && b.name === 'get_episodes').map((b) => b.input!));
    const today = localDateOf(env.now, TZ);
    const monday = addDays(today, 1 - isoWeekday(today));
    const calendarWeek = { start_date: addDays(monday, -7), end_date: addDays(monday, -1) };
    const rolling = { start_date: addDays(today, -7), end_date: addDays(today, -1) };
    const counted = async (r: { start_date: string; end_date: string }) => (await all<{ started_at: string }>(env.repo.db,
      'SELECT started_at FROM episodes WHERE child_id = ? AND deleted_at IS NULL', [env.profile.id]))
      .filter((e) => { const d = localDateOf(Date.parse(e.started_at), TZ); return d >= r.start_date && d <= r.end_date; }).length;
    const report = {
      answer: out.ok ? out.answer : out.error, model: (asks[0]?.reply as { model?: string })?.model, rounds: out.ok ? out.rounds : null,
      requests: asks.length, get_episodes_calls: calls, expected_calendar_week: { ...calendarWeek, n: await counted(calendarWeek) },
      expected_last_7_days: { ...rolling, n: await counted(rolling) }, tokens: total, cost_usd: Number(cost(total).toFixed(4)),
    };
    console.log('LIVE ask result', JSON.stringify(report, null, 2));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(calls.length).toBeGreaterThan(0);
    const used = calls[calls.length - 1];
    expect([JSON.stringify(calendarWeek), JSON.stringify(rolling)]).toContain(JSON.stringify({ start_date: used.start_date, end_date: used.end_date }));
    const n = await counted(used);
    expect(out.answer).toMatch(new RegExp(`(^|\\D)${n}(\\D|$)`));
    expect(out.answer).toContain(env.profile.nickname);
    for (const x of log) expect(JSON.stringify(x.body)).not.toContain(env.profile.nickname);
  });

  test('voice-note structuring returns a valid structured log', async () => {
    const res = await aiCall<{ log: unknown }>('ai-structure', {
      text: `${env.profile.nickname} had a big meltdown after school, about 20 minutes. Noise-reducing headphones helped. We forgot the melatonin last night.`,
      language: 'en', context: { now_local: '2026-10-08T18:30', tz: TZ, medication_names: ['Melatonin'], strategy_names: ['Noise-reducing headphones'],
        place_labels: ['School'], food_recent_items: [], document_type: 'voice_note' },
    }, env.profile.nickname, GATE, api);
    console.log('LIVE structure result', JSON.stringify(res, null, 2));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const parsed = StructuredLogSchema.safeParse(res.data.log);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.episodes[0]).toMatchObject({ type: 'meltdown', started_at_local: '2026-10-08T15:30' });
  });

  test('the weekly digest summary is written from the statistics', async () => {
    const week = await one<{ week_start: string }>(env.repo.db, 'SELECT week_start FROM digests ORDER BY week_start DESC LIMIT 1');
    expect(week).toBeTruthy();
    const res = await writeAiNarrative(env.repo, env.profile, week!.week_start, 'en', GATE, api);
    console.log('LIVE digest result', JSON.stringify(res, null, 2));
    expect(res.ok).toBe(true);
    if (res.ok) {
      const words = res.narrative.split(/\s+/).length;
      expect(words).toBeGreaterThan(80);
      expect(words).toBeLessThan(260);
      expect(res.narrative).not.toMatch(/tantrum|outburst|bad behaviou?r/i);
    }
  });
});
