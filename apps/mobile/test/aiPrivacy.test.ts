/**
 * @jest-environment node
 *
 * SPEC 30.2 "Redaction: nickname replaced in every outgoing AI payload (property-based test with random nicknames and
 * casings)" — Phase 8 acceptance. The demo child is renamed to random nicknames; the nickname is also written, in
 * random casings, into a note, a hard moment's note, a place label and a voice-note text. Then every kind of AI request
 * the app makes (Ask EmoLens with tool results from several tools, voice-note structuring, the weekly digest) is sent
 * to a stand-in cloud that records exactly what arrived. The nickname must appear in none of it.
 */
import { SUSPECTED_TRIGGERS } from '@emolens/shared';
import { DEMO_SUSPECTED } from '@emolens/simulator';
import { addDays, localDateOf, mulberry32 } from '@emolens/engine';
import { buildDemo } from '../src/demo/build';
import { getChild, toChildProfile } from '../src/db/repo/children';
import { getAllSettings } from '../src/db/repo/settings';
import { one } from '../src/db/types';
import { askEmoLens } from '../src/ai/ask';
import type { ToolEnv } from '../src/ai/tools';
import { writeAiNarrative } from '../src/digest/aiNarrative';
import { structureText } from '../src/voice/structure';
import { FakeCloud } from './fakeCloud';
import { testRepo } from './nodeDb';

jest.setTimeout(240_000);

const TZ = 'America/Chicago';
const NOW = Date.parse('2026-09-29T15:10:00.000Z');
const GATE = { enabled: true, signedIn: true };
let base: ToolEnv;

beforeAll(async () => {
  const repo = await testRepo();
  await buildDemo(repo, { lang: 'en', tz: TZ, now: NOW, days: 30, yieldToUi: false });
  const profile = toChildProfile((await getChild(repo.db))!, SUSPECTED_TRIGGERS.filter((t) => DEMO_SUSPECTED.includes(t.id)).map((t) => t.id));
  base = { repo, profile, settings: { ...(await getAllSettings(repo.db)), ai_share_event_titles: true }, now: NOW, lang: 'en' };
});

const LETTERS = 'abcdefghijklmnopqrstuvwxyzáéíñóúü';
function randomNickname(r: () => number): string {
  const word = () => [...Array(2 + Math.floor(r() * 6))].map(() => LETTERS[Math.floor(r() * LETTERS.length)]).join('');
  const w = word();
  const name = w[0].toUpperCase() + w.slice(1);
  return r() < 0.15 ? `${name} ${word()}` : name;
}
const randomCase = (r: () => number, s: string) => [...s].map((c) => (r() < 0.5 ? c.toUpperCase() : c.toLowerCase())).join('');

/** Independent check (not the redaction code itself): the nickname as a whole word, any casing. */
function leaks(text: string, nickname: string): boolean {
  const t = text.normalize('NFC').toLocaleLowerCase(), n = nickname.normalize('NFC').toLocaleLowerCase();
  const wordChar = (c: string | undefined) => !!c && /[\p{L}\p{M}\p{N}_]/u.test(c);
  for (let i = t.indexOf(n); i !== -1; i = t.indexOf(n, i + 1)) if (!wordChar(t[i - 1]) && !wordChar(t[i + n.length])) return true;
  return false;
}

/** A model stand-in that calls several tools in one round, then answers. */
function toolHungryModel(fake: FakeCloud, day: string) {
  fake.aiHandler = (fn, body) => {
    if (fn === 'ai-structure') return { data: { log: { episodes: [], med_doses: [], meals: [], sleep: null, illness: [], routine_change: null, notes: null } } };
    if (fn === 'ai-digest') return { data: { narrative: '[CHILD] had a calmer week.' } };
    const messages = body.messages as { role: string; content: { type: string }[] }[];
    const last = messages[messages.length - 1];
    if (!last.content.some((b) => b.type === 'tool_result')) {
      return { data: { stop_reason: 'tool_use', content: [
        { type: 'tool_use', id: 'a', name: 'search_notes', input: { query: 'upset' } },
        { type: 'tool_use', id: 'b', name: 'get_day_summary', input: { date: day } },
        { type: 'tool_use', id: 'c', name: 'get_episodes', input: { start_date: addDays(day, -7), end_date: day } },
        { type: 'tool_use', id: 'd', name: 'get_patterns', input: {} },
        { type: 'tool_use', id: 'e', name: 'get_strategy_stats', input: {} },
      ] } };
    }
    return { data: { stop_reason: 'end_turn', content: [{ type: 'text', text: '[CHILD] had 3 hard moments.' }] } };
  };
}

