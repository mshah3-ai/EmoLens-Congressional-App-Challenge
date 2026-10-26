/**
 * Phase 8 screens: the AI consent screen (nothing is on until "I understand"), Ask EmoLens (off → explains how to turn
 * it on; on → a question gets an answer with "Based on N entries"), and the review screen of voice notes / documents
 * (SPEC 30.2: "review screen saves only checked items"). The cloud is the in-memory FakeCloud.
 */
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { buildDemo } from '../src/demo/build';
import { getAllSettings, setSettings } from '../src/db/repo/settings';
import { all, one } from '../src/db/types';
import { setCloudApiForTests } from '../src/cloud/current';
import { useSession } from '../src/store/session';
import { useReview } from '../src/store/review';
import { addSourcedNote } from '../src/db/repo/logs';
import type { Proposal } from '../src/voice/review';
import AiFeatures from '../app/settings/ai';
import Ask from '../app/ask/index';
import Review from '../app/log/review';
import { FakeCloud } from './fakeCloud';
import { testRepo } from './nodeDb';

jest.setTimeout(120_000);

const NOW = Date.parse('2026-09-30T16:00:00.000Z');
jest.mock('../src/forecast', () => ({ ...jest.requireActual('../src/forecast'), requestForecast: jest.fn() }));
jest.mock('../src/cloud/client', () => ({ ...jest.requireActual('../src/cloud/client'), currentUserId: jest.fn(async () => null) }));

afterEach(() => setCloudApiForTests(null));

async function phone() {
  const repo = await testRepo();
  await buildDemo(repo, { lang: 'en', tz: 'America/Chicago', now: NOW, days: 14, yieldToUi: false });
  await setSettings(repo.db, { simulated_sources: false, demo_info: null });
  await useSession.getState().useRepoForTests(repo);
  return repo;
}

test('AI features: signed out → asks for an account; signed in → off until "I understand", then on and off again', async () => {
  const repo = await phone();
  await renderRouter({ 'settings/ai': AiFeatures }, { initialUrl: '/settings/ai' });
  expect(await screen.findByText("Never sent:")).toBeTruthy();
  expect(screen.getByText('• Location coordinates')).toBeTruthy();
  expect(await screen.findByTestId('ai-go-account')).toBeTruthy();
  expect(screen.queryByTestId('ai-accept')).toBeNull();

  const cloud = new FakeCloud();
  setCloudApiForTests(cloud.as('u1')); // a signed-in person
  await act(async () => { await useSession.getState().updateSettings({ language: 'en' }); }); // re-check the sign-in
  await fireEvent.press(await screen.findByTestId('ai-accept'));
  await waitFor(async () => expect((await getAllSettings(repo.db)).cloud_ai_enabled).toBe(true));
  expect(await screen.findByTestId('ai-share-titles')).toBeTruthy();
  expect((await getAllSettings(repo.db)).ai_share_event_titles).toBe(false); // titles stay private by default
  await fireEvent.press(screen.getByTestId('ai-turn-off'));
  await waitFor(async () => expect((await getAllSettings(repo.db)).cloud_ai_enabled).toBe(false));
});

test('Ask EmoLens: off → "Turn on AI features"; on → the answer, with "Based on N entries"', async () => {
  const repo = await phone();
  await renderRouter({ 'ask/index': Ask, 'settings/ai': AiFeatures }, { initialUrl: '/ask' });
  expect(await screen.findByTestId('ask-turn-on')).toBeTruthy();

  const cloud = new FakeCloud();
  setCloudApiForTests(cloud.as('u1'));
  const ep = await one<{ id: string }>(repo.db, 'SELECT id FROM episodes ORDER BY started_at DESC LIMIT 1');
  cloud.aiHandler = (_fn, body) => {
    const msgs = body.messages as { content: { type: string }[] }[];
    if (!msgs[msgs.length - 1].content.some((b) => b.type === 'tool_result')) {
      return { data: { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'get_episodes', input: { start_date: '2026-09-01', end_date: '2026-09-30' } }] } };
    }
    return { data: { stop_reason: 'end_turn', content: [{ type: 'text', text: '[CHILD] had some hard moments this month.' }] } };
  };
  await act(async () => { await useSession.getState().updateSettings({ cloud_ai_enabled: true }); });
  await fireEvent.press(await screen.findByTestId('ask-chip-q3'));
  const nickname = useSession.getState().profile!.nickname;
  expect(await screen.findByText(`${nickname} had some hard moments this month.`)).toBeTruthy();
  const count = (await all(repo.db, "SELECT id FROM episodes WHERE deleted_at IS NULL AND started_at >= '2026-09-01T05:00:00.000Z'")).length;
  expect(await screen.findByText(count === 1 ? 'Based on 1 entry' : `Based on ${count} entries`)).toBeTruthy();
  expect(ep).toBeTruthy();
  expect(screen.getByText(/^AI answers can be wrong\. They're based on your logs, not medical advice\./)).toBeTruthy();
});

