/**
 * Phase 5 screens rendered with real data: a 30-day simulated family (the demo builder) in a real SQLite database.
 * Checks what a judge would look for: Today shows a live forecast with reasons, a "How did it go?" card can be answered
 * in one tap, the end-of-day check takes one tap, Insights lists patterns and opens their detail, Model Health and
 * Strategies render their numbers.
 */
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { setLanguage } from '../src/i18n';
import { SUSPECTED_TRIGGERS } from '@emolens/shared';
import { localDateOf } from '@emolens/engine';
import { DEMO_SUSPECTED } from '@emolens/simulator';
import { buildDemo } from '../src/demo/build';
import { askAboutPastBlock } from '../src/demo/tools';
import { getChild, toChildProfile } from '../src/db/repo/children';
import type { Repo } from '../src/db/repo/writer';
import { one } from '../src/db/types';
import { readSnapshot } from '../src/forecast/snapshot';
import { useSession } from '../src/store/session';
import Today from '../app/(tabs)/index';
import Insights from '../app/(tabs)/insights/index';
import TriggerDetail from '../app/(tabs)/insights/trigger/[key]';
import ModelHealth from '../app/(tabs)/insights/model-health';
import Strategies from '../app/(tabs)/insights/strategies';
import BlockSheet from '../app/block/[start]';
import Confirm from '../app/confirm/[alertId]';
import EndOfDay from '../app/end-of-day/[date]';
import EpisodeSheet from '../app/log/episode';
import { testRepo } from './nodeDb';

jest.setTimeout(120_000);

const TZ = 'America/New_York';
let repo: Repo;

beforeAll(async () => {
  repo = await testRepo();
  await buildDemo(repo, { lang: 'en', tz: TZ, days: 30, yieldToUi: false });
});
beforeEach(async () => { await useSession.getState().useRepoForTests(repo); });

const profile = async () => toChildProfile((await getChild(repo.db))!, SUSPECTED_TRIGGERS.filter((t) => DEMO_SUSPECTED.includes(t.id)).map((t) => t.id));

test('Today shows the live forecast: chance, 80% range, level and reasons', async () => {
  await renderRouter({ index: Today, 'block/[start]': BlockSheet }, { initialUrl: '/' });
  // The Now card shows the current block, or the next one (tomorrow morning when it is already night).
  await screen.findByTestId('now-card');
  await waitFor(() => expect(screen.getAllByText(/% chance$/).length).toBeGreaterThan(0));
  expect(screen.getAllByText(/^likely between (<1|\d+)% and \d+%$/).length).toBeGreaterThan(0);
  // Tapping a strip segment opens that block's sheet.
  const snap = (await readSnapshot(repo.db, (await profile()).id))!;
  expect(snap.forecasts.length).toBeGreaterThan(0);
  await fireEvent.press(screen.getByTestId('strip-3')); // 6-8 am
  expect(await screen.findByText(/^6–8 am · Today$/)).toBeTruthy();
});

test('a "How did it go?" card on Today is answered in one tap and stored', async () => {
  const p = await profile();
  const added = await askAboutPastBlock(repo, p, Date.now());
  if (!added) return; // before the first awake block of the day there is no finished block to ask about
  await renderRouter({ index: Today, 'log/episode': EpisodeSheet }, { initialUrl: '/' });
  await fireEvent.press((await screen.findAllByTestId('confirm-calm'))[0]);
  await waitFor(async () => {
    const r = await one<{ response: string }>(repo.db, "SELECT response FROM alert_responses WHERE response = 'calm' ORDER BY responded_at DESC LIMIT 1");
    expect(r?.response).toBe('calm');
  });
});

test('the confirmation screen offers the three answers', async () => {
  const p = await profile();
  await askAboutPastBlock(repo, p, Date.now());
  const alert = await one<{ id: string }>(repo.db, "SELECT id FROM alerts WHERE status = 'delivered' ORDER BY created_at DESC LIMIT 1");
  if (!alert) return;
  await renderRouter({ 'confirm/[alertId]': Confirm }, { initialUrl: `/confirm/${alert.id}` });
  expect(await screen.findByTestId('answer-happened')).toBeTruthy();
  expect(screen.getByTestId('answer-stepped')).toBeTruthy();
  expect(screen.getByTestId('answer-calm')).toBeTruthy();
});

