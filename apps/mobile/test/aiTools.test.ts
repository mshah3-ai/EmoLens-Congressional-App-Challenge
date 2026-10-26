/**
 * @jest-environment node
 *
 * The Ask EmoLens tool executors (SPEC 19.2 "Tool result rules", Appendix A.2) on demo data: every tool runs without
 * an error, rows carry refs and local times with the weekday, results are capped at 200 rows, place coordinates are
 * never included, and calendar titles appear only when the parent allowed it.
 */
import { SUSPECTED_TRIGGERS } from '@emolens/shared';
import { DEMO_SUSPECTED } from '@emolens/simulator';
import { buildDemo } from '../src/demo/build';
import { getChild, toChildProfile } from '../src/db/repo/children';
import { getAllSettings } from '../src/db/repo/settings';
import { all } from '../src/db/types';
import { TOOL_EXECUTORS, runTool, type ToolEnv } from '../src/ai/tools';
import { MAX_ROWS, localStamp } from '../src/ai/tools/common';
import { testRepo } from './nodeDb';

jest.setTimeout(180_000);

const TZ = 'America/New_York';
const NOW = Date.parse('2026-09-29T15:10:00.000Z');
let env: ToolEnv;

beforeAll(async () => {
  const repo = await testRepo();
  await buildDemo(repo, { lang: 'en', tz: TZ, now: NOW, days: 60, yieldToUi: false });
  const profile = toChildProfile((await getChild(repo.db))!, SUSPECTED_TRIGGERS.filter((t) => DEMO_SUSPECTED.includes(t.id)).map((t) => t.id));
  env = { repo, profile, settings: await getAllSettings(repo.db), now: NOW, lang: 'en' };
});

/** The tool list of the server (supabase/functions/_shared/prompts.ts), copied here to check every tool has an executor. */
const SERVER_TOOLS = ['get_episodes', 'get_day_summary', 'get_patterns', 'get_worth_watching', 'get_forecast', 'get_strategy_stats',
  'get_medications', 'get_dose_history', 'get_meals', 'get_sleep', 'compare_periods', 'get_model_health', 'search_notes'];

const INPUTS: Record<string, Record<string, unknown>> = {
  get_episodes: { start_date: '2026-09-01', end_date: '2026-09-28' },
  get_day_summary: { date: '2026-09-25' },
  get_patterns: {},
  get_worth_watching: {},
  get_forecast: { date: '2026-09-30' },
  get_strategy_stats: { context: 'both' },
  get_medications: {},
  get_dose_history: { start_date: '2026-09-01', end_date: '2026-09-28' },
  get_meals: { start_date: '2026-09-20', end_date: '2026-09-28' },
  get_sleep: { start_date: '2026-09-01', end_date: '2026-09-28' },
  compare_periods: { metric: 'episode_count', a_start: '2026-09-01', a_end: '2026-09-14', b_start: '2026-09-15', b_end: '2026-09-28' },
  get_model_health: {},
  search_notes: { query: 'loud' },
};

test('one executor per server tool, and every tool runs on demo data without an error', async () => {
  expect(Object.keys(TOOL_EXECUTORS).sort()).toEqual([...SERVER_TOOLS].sort());
  for (const name of SERVER_TOOLS) {
    const run = await runTool(name, INPUTS[name], env);
    expect({ name, isError: run.isError }).toEqual({ name, isError: false });
    expect(() => JSON.parse(run.content)).not.toThrow();
  }
});

