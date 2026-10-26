/**
 * @jest-environment node
 * Phase 4 data sources (SPEC 10.3, 10.4, 11, 29): the pure rules each integration relies on, and the database writes.
 * No network or native module is touched: responses are small fixtures in the shape each API returns.
 */
import en from '@emolens/shared/i18n/en.json';
import { getChild, toChildProfile } from '../src/db/repo/children';
import { addMedication, dosesBetween, ensureDoseRows, listMedications } from '../src/db/repo/meds';
import { addPlace, applyVisitChange, listPlaces, setPlaceLocation } from '../src/db/repo/logs';
import { getAllSettings, setSetting } from '../src/db/repo/settings';
import { createChild } from '../src/db/repo/children';
import { SOURCES } from '../src/features/sources';
import { autoTags, hasKeyword } from '../src/integrations/calendarRules';
import { saveCalendarEvents, setEventTags } from '../src/integrations/calendarStore';
import { offToFood, sugarTag, usdaToFood } from '../src/integrations/food';
import { pickRegions, visitChangeForEvent } from '../src/integrations/geofence';
import { groupNights, unionIntervals } from '../src/integrations/health/sleep';
import { saveHealth } from '../src/integrations/health/store';
import { getJson, HttpError } from '../src/integrations/http';
import { runRefresh, withTimeout } from '../src/integrations/refresh';
import { candidateIds, propertiesName } from '../src/integrations/rxnorm';
import { averageDbfs, estimatedDb, loudnessWord } from '../src/integrations/sound';
import { getIntegrationState, patchIntegrationState } from '../src/integrations/state';
import { computeStatus } from '../src/integrations/status';
import type { Integration } from '../src/integrations/types';
import { mergeWeather, pollenIndex, saveWeather, weatherIntegration } from '../src/integrations/weather';
import { importSummaryText } from '../src/integrations/importSummary';
import { findDoseForReminder } from '../src/notifications/medActions';
import { nextReminderAt, reminderContent, reminderPlan, toNotificationWeekday } from '../src/notifications/medReminders';
import type { MedicationRow } from '../src/db/rows';
import { testRepo } from './nodeDb';

const TZ = 'America/Chicago';
const H = 3_600_000;
const local = (s: string) => Date.parse(`${s}-05:00`); // Chicago is UTC-5 in late September (CDT)

async function setup() {
  const repo = await testRepo();
  await createChild(repo, { nickname: 'Sam', birthYear: null, homeTz: TZ, communication: null, wakeStart: '07:00', wakeEnd: '21:00',
    typicalSleepHours: 10, episodesPerWeekEstimate: 3, modeledEpisodeTypes: ['meltdown'] });
  const profile = toChildProfile((await getChild(repo.db))!);
  return { repo, profile };
}

