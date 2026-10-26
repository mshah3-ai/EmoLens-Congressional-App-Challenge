/**
 * Place search as you type (DECISIONS #147): the request sends only the text and a rounded area, results read like a
 * maps app, tapping one sets the place's map location (and names a new place), and answers to older text are ignored.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { act, fireEvent as routerFire, renderRouter, screen as routerScreen, waitFor as routerWait } from 'expo-router/testing-library';
import { router } from 'expo-router';
import { completeOnboarding } from '../src/db/repo/onboarding';
import { freshDraft } from '../src/store/onboarding';
import { all } from '../src/db/types';
import { useSession } from '../src/store/session';
import { guessType, parsePhoton, searchPlaces, searchUrl, type PlaceSuggestion } from '../src/integrations/placeSearch';
import { PlaceSearch } from '../src/ui/PlaceSearch';
import PlaceEdit from '../app/settings/place';
import { testRepo } from './nodeDb';

jest.setTimeout(30_000);

const feature = (props: Record<string, unknown>, lon = -87.64, lat = 41.92) => ({ geometry: { coordinates: [lon, lat] as [number, number] }, properties: props });
const LINCOLN = feature({ osm_type: 'W', osm_id: 1, osm_key: 'amenity', osm_value: 'school', name: 'Lincoln Elementary School',
  housenumber: '615', street: 'West Kemper Place', city: 'Chicago', state: 'Illinois', country: 'United States' });
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

describe('the request and the answer', () => {
  test('sends only the text, and a rounded area (about 1 km) when there is one', () => {
    expect(searchUrl(' lincoln elem ', { latitude: 41.87654, longitude: -87.62345 }))
      .toBe('https://photon.komoot.io/api/?q=lincoln%20elem&limit=10&lang=en&lat=41.88&lon=-87.62');
    expect(searchUrl('casa', null, 'es')).toBe('https://photon.komoot.io/api/?q=casa&limit=10');
  });

  test('results read like a maps app: name on top, the rest of the address below; duplicates and pointless rows dropped', () => {
    const r = parsePhoton({ features: [
      LINCOLN, { ...LINCOLN, properties: { ...LINCOLN.properties, osm_id: 2 } },
      feature({ osm_id: 3, housenumber: '233', street: 'South Wacker Drive', city: 'Chicago', state: 'IL', country: 'United States' }),
      feature({ osm_id: 4, name: 'Parc Lafontaine', osm_key: 'leisure', osm_value: 'park', city: 'Montréal', state: 'Quebec', country: 'Canada' }),
      { properties: { name: 'No coordinates' } }, feature({ osm_id: 5 }),
    ] });
    expect(r.map((s) => [s.title, s.subtitle, s.type])).toEqual([
      ['Lincoln Elementary School', '615 West Kemper Place, Chicago, Illinois', 'school'],
      ['233 South Wacker Drive', 'Chicago, IL', null],
      ['Parc Lafontaine', 'Montréal, Quebec, Canada', 'park_outdoor'],
    ]);
    expect(r[0]).toMatchObject({ latitude: 41.92, longitude: -87.64 });
  });

  test('guesses the kind of place from the map tag', () => {
    expect(guessType('amenity', 'clinic')).toBe('medical');
    expect(guessType('shop', 'bakery')).toBe('store_public');
    expect(guessType('building', 'house')).toBeNull();
  });

  test('short text is never sent; one quick try, no retries', async () => {
    const fetchFn = jest.fn(async () => ok({ features: [LINCOLN] }));
    expect(await searchPlaces('li', null, 'en', { fetchFn })).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
    const failing = jest.fn(async () => ({ ok: false, status: 503 }) as Response);
    await expect(searchPlaces('lincoln', null, 'en', { fetchFn: failing })).rejects.toThrow();
    expect(failing).toHaveBeenCalledTimes(1);
  });
});

describe('the search box', () => {
  const suggestion = (title: string): PlaceSuggestion => ({ id: title, title, subtitle: 'Chicago, Illinois', latitude: 41.9, longitude: -87.6, type: 'school' });

  test('shows matches under the box; tapping one picks it and closes the list', async () => {
    const search = jest.fn(async (q: string) => [suggestion(`${q} School`), suggestion(`${q} Park`)]);
    const onSelect = jest.fn();
    await render(<PlaceSearch onSelect={onSelect} search={search} />);
    await fireEvent.changeText(screen.getByTestId('place-search-input'), 'Lincoln');
    await waitFor(() => expect(screen.getByTestId('place-search-result-1')).toBeTruthy());
    expect(screen.getByText('Lincoln Park')).toBeTruthy();
    expect(screen.getByText('Search by Photon · © OpenStreetMap contributors')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('place-search-result-0'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lincoln School' }));
    expect(screen.queryByTestId('place-search-result-0')).toBeNull();
    expect(search).toHaveBeenCalledTimes(1); // the picked text isn't searched again
  });

  test('waits for a pause in typing and ignores an answer to older text', async () => {
    let resolveOld: (r: PlaceSuggestion[]) => void = () => undefined;
    const search = jest.fn((q: string) => (q === 'Linc'
      ? new Promise<PlaceSuggestion[]>((r) => { resolveOld = r; })
      : Promise.resolve([suggestion('Lincoln Elementary')])));
    await render(<PlaceSearch onSelect={jest.fn()} search={search} />);
    const input = screen.getByTestId('place-search-input');
    await fireEvent.changeText(input, 'Li');
    await fireEvent.changeText(input, 'Linc');
    await waitFor(() => expect(search).toHaveBeenCalledWith('Linc', null, expect.any(String)));
    await fireEvent.changeText(input, 'Lincoln');
    await waitFor(() => expect(screen.getByText('Lincoln Elementary')).toBeTruthy());
    resolveOld([suggestion('Lincolnshire Old Answer')]);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText('Lincolnshire Old Answer')).toBeNull();
    expect(search).not.toHaveBeenCalledWith('Li', expect.anything(), expect.anything());
  });

  test('offline: says so, and Return falls back to the phone\'s own address lookup', async () => {
    const search = jest.fn(async () => { throw new Error('Network request failed'); });
    const lookup = jest.fn(async () => ({ latitude: 1, longitude: 2 }));
    const onSelect = jest.fn();
    await render(<PlaceSearch onSelect={onSelect} search={search} lookup={lookup} />);
    await fireEvent.changeText(screen.getByTestId('place-search-input'), '12 Oak Street');
    await waitFor(() => expect(screen.getByTestId('place-search-error')).toBeTruthy());
    await fireEvent(screen.getByTestId('place-search-input'), 'submitEditing');
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ latitude: 1, longitude: 2, title: '12 Oak Street' })));
  });
});

test('Add place: tapping a result names the new place, sets its kind and saves its map location on this phone', async () => {
  const repo = await testRepo();
  await completeOnboarding(repo, { ...freshDraft(), child: { ...freshDraft().child, nickname: 'Sam', homeTz: 'America/Chicago' } });
  await useSession.getState().useRepoForTests(repo);
  const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(ok({ features: [LINCOLN] }));
  await renderRouter({ index: () => null, 'settings/place': PlaceEdit }, { initialUrl: '/' });
  await act(async () => { router.push('/settings/place' as never); });
  await routerFire.changeText(routerScreen.getByTestId('place-search-input'), 'Lincoln');
  await routerWait(() => expect(routerScreen.getByTestId('place-search-result-0')).toBeTruthy());
  expect(String(fetchSpy.mock.calls[0][0])).toContain('photon.komoot.io/api/?q=Lincoln');
  await routerFire.press(routerScreen.getByTestId('place-search-result-0'));
  await routerFire.press(routerScreen.getByText('Save'));
  await routerWait(async () => {
    const rows = await all<{ label: string; type: string; latitude: number; longitude: number }>(repo.db,
      "SELECT label, type, latitude, longitude FROM places WHERE label = 'Lincoln Elementary School' AND deleted_at IS NULL");
    expect(rows).toEqual([{ label: 'Lincoln Elementary School', type: 'school', latitude: 41.92, longitude: -87.64 }]);
  });
  fetchSpy.mockRestore();
});