test('rows carry refs and local times with the weekday; the refs match the rows', async () => {
  const run = await runTool('get_meals', INPUTS.get_meals, env);
  const res = JSON.parse(run.content) as { rows: { ref: string; at: string }[]; total: number };
  expect(res.total).toBeGreaterThan(0);
  expect(run.refs).toEqual(res.rows.map((r) => r.ref));
  for (const r of res.rows) {
    expect(r.ref).toMatch(/^F:/);
    expect(r.at).toMatch(/^2026-09-\d\d (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d\d:\d\d$/);
  }
  // a DST-free check of the stamp itself: 15:10 UTC is 11:10 in New York on Tuesday 2026-09-29
  expect(localStamp(NOW, TZ)).toBe('2026-09-29 Tue 11:10');
});

test('at most 200 rows, with the total and truncated: true', async () => {
  const run = await runTool('get_meals', { start_date: '2026-08-01', end_date: '2026-09-28' }, env);
  const res = JSON.parse(run.content) as { rows: unknown[]; total: number; truncated: boolean };
  expect(res.total).toBeGreaterThan(MAX_ROWS);
  expect(res.rows).toHaveLength(MAX_ROWS);
  expect(res.truncated).toBe(true);
  expect(run.refs).toHaveLength(MAX_ROWS);
});

test('place coordinates are never in any result; labels are', async () => {
  await env.repo.db.execute("UPDATE places SET latitude = 41.123456, longitude = -87.654321");
  for (const name of SERVER_TOOLS) {
    const text = (await runTool(name, INPUTS[name], env)).content;
    expect(text).not.toContain('41.123456');
    expect(text).not.toContain('87.654321');
    expect(text).not.toMatch(/latitude|longitude/);
  }
});

test('calendar event titles are shared only when the parent turned that on', async () => {
  const day = await all<{ start_at: string; title: string }>(env.repo.db,
    "SELECT start_at, title FROM calendar_events WHERE ignored = 0 AND title IS NOT NULL AND tags != '[]' ORDER BY start_at DESC LIMIT 1");
  expect(day.length).toBe(1);
  const date = day[0].start_at.slice(0, 10);
  const hidden = await runTool('get_day_summary', { date }, { ...env, settings: { ...env.settings, ai_share_event_titles: false } });
  const shown = await runTool('get_day_summary', { date }, { ...env, settings: { ...env.settings, ai_share_event_titles: true } });
  expect(hidden.content).not.toContain(day[0].title);
  expect(shown.content).toContain(day[0].title);
  expect(JSON.parse(hidden.content).schedule.length).toBeGreaterThan(0); // the tags still are
});

test('bad input is an error the AI can read: wrong dates, reversed ranges, unknown tools and metrics', async () => {
  const bad: [string, Record<string, unknown>][] = [
    ['get_episodes', { start_date: 'yesterday', end_date: '2026-09-28' }],
    ['get_episodes', { start_date: '2026-09-28', end_date: '2026-09-01' }],
    ['get_episodes', { start_date: '2020-01-01', end_date: '2026-09-28' }],
    ['compare_periods', { metric: 'happiness', a_start: '2026-09-01', a_end: '2026-09-02', b_start: '2026-09-03', b_end: '2026-09-04' }],
    ['search_notes', { query: '  ' }],
    ['run_shell', {}],
  ];
  for (const [name, input] of bad) {
    const run = await runTool(name, input, env);
    expect({ name, isError: run.isError }).toEqual({ name, isError: true });
    expect(JSON.parse(run.content).error).toEqual(expect.any(String));
  }
});

test('search_notes looks through all notes when no dates are given', async () => {
  const res = JSON.parse((await runTool('search_notes', { query: 'LOUD' }, env)).content) as { rows: { ref: string; text: string }[]; total: number };
  expect(res.total).toBeGreaterThan(0);
  for (const r of res.rows) expect(r.text.toLowerCase()).toContain('loud');
});

test('compare_periods counts the same hard moments as get_episodes', async () => {
  const a = JSON.parse((await runTool('get_episodes', { start_date: '2026-09-01', end_date: '2026-09-14' }, env)).content) as { total: number };
  const b = JSON.parse((await runTool('get_episodes', { start_date: '2026-09-15', end_date: '2026-09-28' }, env)).content) as { total: number };
  const cmp = JSON.parse((await runTool('compare_periods', INPUTS.compare_periods, env)).content) as { a: { value: number }; b: { value: number }; change_b_minus_a: number };
  expect([cmp.a.value, cmp.b.value, cmp.change_b_minus_a]).toEqual([a.total, b.total, b.total - a.total]);
});
