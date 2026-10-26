/**
 * Fixes from the student's Phase 8 hand test (BUGS #26-#31):
 *  #26 a strategy in a voice note ("headphones helped") is its own review card, saved with its hard moment;
 *  #27 the weekly digest says so when the AI summary can't be written, and keeps the usual summary;
 *  #28 the daily-limit message gives the real reset time (the next 00:00 UTC) in the family's time zone;
 *  #29 AI answers show formatting, not Markdown asterisks; "Copy" copies plain text;
 *  #30 the daily limit is a calm notice without "Try again";
 *  #31 when the phone has no internet, Ask says it needs an internet connection.
 */
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import i18next from 'i18next';
import * as Network from 'expo-network';
import { buildDemo } from '../src/demo/build';
import { setSettings } from '../src/db/repo/settings';
import { listStrategies } from '../src/db/repo/strategies';
import { listMedications } from '../src/db/repo/meds';
import { listDigests } from '../src/digest/generate';
import { all, one } from '../src/db/types';
import { setCloudApiForTests } from '../src/cloud/current';
import { useSession } from '../src/store/session';
import { useReview } from '../src/store/review';
import { addSourcedNote } from '../src/db/repo/logs';
import { aiCall } from '../src/ai/client';
import { aiLimitResetsAt, askErrorNotice } from '../src/ai/messages';
import { parseMarkdown, plainText } from '../src/lib/markdown';
import { KEYWORDS_EN } from '../src/voice/keywords.en';
import { parseVoiceNote } from '../src/voice/ruleParser';
import { buildProposals, canSave, saveProposals, type Proposal } from '../src/voice/review';
import Ask from '../app/ask/index';
import Digest from '../app/digest/[weekStart]';
import Review from '../app/log/review';
import { FakeCloud } from './fakeCloud';
import { testRepo } from './nodeDb';

jest.setTimeout(120_000);

const NOW = Date.parse('2026-09-30T16:00:00.000Z');
const TZ = 'America/Chicago';
jest.mock('../src/forecast', () => ({ ...jest.requireActual('../src/forecast'), requestForecast: jest.fn() }));
jest.mock('../src/cloud/client', () => ({ ...jest.requireActual('../src/cloud/client'), currentUserId: jest.fn(async () => null) }));

afterEach(() => {
  setCloudApiForTests(null);
  (Network.getNetworkStateAsync as jest.Mock).mockResolvedValue({ isConnected: true, isInternetReachable: true });
});

async function phone(aiOn = false) {
  const repo = await testRepo();
  await buildDemo(repo, { lang: 'en', tz: TZ, now: NOW, days: 14, yieldToUi: false });
  await setSettings(repo.db, { simulated_sources: false, demo_info: null, cloud_ai_enabled: aiOn });
  await useSession.getState().useRepoForTests(repo);
  return repo;
}

async function voiceProposals(repo: Awaited<ReturnType<typeof phone>>, text: string): Promise<Proposal[]> {
  const profile = useSession.getState().profile!;
  const strategies = await listStrategies(repo.db, profile.id);
  const log = parseVoiceNote(text, { now: NOW, tz: TZ, keywords: KEYWORDS_EN, medicationNames: [], strategyNames: strategies.map((s) => s.name), placeLabels: [], recentFoods: [] });
  return buildProposals(log, { profile, now: NOW, keywords: KEYWORDS_EN, medications: await listMedications(repo.db, profile.id), strategies, places: [] });
}

