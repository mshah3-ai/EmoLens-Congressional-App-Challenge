/** BUGS.md #10: the Weather card said "Set Home's location" even after Home's location was set. */
import { renderRouter } from 'expo-router/testing-library';
import DataSources from '../app/settings/data-sources';
import { addPlace, listPlaces, setPlaceLocation } from '../src/db/repo/logs';
import { completeOnboarding } from '../src/db/repo/onboarding';
import { patchIntegrationState } from '../src/integrations/state';
import { freshDraft } from '../src/store/onboarding';
import { useSession } from '../src/store/session';
import { testRepo } from './nodeDb';

async function setup(withHome: boolean) {
  const repo = await testRepo();
  await completeOnboarding(repo, { ...freshDraft(), child: { ...freshDraft().child, nickname: 'Sam', homeTz: 'America/Chicago' } });
  const profile = (await repo.db.execute('SELECT id FROM children')).rows[0] as { id: string };
  if (withHome) {
    await addPlace(repo, profile.id, { label: 'Home', type: 'home' });
    const home = (await listPlaces(repo.db, profile.id)).find((p) => p.type === 'home')!;
    await setPlaceLocation(repo, home, 37.323, -122.0322); // also sets the rounded weather location
  }
  await patchIntegrationState(repo.db, 'weather', { enabled: true });
  await useSession.getState().useRepoForTests(repo);
}

test('once Home has a location, the Weather card offers to change it', async () => {
  await setup(true);
  expect(useSession.getState().settings.weather_lat).not.toBeNull();
  const screen = await renderRouter({ index: DataSources }, { initialUrl: '/' });
  expect(await screen.findByText("Change Home's location")).toBeTruthy();
  expect(screen.queryByText("Set Home's location")).toBeNull();
});

test('before Home has a location, it asks to set it', async () => {
  await setup(false);
  const screen = await renderRouter({ index: DataSources }, { initialUrl: '/' });
  expect(await screen.findByText("Set Home's location")).toBeTruthy();
  expect(screen.queryByText("Change Home's location")).toBeNull();
});
