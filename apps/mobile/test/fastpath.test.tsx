/**
 * SPEC 10.1 / 30.2 (MUST): a hard moment can be logged in at most two presses from Today:
 *   press 1: the "Log hard moment" button   press 2: "Save now, add details later".
 * Renders the real Today screen and episode sheet with expo-router's test renderer and a real SQLite database.
 */
import { fireEvent, renderRouter, waitFor } from 'expo-router/testing-library';
import * as Notifications from 'expo-notifications';
import { completeOnboarding } from '../src/db/repo/onboarding';
import { freshDraft } from '../src/store/onboarding';
import { useSession } from '../src/store/session';
import Today from '../app/(tabs)/index';
import EpisodeSheet from '../app/log/episode';
import { testRepo } from './nodeDb';

jest.setTimeout(20000);

test('fast path: FAB + one tap saves a hard moment with details to add later', async () => {
  const repo = await testRepo();
  await completeOnboarding(repo, { ...freshDraft(), child: { ...freshDraft().child, nickname: 'Sam', homeTz: 'America/Chicago' }, modeledTypes: ['shutdown', 'meltdown'] });
  await useSession.getState().useRepoForTests(repo);

  // RNTL 14: render and fireEvent are async.
  const screen = await renderRouter({ index: Today, 'log/episode': EpisodeSheet }, { initialUrl: '/' });

  await fireEvent.press(await screen.findByTestId('fab-log-episode'));  // press 1
  const save = await screen.findByTestId('episode-fast-save');
  // The sheet opens with the type preselected (first tracked type before any logs) and time = now.
  await waitFor(() => expect(screen.getByTestId('episode-type-shutdown').props.accessibilityState).toMatchObject({ selected: true }));
  const before = Date.now();
  await fireEvent.press(save);                                             // press 2

  await waitFor(async () => {
    const rows = (await repo.db.execute('SELECT * FROM episodes')).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'shutdown', details_complete: 0, source: 'manual' });
    expect(Math.abs(Date.parse(String(rows[0].started_at)) - before)).toBeLessThan(60_000);
  });
  // A reminder to add details is scheduled 45 minutes later (SPEC 10.1).
  await waitFor(() => expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
    expect.objectContaining({ trigger: expect.objectContaining({ seconds: 45 * 60 }) })));
});