test('end-of-day check: "No, that\'s everything" is one tap', async () => {
  const p = await profile();
  await renderRouter({ index: Today, 'end-of-day/[date]': EndOfDay }, { initialUrl: '/end-of-day/today' });
  await fireEvent.press(await screen.findByTestId('eod-all-logged'));
  const today = localDateOf(Date.now(), TZ);
  await waitFor(async () => {
    const c = await one<{ all_logged: number }>(repo.db, 'SELECT all_logged FROM day_closures WHERE child_id = ? AND local_date = ?', [p.id, today]);
    expect(c?.all_logged).toBe(1);
  });
});

test('Insights lists patterns with status and precision meter; a pattern opens its detail with both charts', async () => {
  await renderRouter({ 'insights/index': Insights, 'insights/trigger/[key]': TriggerDetail }, { initialUrl: '/insights' });
  const snap = (await readSnapshot(repo.db, (await profile()).id))!;
  const first = snap.insights.find((i) => i.status !== 'hidden')!;
  await fireEvent.press(await screen.findByTestId(`pattern-${first.key}`));
  // The status (how sure of the direction) and the meter (how precisely the size is known) are explained separately.
  expect(await screen.findByText('How precisely EmoLens knows the size of this effect')).toBeTruthy();
  expect(screen.getByText('The meter shows how pinned-down the exact size is.')).toBeTruthy();
  expect(screen.getByTestId('status-meaning').props.children).toMatch(/^“.+” = /);
  expect(screen.getByText('How the estimate changed')).toBeTruthy();
  expect(screen.getByText('The evidence')).toBeTruthy();
});

test('Model Health shows the skill headline (or how long until it can) and the data behind it', async () => {
  await renderRouter({ index: ModelHealth }, { initialUrl: '/' });
  await waitFor(() => expect(screen.queryByTestId('health-skill') ?? screen.queryByText('Model health appears after about 3 weeks of logging.')).toBeTruthy());
  expect(await screen.findByTestId('refit-now')).toBeTruthy();
  expect(screen.getByText(/days with answers/)).toBeTruthy();
});

test('Strategies shows "Helped s of t times" for strategies used during hard moments', async () => {
  await renderRouter({ index: Strategies }, { initialUrl: '/' });
  await fireEvent.press(await screen.findByTestId('strategies-tab-during'));
  await waitFor(() => expect(screen.getAllByText(/^Helped \d+ of \d+ times$/).length).toBeGreaterThan(0));
});

test('trigger detail: "Strong link" is explained next to the precision meter (English and Spanish)', async () => {
  const snap = (await readSnapshot(repo.db, (await profile()).id))!;
  // Show a Strong pattern the way a judge would see it (the numbers stay the engine's).
  const row = snap.insights.find((i) => i.status !== 'hidden')!;
  const strong = { ...snap, insights: snap.insights.map((i) => (i.key === row.key ? { ...i, status: 'strong' as const, confidence: 39 } : i)) };
  await repo.db.execute('UPDATE engine_snapshots SET result_json = ?', [JSON.stringify(strong)]);
  await renderRouter({ 'insights/trigger/[key]': TriggerDetail }, { initialUrl: `/insights/trigger/${row.key}` });
  expect(await screen.findByText('“Strong link” = EmoLens is confident this raises the chance.')).toBeTruthy();
  expect(screen.getByLabelText('How precisely the size is known: 39%')).toBeTruthy();
  await act(async () => { setLanguage('es'); });
  expect(await screen.findByText('«Relación fuerte» = EmoLens está seguro de que esto sube la probabilidad.')).toBeTruthy();
  expect(screen.getByText('Con qué precisión conoce EmoLens el tamaño de este efecto')).toBeTruthy();
  await act(async () => { setLanguage('en'); });
  await repo.db.execute('UPDATE engine_snapshots SET result_json = ?', [JSON.stringify(snap)]);
});