describe('#26 strategy cards', () => {
  test('"meltdown at 4 PM, headphones helped" → a hard-moment card and a strategy card; both saved together', async () => {
    const repo = await phone();
    const proposals = await voiceProposals(repo, 'Meltdown at 4 PM, headphones helped.');
    expect(proposals.map((p) => p.kind)).toEqual(['episode', 'strategy']);
    expect(proposals[1]).toMatchObject({ kind: 'strategy', episodeKey: proposals[0].key, name: 'Noise-reducing headphones', outcome: 'helped', checked: true });

    const profile = useSession.getState().profile!;
    const noteId = await addSourcedNote(repo, profile.id, { text: 'Meltdown at 4 PM, headphones helped.', notedAt: '2026-09-30T16:00:00.000Z', source: 'voice', audioPath: null, structuredStatus: 'pending' });
    useReview.getState().set({ noteId, source: 'voice', via: 'rules', aiError: null, proposals });
    await renderRouter({ 'log/review': Review }, { initialUrl: '/log/review' });
    expect(await screen.findByText('Strategy tried')).toBeTruthy();
    expect(screen.getByText('Noise-reducing headphones')).toBeTruthy();
    expect(screen.getByText('Saved with the hard moment above.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('review-save'));
    await waitFor(async () => expect((await one<{ structured_status: string }>(repo.db, 'SELECT structured_status FROM notes WHERE id = ?', [noteId]))?.structured_status).toBe('accepted'));
    const episode = await one<{ id: string }>(repo.db, "SELECT id FROM episodes WHERE source = 'voice' ORDER BY created_at DESC LIMIT 1");
    const uses = await all<{ name: string; context: string; outcome: string }>(repo.db,
      'SELECT s.name, u.context, u.outcome FROM strategy_uses u JOIN strategies s ON s.id = u.strategy_id WHERE u.episode_id = ?', [episode!.id]);
    expect(uses).toEqual([{ name: 'Noise-reducing headphones', context: 'during', outcome: 'helped' }]);
  });

  test('the strategy card can only be saved with its hard moment; an unknown strategy can\'t be saved', async () => {
    const repo = await phone();
    const profile = useSession.getState().profile!;
    const [episode, strategy] = await voiceProposals(repo, 'Meltdown at 4 PM, headphones helped.');
    const unticked = [{ ...episode, checked: false }, strategy];
    expect(canSave(strategy, unticked)).toBe(false);
    const before = (await all(repo.db, 'SELECT id FROM strategy_uses')).length;
    expect(await saveProposals(repo, profile, unticked, null, 'voice')).toBe(0);
    expect((await all(repo.db, 'SELECT id FROM strategy_uses')).length).toBe(before);

    const unknown = buildProposals({ episodes: [{ started_at_local: '2026-09-30T10:00', type: 'meltdown', intensity: null, duration_min: null, place_label: null,
      antecedent_note: null, strategies: [{ name: 'Lava lamp', helped: true }] }], med_doses: [], meals: [], sleep: null, illness: [], routine_change: null, notes: null },
    { profile, now: NOW, keywords: KEYWORDS_EN, medications: [], strategies: await listStrategies(repo.db, profile.id), places: [] });
    expect(unknown[1]).toMatchObject({ kind: 'strategy', strategyId: null, name: 'Lava lamp', checked: false });
    expect(canSave(unknown[1], unknown)).toBe(false);
  });
});

test('#27 digest: when the AI summary can\'t be written, a gentle note shows and the usual summary stays', async () => {
  const repo = await phone(true);
  const cloud = new FakeCloud(); // no AI handler: every AI call answers 502 ai_unavailable
  setCloudApiForTests(cloud.as('u1'));
  const profile = useSession.getState().profile!;
  const latest = (await listDigests(repo.db, profile.id))[0];
  await repo.db.execute('UPDATE digests SET narrative = NULL WHERE week_start = ?', [latest.weekStart]);
  await renderRouter({ 'digest/[weekStart]': Digest }, { initialUrl: `/digest/${latest.weekStart}` });
  expect(await screen.findByTestId('digest-ai-failed')).toBeTruthy();
  expect(screen.getByText(/^Couldn't write an AI summary right now, so this is the usual summary\./)).toBeTruthy();
  expect(screen.getByText(new RegExp(`^${profile.nickname.replace(/[()]/g, '\\$&')} had (no|\\d+) hard moments?`))).toBeTruthy();
  expect(cloud.aiRequests.map((r) => r.fn)).toEqual(['ai-digest']);
});

describe('#28 #30 #31 what Ask shows when it can\'t answer', () => {
  const t = i18next.t.bind(i18next);
  test('the limit resets at the next 00:00 UTC, shown in the family\'s time zone; calm, without "Try again"', () => {
    const at = Date.parse('2026-10-14T18:06:00.000Z');
    expect(new Date(aiLimitResetsAt(at)).toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(askErrorNotice(t, 'daily_limit', 'America/Chicago', at)).toEqual({
      text: "You've reached today's limit for AI requests. It resets at 7:00 PM.", tone: 'calm', retry: false });
    expect(askErrorNotice(t, 'daily_limit', 'Europe/Madrid', at).text).toBe("You've reached today's limit for AI requests. It resets tomorrow at 2:00 AM.");
    // after 7 PM in Chicago the next reset is tomorrow's 7 PM
    expect(askErrorNotice(t, 'daily_limit', 'America/Chicago', Date.parse('2026-10-15T01:30:00.000Z')).text)
      .toBe("You've reached today's limit for AI requests. It resets tomorrow at 7:00 PM.");
  });
  test('no internet → "Ask EmoLens needs an internet connection", calm, with "Try again"; other errors stay errors', () => {
    expect(askErrorNotice(t, 'offline', TZ, NOW)).toEqual({ text: 'Ask EmoLens needs an internet connection. Connect and try again.', tone: 'calm', retry: true });
    expect(askErrorNotice(t, 'ai_unavailable', TZ, NOW)).toEqual({ text: "The AI isn't available right now. Please try again later.", tone: 'error', retry: true });
  });
  test('a server error while the phone has no internet is reported as offline; with internet it stays ai_unavailable', async () => {
    const cloud = new FakeCloud();
    const gate = { enabled: true, signedIn: true };
    expect(await aiCall('ai-digest', { stats: {} }, 'Sam', gate, cloud.as('u1'), async () => false)).toEqual({ ok: false, error: 'ai_unavailable' });
    expect(await aiCall('ai-digest', { stats: {} }, 'Sam', gate, cloud.as('u1'), async () => true)).toEqual({ ok: false, error: 'offline' });
    cloud.aiHandler = () => ({ error: 'daily_limit', status: 429 });
    expect(await aiCall('ai-digest', { stats: {} }, 'Sam', gate, cloud.as('u1'), async () => true)).toEqual({ ok: false, error: 'daily_limit' });
  });
  test('Ask screen: the daily limit is a calm notice without "Try again"; no internet says so and offers "Try again"', async () => {
    await phone(true);
    const cloud = new FakeCloud();
    setCloudApiForTests(cloud.as('u1'));
    cloud.aiHandler = () => ({ error: 'daily_limit', status: 429 });
    await renderRouter({ 'ask/index': Ask }, { initialUrl: '/ask' });
    await fireEvent.press(await screen.findByTestId('ask-chip-q1'));
    expect((await screen.findByTestId('ask-notice')).props.children).toMatch(/^You've reached today's limit for AI requests\. It resets (tomorrow )?at /);
    expect(screen.queryByTestId('ask-retry')).toBeNull();

    cloud.aiHandler = null; // the local server answers 502, and the phone has no internet
    (Network.getNetworkStateAsync as jest.Mock).mockResolvedValue({ isConnected: false, isInternetReachable: false });
    await fireEvent.changeText(screen.getByTestId('ask-input'), 'How was the week?');
    await fireEvent.press(screen.getByTestId('ask-send'));
    await waitFor(() => expect(screen.getByTestId('ask-notice').props.children).toBe('Ask EmoLens needs an internet connection. Connect and try again.'));
    expect(screen.getByTestId('ask-retry')).toBeTruthy();
  });
});

describe('#29 Markdown in AI answers', () => {
  const answer = '### Last week\nLast week had **3 hard moments**:\n\n- **Thu Oct 8, 4:43 PM:** a meltdown at home\n1. *First* step\n| Day | Count |\n|---|---|\n| Mon | 2 |\n---\nUse `get_episodes` or [the timeline](https://x).';
  test('parsed into headings, bold spans and lists; plain text for copying has no Markdown symbols', () => {
    const blocks = parseMarkdown(answer);
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'para', 'bullet', 'bullet', 'para', 'para', 'para']);
    expect(blocks[1].spans).toEqual([{ text: 'Last week had ', bold: false }, { text: '3 hard moments', bold: true }, { text: ':', bold: false }]);
    expect(blocks[3]).toMatchObject({ marker: '1.', spans: [{ text: 'First step', bold: false }] });
    expect(plainText(answer)).toBe('Last week\nLast week had 3 hard moments:\n• Thu Oct 8, 4:43 PM: a meltdown at home\n1. First step\nDay · Count\nMon · 2\nUse get_episodes or the timeline.');
    expect(plainText(answer)).not.toMatch(/[*#`|]/);
  });
  test('Ask shows the answer formatted, without asterisks', async () => {
    await phone(true);
    const cloud = new FakeCloud();
    setCloudApiForTests(cloud.as('u1'));
    cloud.aiHandler = () => ({ data: { stop_reason: 'end_turn', content: [{ type: 'text', text: '[CHILD] had **7 hard moments**:\n- 4 meltdowns\n- 3 shutdowns' }] } });
    await renderRouter({ 'ask/index': Ask }, { initialUrl: '/ask' });
    await act(async () => { await fireEvent.press(await screen.findByTestId('ask-chip-q1')); });
    expect(await screen.findByText('7 hard moments')).toBeTruthy();
    expect(screen.getByText('4 meltdowns')).toBeTruthy();
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });
});