test('review screen: only the ticked cards are saved, and the note is marked accepted', async () => {
  const repo = await phone();
  const profile = useSession.getState().profile!;
  const before = async () => ({
    episodes: (await all(repo.db, "SELECT id FROM episodes WHERE source = 'voice'")).length,
    meals: (await all(repo.db, 'SELECT id FROM meals')).length,
  });
  const start = await before();
  const noteId = await addSourcedNote(repo, profile.id, { text: 'Big meltdown at 3. Ate pizza.', notedAt: '2026-09-30T15:00:00.000Z', source: 'voice', audioPath: null, structuredStatus: 'pending' });
  const proposals: Proposal[] = [
    { key: 'p0', checked: true, kind: 'episode', at: '2026-09-30T15:00:00.000Z', type: 'meltdown', intensity: 4, durationMin: 20, placeId: null, placeType: null, placeLabel: null, note: null },
    { key: 'p1', checked: true, kind: 'meal', at: '2026-09-30T15:30:00.000Z', mealType: 'snack', items: ['pizza'] },
    { key: 'p2', checked: false, kind: 'dose', at: '2026-09-30T15:30:00.000Z', medicationId: null, name: 'Mystery syrup', status: 'taken' },
  ];
  useReview.getState().set({ noteId, source: 'voice', via: 'rules', aiError: null, proposals });
  await renderRouter({ 'log/review': Review }, { initialUrl: '/log/review' });
  expect(await screen.findByText("\"Mystery syrup\" isn't in your medication list, so it can't be saved here.")).toBeTruthy();
  // untick the meal: only the hard moment should be saved
  await fireEvent.press(screen.getByTestId('review-check-p1'));
  await fireEvent.press(screen.getByTestId('review-save'));
  await waitFor(async () => expect((await one<{ structured_status: string }>(repo.db, 'SELECT structured_status FROM notes WHERE id = ?', [noteId]))?.structured_status).toBe('accepted'));
  const after = await before();
  expect(after).toEqual({ episodes: start.episodes + 1, meals: start.meals });
  expect(await one(repo.db, "SELECT type, intensity, duration_min FROM episodes WHERE source = 'voice' ORDER BY created_at DESC LIMIT 1"))
    .toEqual({ type: 'meltdown', intensity: 4, duration_min: 20 });
});

test('review screen: saving with nothing ticked keeps the note and marks it rejected', async () => {
  const repo = await phone();
  const profile = useSession.getState().profile!;
  const noteId = await addSourcedNote(repo, profile.id, { text: 'Nice day.', notedAt: '2026-09-30T15:00:00.000Z', source: 'document', audioPath: null, structuredStatus: 'pending' });
  useReview.getState().set({ noteId, source: 'document', via: 'ai', aiError: null, proposals: [
    { key: 'p0', checked: true, kind: 'routine', date: '2026-09-30', description: 'Substitute teacher' },
  ] });
  await renderRouter({ 'log/review': Review }, { initialUrl: '/log/review' });
  expect(await screen.findByText('Suggested by AI from your text. Please check each entry.')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('review-check-p0'));
  await fireEvent.press(screen.getByTestId('review-save'));
  await waitFor(async () => expect(await one(repo.db, 'SELECT structured_status, source, text FROM notes WHERE id = ?', [noteId]))
    .toEqual({ structured_status: 'rejected', source: 'document', text: 'Nice day.' }));
  expect(await all(repo.db, "SELECT id FROM routine_changes WHERE description = 'Substitute teacher'")).toHaveLength(0);
});