// ---------------------------------------------------------------- network helper (SPEC 29)
describe('getJson: 10 s timeout, 2 retries, no retry on 4xx', () => {
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
  const fail = (status: number) => ({ ok: false, status, json: async () => ({}) }) as unknown as Response;
  const sleep = jest.fn(async () => undefined);

  test('retries a server error, then succeeds', async () => {
    const fetchFn = jest.fn().mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(ok({ a: 1 }));
    expect(await getJson('https://x.test/a', { fetchFn, sleep })).toEqual({ a: 1 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  test('gives up after 3 attempts', async () => {
    const fetchFn = jest.fn().mockResolvedValue(fail(500));
    await expect(getJson('https://x.test/a', { fetchFn, sleep })).rejects.toThrow('HTTP 500');
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
  test('does not retry "not found"', async () => {
    const fetchFn = jest.fn().mockResolvedValue(fail(404));
    await expect(getJson('https://x.test/a', { fetchFn, sleep })).rejects.toBeInstanceOf(HttpError);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  test('a slow answer times out', async () => {
    const fetchFn = jest.fn((_u: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
    }));
    await expect(getJson('https://x.test/a', { fetchFn: fetchFn as unknown as typeof fetch, sleep, timeoutMs: 20, retries: 0 })).rejects.toThrow('timed out');
  });
});

// ---------------------------------------------------------------- weather (SPEC 11.5)
describe('weather', () => {
  test('pollen index levels', () => {
    expect(pollenIndex([null, undefined])).toBeNull();
    expect(pollenIndex([0, null])).toBe(0);
    expect(pollenIndex([5, 19.9])).toBe(1);
    expect(pollenIndex([20])).toBe(2);
    expect(pollenIndex([100, 3])).toBe(2);
    expect(pollenIndex([101])).toBe(3);
  });

  test('joins forecast and air quality by hour, marks forecasts, saves, and prunes old hours', async () => {
    const { repo } = await setup();
    const now = Date.parse('2026-09-29T15:30:00.000Z');
    const rows = mergeWeather(
      { hourly: { time: ['2026-09-29T14:00', '2026-09-29T16:00'], temperature_2m: [20.5, 21], surface_pressure: [1012, 1010], relative_humidity_2m: [50, 52], precipitation: [0, 0.2] } },
      { hourly: { time: ['2026-09-29T14:00'], us_aqi: [42], pm2_5: [8], grass_pollen: [30], birch_pollen: [null] } }, now, '2026-09-29T15:30:00.000Z');
    expect(rows[0]).toMatchObject({ time: '2026-09-29T14:00:00.000Z', temperature_c: 20.5, us_aqi: 42, pollen_index: 2, is_forecast: 0 });
    expect(rows[1]).toMatchObject({ us_aqi: null, pollen_index: null, is_forecast: 1 });
    await repo.db.execute("INSERT INTO weather_hourly (time, is_forecast, fetched_at) VALUES ('2026-01-01T00:00:00.000Z', 0, 'x')");
    await saveWeather(repo.db, rows, now);
    await saveWeather(repo.db, rows, now); // upsert: no duplicates
    const saved = (await repo.db.execute('SELECT time FROM weather_hourly ORDER BY time')).rows.map((r) => r.time);
    expect(saved).toEqual(['2026-09-29T14:00:00.000Z', '2026-09-29T16:00:00.000Z']);
  });

  test('refreshes every 3 hours and needs a home location', async () => {
    const { repo, profile } = await setup();
    const now = Date.parse('2026-09-29T15:00:00.000Z');
    const ctx = { repo, profile, settings: await getAllSettings(repo.db), now };
    expect(weatherIntegration.isDue(ctx, null)).toBe(true);
    expect(weatherIntegration.isDue(ctx, new Date(now - 2 * H).toISOString())).toBe(false);
    expect(weatherIntegration.isDue(ctx, new Date(now - 3 * H).toISOString())).toBe(true);
    expect((await weatherIntegration.setupDetail!(ctx)).ready).toBe(false);
    const [home] = [await addPlace(repo, profile.id, { label: 'Home', type: 'home' })];
    const place = (await listPlaces(repo.db, profile.id)).find((p) => p.id === home)!;
    await setPlaceLocation(repo, place, 41.87814, -87.62979);
    const s = await getAllSettings(repo.db);
    expect([s.weather_lat, s.weather_lon]).toEqual([41.88, -87.63]); // rounded to about 1 km
    expect((await weatherIntegration.setupDetail!({ ...ctx, settings: s })).ready).toBe(true);
    const outbox = (await repo.db.execute("SELECT payload_json FROM outbox WHERE table_name = 'places_public'")).rows;
    expect(outbox).toHaveLength(0); // Care Team off: nothing queued (and coordinates are never included; see repo.test.ts)
  });
});

// ---------------------------------------------------------------- calendar (SPEC 11.3)
describe('calendar tags', () => {
  test('keywords match whole words only', () => {
    expect(hasKeyword('Breakfast with grandma', 'break')).toBe(false);
    expect(hasKeyword('Spring break!', 'break')).toBe(true);
    expect(hasKeyword('Hot lunch day', 'ot')).toBe(false);
    expect(hasKeyword('OT session', 'ot')).toBe(true);
    expect(hasKeyword('Field-trip to zoo', 'field trip')).toBe(true);
  });
  test('rules from SPEC 11.3, Spanish keywords, and the parent\'s own words', () => {
    expect(autoTags('Dentist', false)).toEqual(['transition', 'appointment']);
    expect(autoTags('Emma birthday party', false)).toEqual(['transition', 'unusual', 'social']);
    expect(autoTags('No school - teacher institute', true)).toEqual(['no_school']); // not also a school event
    expect(autoTags('School picture day', false)).toEqual(['transition', 'unusual', 'school_event']);
    expect(autoTags('Cita con la dentista', false)).toEqual(['transition', 'appointment']);
    expect(autoTags('Swim lesson', false)).toEqual(['transition']);
    expect(autoTags('Swim lesson', false, { unusual: ['swim'] })).toEqual(['transition', 'unusual']);
    expect(autoTags(null, true)).toEqual([]);
  });
});

describe('calendar store', () => {
  const ev = (id: string, title: string, start: string, cal = 'cal1') => ({ externalId: id, calendarId: cal, title, startAt: start, endAt: start, allDay: false });
  const W: [string, string] = ['2026-09-01T00:00:00.000Z', '2026-10-15T00:00:00.000Z'];

  test('upserts, keeps hand-made tags, removes vanished events and unchosen calendars', async () => {
    const { repo, profile } = await setup();
    await saveCalendarEvents(repo, profile.id, [ev('a', 'Dentist', '2026-09-29T15:00:00.000Z'), ev('b', 'Soccer', '2026-09-30T15:00:00.000Z')], ['cal1'], ...W, {});
    const a = (await repo.db.execute("SELECT * FROM calendar_events WHERE external_id = 'a'")).rows[0];
    expect(JSON.parse(String(a.tags))).toEqual(['transition', 'appointment']);

    await setEventTags(repo, profile.id, String(a.id), ['transition'], true); // parent: not really an appointment, ignore it
    const { changed, added } = await saveCalendarEvents(repo, profile.id, [ev('a', 'Dentist', '2026-09-29T15:00:00.000Z')], ['cal1'], ...W, {});
    expect([changed, added]).toEqual([1, 0]); // 'b' vanished → removed; 'a' unchanged
    const rows = (await repo.db.execute('SELECT * FROM calendar_events')).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ external_id: 'a', ignored: 1, user_tagged: 1, tags: '["transition"]' });

    await saveCalendarEvents(repo, profile.id, [], [], ...W, {}); // no calendars chosen any more
    expect((await repo.db.execute('SELECT * FROM calendar_events')).rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------- health (SPEC 11.1)
describe('sleep nights', () => {
  test('overlapping intervals are counted once', () => {
    expect(unionIntervals([{ start: 0, end: 10 }, { start: 5, end: 20 }, { start: 30, end: 40 }])).toEqual([{ start: 0, end: 20 }, { start: 30, end: 40 }]);
  });
  test('one night per morning: gaps under 90 min merge, wakings counted, naps ignored', () => {
    const nights = groupNights([
      { start: local('2026-09-28T20:30:00'), end: local('2026-09-29T01:00:00') },
      { start: local('2026-09-29T01:20:00'), end: local('2026-09-29T06:45:00') }, // 20-min waking
      { start: local('2026-09-29T06:00:00'), end: local('2026-09-29T06:30:00') }, // watch + phone overlap
      { start: local('2026-09-29T14:00:00'), end: local('2026-09-29T15:00:00') }, // afternoon nap: not a night
    ], TZ);
    expect(nights).toHaveLength(1);
    expect(nights[0]).toMatchObject({ localDate: '2026-09-29', wakings: 1, asleepMin: 270 + 325, inBedOnly: false });
    expect(nights[0].start).toBe(local('2026-09-28T20:30:00'));
  });
  test('a 2-hour gap splits the sleep; only the part ending in the morning window is the night', () => {
    const nights = groupNights([
      { start: local('2026-09-28T21:00:00'), end: local('2026-09-29T00:30:00') },
      { start: local('2026-09-29T02:30:00'), end: local('2026-09-29T07:00:00') },
    ], TZ);
    expect(nights.map((n) => [n.localDate, n.asleepMin])).toEqual([['2026-09-29', 270]]);
  });
});

describe('health store', () => {
  test('re-syncing the same data changes nothing; nights update in place', async () => {
    const { repo, profile } = await setup();
    const samples = [{ externalId: 'hr1', type: 'heart_rate' as const, start: 1, end: 1, value: 88, unit: 'count/min' }];
    const night = { localDate: '2026-09-29', start: local('2026-09-28T21:00:00'), end: local('2026-09-29T07:00:00'), asleepMin: 600, wakings: 0, inBedOnly: false };
    expect(await saveHealth(repo, profile.id, 'healthkit', samples, [night])).toEqual({ changed: 2, summary: { heart_rate: 1, nights: 1 } });
    expect(await saveHealth(repo, profile.id, 'healthkit', samples, [night])).toEqual({ changed: 0, summary: {} });
    expect((await saveHealth(repo, profile.id, 'healthkit', samples, [{ ...night, asleepMin: 580, wakings: 2 }])).changed).toBe(1);
    const sleep = (await repo.db.execute('SELECT * FROM sleep_entries')).rows;
    expect(sleep).toHaveLength(1);
    expect(sleep[0]).toMatchObject({ source: 'healthkit', duration_min: 580, night_wakings: 2, external_id: 'healthkit:night:2026-09-29' });
    expect((await repo.db.execute('SELECT external_id FROM health_samples')).rows).toEqual([{ external_id: 'healthkit:hr1' }]);
  });
});

// ---------------------------------------------------------------- places / geofencing (SPEC 11.4)
describe('geofence visits', () => {
  const places = [{ id: 'home', type: 'home' }, { id: 'school', type: 'school' }];
  test('enter opens a visit and closes the previous one', () => {
    expect(visitChangeForEvent([{ id: 'v1', placeId: null }], places, { kind: 'enter', placeId: 'school' }))
      .toEqual({ close: ['v1'], open: { placeId: 'school', placeType: 'school' } });
    expect(visitChangeForEvent([{ id: 'v1', placeId: 'school' }], places, { kind: 'enter', placeId: 'school' })).toEqual({ close: [], open: null });
  });
  test('leaving the current place means "somewhere untagged"; leaving another place changes nothing', () => {
    expect(visitChangeForEvent([{ id: 'v1', placeId: 'home' }], places, { kind: 'exit', placeId: 'home' }))
      .toEqual({ close: ['v1'], open: { placeId: null, placeType: 'away_untagged' } });
    expect(visitChangeForEvent([{ id: 'v1', placeId: 'school' }], places, { kind: 'exit', placeId: 'home' })).toEqual({ close: [], open: null });
    expect(visitChangeForEvent([], places, { kind: 'enter', placeId: 'deleted' })).toEqual({ close: [], open: null });
  });
  test('at most 20 regions, home first', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ type: 'other', label: `P${String(i).padStart(2, '0')}` }));
    const picked = pickRegions([...many, { type: 'home', label: 'Zz home' }]);
    expect(picked).toHaveLength(20);
    expect(picked[0].type).toBe('home');
  });
  test('a geofence arrival is saved as a visit from the right source', async () => {
    const { repo, profile } = await setup();
    await applyVisitChange(repo, profile.id, { close: [], open: { placeId: null, placeType: 'away_untagged' } }, '2026-09-29T15:00:00.000Z', 'geofence_parent');
    const v = (await repo.db.execute('SELECT place_type, source FROM place_visits')).rows;
    expect(v).toEqual([{ place_type: 'away_untagged', source: 'geofence_parent' }]);
  });
});

// ---------------------------------------------------------------- food (SPEC 10.4)
describe('food tags', () => {
  test('sugar thresholds: 15 g per serving or 22.5 g per 100 g', () => {
    expect(sugarTag(22.5, null)).toEqual(['high_sugar']);
    expect(sugarTag(22.4, 14.9)).toEqual([]);
    expect(sugarTag(null, 15)).toEqual(['high_sugar']);
  });
  test('Open Food Facts product', () => {
    const f = offToFood('012345', { status: 1, product: { product_name: 'Fruit Snacks', brands: 'Acme, Other', additives_tags: ['en:e129', 'en:e330'],
      categories_tags: ['en:snacks'], nutriments: { sugars_100g: 45 } } });
    expect(f).toEqual({ name: 'Fruit Snacks · Acme', source: 'off', code: '012345', tags: ['high_sugar', 'artificial_color'] });
    expect(offToFood('999', { status: 0 })).toBeNull();
    expect(offToFood('1', { status: 1, product: { product_name: 'Cold brew', categories_tags: ['en:coffees'] } })?.tags).toEqual(['caffeine']);
  });
  test('USDA search result', () => {
    const f = usdaToFood({ fdcId: 7, description: 'CHOCOLATE MILK', servingSize: 240, servingSizeUnit: 'g',
      foodNutrients: [{ nutrientNumber: '269', nutrientName: 'Total Sugars', value: 10 }, { nutrientNumber: '262', nutrientName: 'Caffeine', value: 2 }] });
    expect(f).toEqual({ name: 'Chocolate milk', source: 'usda', code: '7', tags: ['high_sugar', 'caffeine'] }); // 10 g/100 g × 240 g = 24 g
  });
});

describe('RxNorm parsing', () => {
  test('unique candidates in order; display name prefers the short synonym', () => {
    expect(candidateIds({ approximateGroup: { candidate: [{ rxcui: '1' }, { rxcui: '2' }, { rxcui: '1' }, {}] } })).toEqual(['1', '2']);
    expect(propertiesName({ properties: { name: 'melatonin 1 MG Oral Tablet', synonym: 'Melatonin 1 mg tablet' } })).toBe('Melatonin 1 mg tablet');
    expect(propertiesName({ properties: { name: 'guanfacine', synonym: '' } })).toBe('guanfacine');
    expect(propertiesName({})).toBeNull();
  });
});

// ---------------------------------------------------------------- medication reminders (SPEC 10.3, 27.2)
describe('medication reminders', () => {
  const med = (over: Partial<MedicationRow>): MedicationRow => ({ id: 'm1', child_id: 'c', name: 'Guanfacine', rxcui: null, strength: '1 mg', form: null,
    schedule: JSON.stringify({ times: ['08:00', '20:00'], days: [1, 2, 3, 4, 5, 6, 7] }), as_needed: 0, reminders_enabled: 1, active_from: '2026-01-01', active_to: null, notes: null, ...over });

  test('every day → daily reminders; some days → weekly with Sunday = 1', () => {
    expect(toNotificationWeekday(7)).toBe(1);
    expect(toNotificationWeekday(1)).toBe(2);
    expect(reminderPlan([med({})], 'America/Chicago').map((s) => [s.time, s.weekday])).toEqual([['08:00', null], ['20:00', null]]);
    const weekdays = reminderPlan([med({ schedule: JSON.stringify({ times: ['07:30'], days: [1, 7] }) })], 'America/Chicago');
    expect(weekdays.map((s) => [s.hour, s.minute, s.weekday])).toEqual([[7, 30, 2], [7, 30, 1]]);
  });
  // BUGS.md #6: times are the child's home time; the phone schedules on its own clock, so convert when they differ.
  test('reminders fire at the child\'s home time even when the phone is in another time zone', () => {
    const now = Date.parse('2026-09-29T17:00:00.000Z');
    const daily = reminderPlan([med({ schedule: JSON.stringify({ times: ['08:00'], days: [1, 2, 3, 4, 5, 6, 7] }) })], 'America/Chicago', 'America/New_York', now);
    expect(daily.map((s) => [s.time, s.hour, s.minute, s.weekday])).toEqual([['08:00', 9, 0, null]]);
    // 22:30 on the child's Monday in Los Angeles is 06:30 on Tuesday in London.
    const weekly = reminderPlan([med({ schedule: JSON.stringify({ times: ['22:30'], days: [1] }) })], 'America/Los_Angeles', 'Europe/London', now);
    expect(weekly.map((s) => [s.hour, s.minute, s.weekday])).toEqual([[6, 30, toNotificationWeekday(2)]]);
    expect(nextReminderAt({ times: ['08:00', '20:00'], days: [1, 2, 3, 4, 5, 6, 7] }, 'America/Chicago', now)).toBe(Date.parse('2026-09-30T01:00:00.000Z'));
    expect(nextReminderAt({ times: ['08:00'], days: [] }, 'America/Chicago', now)).toBeNull();
  });
  test('no reminders for as-needed, stopped, or reminders-off medications', () => {
    expect(reminderPlan([med({ as_needed: 1 }), med({ active_to: '2026-09-01' }), med({ reminders_enabled: 0 })], 'America/Chicago')).toEqual([]);
  });
  test('the notification never names the medication (lock-screen privacy)', () => {
    const c = reminderContent(reminderPlan([med({})], 'America/Chicago')[0]);
    expect(`${c.title} ${c.body}`).not.toMatch(/guanfacine/i);
    expect(c.categoryIdentifier).toBe('MED_DOSE');
  });
  test('"Given" finds today\'s open dose at that time', async () => {
    const { repo, profile } = await setup();
    await addMedication(repo, profile.id, { name: 'Guanfacine', strength: '1 mg', form: null, schedule: { times: ['08:00', '20:00'], days: [1, 2, 3, 4, 5, 6, 7] },
      asNeeded: false, remindersEnabled: true, activeFrom: '2026-09-01', notes: null });
    await ensureDoseRows(repo, profile, Date.parse('2026-09-29T14:00:00.000Z'));
    const [m] = await listMedications(repo.db, profile.id);
    const doses = await dosesBetween(repo.db, profile.id, '2026-09-29T05:00:00.000Z', '2026-09-30T05:00:00.000Z');
    expect(findDoseForReminder(doses, m.id, '20:00', TZ)?.scheduled_for).toBe('2026-09-30T01:00:00.000Z');
    expect(findDoseForReminder(doses, m.id, '12:00', TZ)).toBeNull();
  });
});

// ---------------------------------------------------------------- sound (SPEC 11.6)
describe('sound check', () => {
  test('averages sound power, not the decibel numbers', () => {
    expect(averageDbfs([-40, -40])).toBeCloseTo(-40);
    expect(averageDbfs([-20, -60])!).toBeCloseTo(-23.01, 1); // the loud half dominates
    expect(averageDbfs([null, Number.NaN])).toBeNull();
    expect(estimatedDb(-35.04, 90)).toBe(55);
    expect([loudnessWord(40), loudnessWord(55), loudnessWord(70), loudnessWord(85)]).toEqual(['quiet', 'moderate', 'loud', 'very_loud']);
  });
});

// ---------------------------------------------------------------- status + refresh (SPEC 11, 11.8, 29)
describe('status', () => {
  const state = { enabled: true, lastSyncAt: '2026-09-29T10:00:00.000Z', lastSuccessAt: '2026-09-29T10:00:00.000Z', lastError: null };
  test('priority: unavailable, off, permission, setup, error, ok', () => {
    expect(computeStatus({ state, available: false, permission: true, setup: { ready: true } }).health).toBe('unavailable');
    expect(computeStatus({ state: { ...state, enabled: false }, available: true, permission: true, setup: { ready: true } }).health).toBe('off');
    expect(computeStatus({ state, available: true, permission: false, setup: { ready: true } }).health).toBe('needs_permission');
    expect(computeStatus({ state, available: true, permission: true, setup: { ready: false } }).health).toBe('needs_setup');
    expect(computeStatus({ state: { ...state, lastSyncAt: '2026-09-29T11:00:00.000Z', lastError: 'boom' }, available: true, permission: true, setup: { ready: true } }).health).toBe('error');
    expect(computeStatus({ state: { ...state, lastError: 'old' }, available: true, permission: true, setup: { ready: true } }).health).toBe('ok');
  });
  test('every source has its name, explanation and status words in English', () => {
    const has = (k: string) => k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)?.[p], en) != null;
    for (const s of Object.values(SOURCES)) { expect(has(s.titleKey)).toBe(true); expect(has(s.bodyKey)).toBe(true); }
    for (const h of ['ok', 'off', 'needs_permission', 'needs_setup', 'error', 'unavailable']) expect(has(`sources.status.${h}`)).toBe(true);
  });
});

describe('refresh', () => {
  const fake = (id: Integration['id'], over: Partial<Integration> = {}): Integration => ({
    id, isAvailable: async () => true, hasPermission: async () => true, requestPermission: async () => true,
    isDue: () => true, sync: jest.fn(async () => ({ changed: 1 })), ...over,
  });

  test('one failing source does not stop the others; results are recorded per source', async () => {
    const { repo, profile } = await setup();
    for (const id of ['weather', 'calendar', 'health'] as const) await patchIntegrationState(repo.db, id, { enabled: true });
    const good = fake('weather');
    const bad = fake('calendar', { sync: async () => { throw new Error('calendar exploded'); } });
    const noSetup = fake('health', { setupDetail: async () => ({ ready: false }) });
    const off = fake('location');
    const r = await runRefresh({ repo, profile, now: Date.now() }, [good, bad, noSetup, off]);
    expect(r).toMatchObject({ ran: ['weather'], failed: ['calendar'], skipped: ['health', 'location'] });
    expect((await getIntegrationState(repo.db, 'weather')).lastSuccessAt).not.toBeNull();
    expect((await getIntegrationState(repo.db, 'calendar')).lastError).toMatch('calendar exploded');
    expect((await getIntegrationState(repo.db, 'health')).lastSuccessAt).toBeNull(); // not set up ≠ synced
    expect((await repo.db.execute("SELECT area FROM app_errors")).rows.map((x) => x.area)).toEqual(['sync:calendar']);
  });

  test('sources that are not due are skipped unless forced; a stuck source times out', async () => {
    const { repo, profile } = await setup();
    await patchIntegrationState(repo.db, 'weather', { enabled: true });
    const notDue = fake('weather', { isDue: () => false });
    expect((await runRefresh({ repo, profile, now: Date.now() }, [notDue])).skipped).toEqual(['weather']);
    expect((await runRefresh({ repo, profile, now: Date.now() }, [notDue], { force: true })).ran).toEqual(['weather']);
    const stuck = fake('weather', { sync: () => new Promise(() => undefined) });
    const r = await runRefresh({ repo, profile, now: Date.now() }, [stuck], { stepMs: 30 });
    expect(r.failed).toEqual(['weather']);
    await expect(withTimeout(new Promise(() => undefined), 10, 'x')).rejects.toThrow('x took too long');
  });

  test('refresh also keeps dose rows up to date (SPEC 11.8)', async () => {
    const { repo, profile } = await setup();
    await setSetting(repo.db, 'care_team_enabled', false);
    await addMedication(repo, profile.id, { name: 'X', strength: null, form: null, schedule: { times: ['08:00'], days: [1, 2, 3, 4, 5, 6, 7] },
      asNeeded: false, remindersEnabled: false, activeFrom: '2026-01-01', notes: null });
    await runRefresh({ repo, profile, now: Date.parse('2026-09-29T20:00:00.000Z') }, []);
    const statuses = (await repo.db.execute('SELECT status FROM med_doses ORDER BY scheduled_for')).rows.map((r) => r.status);
    expect(statuses.length).toBe(7);
    expect(statuses.every((s) => s === 'missed')).toBe(true); // all 08:00 doses are > 4 h old at 15:00 Chicago
  });
});


// ---------------------------------------------------------------- Simulator bug: Apple Health sleep "In Bed" only
describe('in-bed sleep and import summary (bug found in the Simulator)', () => {
  const inBedNight = { start: local('2026-09-28T21:30:00'), end: local('2026-09-29T06:45:00') };

  test('a night with only "in bed" time (sleep added by hand in the Health app) becomes a night', () => {
    const [n] = groupNights([], TZ, [inBedNight]);
    expect(n).toMatchObject({ localDate: '2026-09-29', asleepMin: 555, wakings: null, inBedOnly: true });
  });

  test('asleep data wins over in-bed time for the same night', () => {
    const asleep = [{ start: local('2026-09-28T22:00:00'), end: local('2026-09-29T06:00:00') }];
    const [n] = groupNights(asleep, TZ, [inBedNight]);
    expect(n).toMatchObject({ asleepMin: 480, inBedOnly: false });
  });

  test('"Sync now" sentence lists only new items and names sources that failed or sent nothing', () => {
    const t = (key: string, o?: Record<string, unknown>) => {
      const count = o?.count as number | undefined;
      const flat = key.split('.').reduce<unknown>((x, p) => (x as Record<string, unknown>)?.[p], en)
        ?? key.split('.').reduce<unknown>((x, p, i, a) => (x as Record<string, unknown>)?.[i === a.length - 1 ? `${p}_${count === 1 ? 'one' : 'other'}` : p], en);
      return String(flat).replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(o?.[k]));
    };
    const name = (id: string) => ({ health: 'Apple Health', calendar: 'Calendar', weather: 'Weather & air' } as Record<string, string>)[id];
    const report = { ran: ['health' as const], skipped: [], failed: [], timedOut: false, imported: { health: { changed: 2, summary: { nights: 1, heart_rate: 1 }, foundData: true } } };
    expect(importSummaryText(report, t, name)).toBe('Imported 1 night, 1 heart-rate reading.');
    const quiet = { ...report, imported: { health: { changed: 0, summary: {}, foundData: false } }, failed: ['calendar' as const] };
    expect(importSummaryText(quiet, t, name)).toBe('Up to date. Nothing new to import. No data received from Apple Health. Calendar couldn\'t sync.');
    const many = { ...report, imported: { health: { changed: 5, summary: { nights: 2, heart_rate: 3 } }, weather: { changed: 72, summary: { weather_hours: 72 } } } };
    expect(importSummaryText(many, t, name)).toBe('Imported 2 nights, 3 heart-rate readings, 72 hours of weather.');
  });

  test('status says "No data received" instead of "Connected" when a sync found nothing at all', () => {
    const state = { enabled: true, lastSyncAt: '2026-09-29T10:00:00.000Z', lastSuccessAt: '2026-09-29T10:00:00.000Z', lastError: null };
    expect(computeStatus({ state: { ...state, lastFoundData: false }, available: true, permission: true, setup: { ready: true } }).health).toBe('no_data');
    expect(computeStatus({ state: { ...state, lastFoundData: true }, available: true, permission: true, setup: { ready: true } }).health).toBe('ok');
    expect(computeStatus({ state: { ...state, lastFoundData: null }, available: true, permission: true, setup: { ready: true } }).health).toBe('ok');
  });
});