test('property: no nickname in any AI request (Ask + tool results, structuring, digest), 20 random nicknames', async () => {
  const r = mulberry32(8);
  const { db } = base.repo;
  const episode = await one<{ id: string; started_at: string }>(db, 'SELECT id, started_at FROM episodes WHERE deleted_at IS NULL ORDER BY started_at DESC LIMIT 1');
  const day = localDateOf(Date.parse(episode!.started_at), TZ);
  // a place the demo episode happened at (the demo family may have none yet)
  await db.execute("INSERT INTO places (id, child_id, label, type, latitude, longitude, created_at, updated_at) VALUES ('pl1', ?, 'Room', 'home', 41.1, -87.6, ?, ?)",
    [base.profile.id, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z']);
  const place = { id: 'pl1' };
  expect(episode).toBeTruthy();
  await db.execute('UPDATE episodes SET place_id = ? WHERE id = ?', [place.id, episode!.id]);
  for (let i = 0; i < 20; i++) {
    const nick = randomNickname(r);
    // the nickname everywhere the parent might type it
    await db.execute('UPDATE children SET nickname = ?', [nick]);
    await db.execute('UPDATE episodes SET notes = ? WHERE id = ?', [`${randomCase(r, nick)} got upset when the bell rang`, episode!.id]);
    await db.execute('UPDATE places SET label = ? WHERE id = ?', [`${randomCase(r, nick)}'s room`, place.id]);
    await db.execute("INSERT INTO notes (id, created_at, updated_at, created_by, device_id, child_id, noted_at, text, source, structured_status) VALUES (?, ?, ?, 'local', 'd', ?, ?, ?, 'manual', 'none')",
      [`n${i}`, episode!.started_at, episode!.started_at, base.profile.id, episode!.started_at, `Was ${randomCase(r, nick)} upset? Yes, ${randomCase(r, nick)} was.`]);
    const env: ToolEnv = { ...base, profile: { ...base.profile, nickname: nick } };

    const fake = new FakeCloud();
    toolHungryModel(fake, day);
    const api = fake.as('u1');
    const ask = await askEmoLens(env, { conversationId: `c${i}`, question: `How is ${randomCase(r, nick)} doing? Did ${randomCase(r, nick)}'s week go well?`, gate: GATE, api });
    expect(ask.ok).toBe(true);
    if (ask.ok) expect(ask.answer).toBe(`${nick} had 3 hard moments.`); // the nickname is put back for display
    await structureText(`${randomCase(r, nick)} had a big meltdown after school. ${randomCase(r, nick)} took melatonin.`, 'voice_note', env, GATE, api);
    await db.execute('INSERT OR IGNORE INTO digests (id, child_id, week_start, stats_json, narrative, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
      [`d${i}`, base.profile.id, `2026-0${1 + (i % 9)}-0${1 + (i % 7)}`, JSON.stringify({ name: nick, episodes: { total: 3 }, notes: [`${randomCase(r, nick)} slept well`] }), '2026-09-28T00:00:00.000Z']);
    await writeAiNarrative(base.repo, env.profile, `2026-0${1 + (i % 9)}-0${1 + (i % 7)}`, 'en', GATE, api);

    const fns = fake.aiRequests.map((x) => x.fn);
    expect(fns).toEqual(expect.arrayContaining(['ai-ask', 'ai-structure', 'ai-digest']));
    // the tool results really carried the planted text (so the check below means something)
    const toolText = JSON.stringify(fake.aiRequests[1].body);
    expect(toolText).toContain('[CHILD] got upset');
    expect(toolText).toContain("[CHILD]'s room");
    for (const req of fake.aiRequests) expect({ nick, fn: req.fn, leaked: leaks(JSON.stringify(req.body), nick) }).toEqual({ nick, fn: req.fn, leaked: false });
    await db.execute('DELETE FROM notes WHERE id = ?', [`n${i}`]);
  }
});

test('structuring: with AI off nothing is sent, and the rule parser is used', async () => {
  const fake = new FakeCloud();
  const s = await structureText('Big meltdown at 3.', 'voice_note', base, { enabled: false, signedIn: true }, fake.as('u1'));
  expect(s.via).toBe('rules');
  expect(s.log.episodes).toHaveLength(1);
  expect(fake.aiRequests).toHaveLength(0);
});

test('structuring: an AI answer that fails the check falls back to the rule parser', async () => {
  const fake = new FakeCloud();
  fake.aiHandler = () => ({ data: { log: { episodes: [{ type: 'tantrum' }] } } });
  const s = await structureText('She shut down at 4.', 'voice_note', base, GATE, fake.as('u1'));
  expect(s).toMatchObject({ via: 'rules', aiError: 'failed' });
  expect(s.log.episodes[0].type).toBe('shutdown');
});

test('digest: the AI summary is saved with [CHILD]; when the AI is unavailable nothing changes', async () => {
  const { db } = base.repo;
  await db.execute("INSERT INTO digests (id, child_id, week_start, stats_json, narrative, created_at) VALUES ('dz', ?, '2030-01-07', '{}', NULL, '2030-01-14T00:00:00Z')", [base.profile.id]);
  const down = new FakeCloud();
  expect(await writeAiNarrative(base.repo, base.profile, '2030-01-07', 'en', GATE, down.as('u1'))).toEqual({ ok: false, error: 'ai_unavailable' });
  expect((await one<{ narrative: string | null }>(db, "SELECT narrative FROM digests WHERE id = 'dz'"))?.narrative).toBeNull();
  const up = new FakeCloud();
  up.aiHandler = () => ({ data: { narrative: '  [CHILD] had a calmer week.  ' } });
  expect(await writeAiNarrative(base.repo, base.profile, '2030-01-07', 'en', GATE, up.as('u1'))).toEqual({ ok: true, narrative: '[CHILD] had a calmer week.' });
  expect((await one<{ narrative: string }>(db, "SELECT narrative FROM digests WHERE id = 'dz'"))?.narrative).toBe('[CHILD] had a calmer week.');
  expect(up.aiRequests[0].body).toEqual({ stats: {}, language: 'en' });
});
