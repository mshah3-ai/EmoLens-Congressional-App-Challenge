/**
 * @jest-environment node
 * Care Team sync (SPEC 23, 30.2): two phones (two real SQLite databases with the app's migrations) sync through an
 * in-memory cloud with the same rules (fakeCloud.ts). Covers: turning Care Team on, joining, the LWW merge incl. ties,
 * outbox order / batches / backoff, rows a role may not write, pulled rows marking blocks dirty, the same day closed
 * on two phones, removal (the removed phone deletes its copy, DECISIONS #118), answers cancelling the other phone's
 * question, snapshots and share links, and demo mode.
 */
import * as Notifications from 'expo-notifications';
import { SUSPECTED_TRIGGERS } from '@emolens/shared';
import { DEMO_SUSPECTED } from '@emolens/simulator';
import { localDateOf } from '@emolens/engine';
import { buildDemo } from '../src/demo/build';
import { getChild, toChildProfile } from '../src/db/repo/children';
import { getAllSettings, setSettings } from '../src/db/repo/settings';
import { Repo } from '../src/db/repo/writer';
import { all, one } from '../src/db/types';
import { exportAll } from '../src/backup/export';
import { readSnapshot } from '../src/forecast/snapshot';
import { fromCloud, phoneTime, toCloud } from '../src/sync/convert';
import { incomingWins } from '../src/sync/merge';
import { SPEC_BY_LOCAL, SYNC_SPECS } from '../src/sync/tables';
import { MAX_ATTEMPTS, PUSH_BATCH, backoffMs, outboxCount, push } from '../src/sync/push';
import { pull } from '../src/sync/pull';
import { initialPush, joinCareTeam, turnOnCareTeam } from '../src/sync/enable';
import { refreshTeam } from '../src/sync/team';
import { deleteItem, restoreItem } from '../src/db/repo/timeline';
import { afterPullAlerts } from '../src/sync/alerts';
import { schoolBlocks, shareAfterForecast } from '../src/sync/snapshot';
import { createShareLink, listShareLinks, revokeShareLink, shareSnapshot } from '../src/sync/share';
import { setCloudApiForTests } from '../src/cloud/current';
import { syncIdle, syncNow, useSyncStatus } from '../src/sync/engine';
import { useSession } from '../src/store/session';
import { forecastIdle } from '../src/forecast';
import { FakeCloud } from './fakeCloud';
import { findSchoolLeaks } from './privacyChecks';
import { testRepo } from './nodeDb';
import { deleteDatabaseFile } from '../src/db/opsqlite';
import { deleteKeys } from '../src/db/keys';

jest.setTimeout(180_000);
// A removed phone deletes its copy (DECISIONS #118): stand-ins for the database files, the keys and the Keychain.
jest.mock('../src/db/opsqlite', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't use imports
  openEncrypted: jest.fn(() => require('./nodeDb').nodeDb()), // a brand-new empty database, like after deletion
  deleteDatabaseFile: jest.fn(),
}));
jest.mock('../src/db/keys', () => ({
  getOrCreateDbKey: jest.fn(async () => 'key'),
  getOrCreateDeviceId: jest.fn(async () => 'device-b'),
  deleteKeys: jest.fn(async () => undefined),
}));
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    store, AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => { store.set(k, v); }),
    deleteItemAsync: jest.fn(async (k: string) => { store.delete(k); }),
  };
});
const keychain = (jest.requireMock('expo-secure-store') as { store: Map<string, string> }).store;
// a sync that pulled something asks for a forecast; not needed here (and its timer would outlive the test)
jest.mock('../src/forecast', () => ({ ...jest.requireActual('../src/forecast'), requestForecast: jest.fn() }));

const OWNER = '11111111-1111-4111-8111-111111111111';
const CARE = '22222222-2222-4222-8222-222222222222';
const TEACHER = '33333333-3333-4333-8333-333333333333';
const TZ = 'America/Chicago';
const NOW = Date.parse('2026-09-30T16:00:00.000Z'); // Wednesday 11:00 in Chicago

const cloud = new FakeCloud();
let A: Repo; // the owner's phone
let B: Repo; // a caregiver's phone
let profile: ReturnType<typeof toChildProfile>;

const phone = async (deviceId: string, createdBy: string) => { const r = await testRepo(); return new Repo(r.db, { deviceId, createdBy }); };

beforeAll(async () => {
  A = await phone('device-a', 'local');
  await buildDemo(A, { lang: 'en', tz: TZ, now: NOW, days: 30, yieldToUi: false });
  profile = toChildProfile((await getChild(A.db))!, SUSPECTED_TRIGGERS.filter((t) => DEMO_SUSPECTED.includes(t.id)).map((t) => t.id));
  // a place with coordinates: they must never reach the cloud
  await A.db.execute("UPDATE places SET latitude = 41.88, longitude = -87.63 WHERE type = 'home'");
});

describe('pure parts', () => {
  test('server times become the phone format (6 decimals, "+00", space, other offsets)', () => {
    expect(phoneTime('2026-09-30T14:05:00.123456+00:00')).toBe('2026-09-30T14:05:00.123Z');
    expect(phoneTime('2026-09-30 14:05:00+00')).toBe('2026-09-30T14:05:00.000Z');
    expect(phoneTime('2026-09-30T09:05:00.5-05:00')).toBe('2026-09-30T14:05:00.500Z');
    expect(phoneTime(null)).toBeNull();
    expect(() => phoneTime('yesterday')).toThrow();
  });

  test('last writer wins; a tie goes to the greater device id; without device ids the phone keeps its copy', () => {
    const v = (updated_at: string, device_id: string | null = 'b') => ({ updated_at, device_id });
    expect(incomingWins(null, v('2026-01-01T00:00:00.000Z'))).toBe(true);
    expect(incomingWins(v('2026-01-01T00:00:00.000Z'), v('2026-01-01T00:00:00.001Z'))).toBe(true);
    expect(incomingWins(v('2026-01-01T00:00:00.001Z'), v('2026-01-01T00:00:00.000Z'))).toBe(false);
    expect(incomingWins(v('2026-01-01T00:00:00.000Z', 'a'), v('2026-01-01T00:00:00.000Z', 'b'))).toBe(true);
    expect(incomingWins(v('2026-01-01T00:00:00.000Z', 'b'), v('2026-01-01T00:00:00.000Z', 'a'))).toBe(false);
    expect(incomingWins(v('2026-01-01T00:00:00.000Z', 'b'), v('2026-01-01T00:00:00.000Z', 'b'))).toBe(false); // our own echo
    expect(incomingWins(v('2026-01-01T00:00:00.000Z', null), v('2026-01-01T00:00:00.000Z', null))).toBe(false);
  });

  test('conversion: booleans, JSON, child ids from the parent row, phone-only columns stay behind', () => {
    const ep = { id: 'e1', child_id: 'c1', safety_concern: 1, details_complete: 0, antecedent_tags: '["transition"]', created_by: 'local', started_at: 'x' };
    const c = toCloud(SPEC_BY_LOCAL.episodes, ep, { userId: OWNER, childIdOf: () => null })!;
    expect(c).toMatchObject({ safety_concern: true, details_complete: false, antecedent_tags: ['transition'], created_by: OWNER });
    const dose = toCloud(SPEC_BY_LOCAL.med_doses, { id: 'd1', medication_id: 'm1', created_by: CARE }, { userId: CARE, childIdOf: (t, id) => (t === 'medications' && id === 'm1' ? 'c1' : null) });
    expect(dose?.child_id).toBe('c1');
    expect(toCloud(SPEC_BY_LOCAL.med_doses, { id: 'd2', medication_id: 'unknown' }, { userId: CARE, childIdOf: () => null })).toBeNull();
    const place = toCloud(SPEC_BY_LOCAL.places, { id: 'p1', child_id: 'c1', label: 'Home', latitude: 41.8, longitude: -87.6, radius_m: 150, geofence_enabled: 1 }, { userId: OWNER, childIdOf: () => null })!;
    expect(Object.keys(place)).not.toEqual(expect.arrayContaining(['latitude']));
    expect(place).not.toHaveProperty('longitude');
    expect(place).not.toHaveProperty('created_by');
    const alert = toCloud(SPEC_BY_LOCAL.alerts, { id: 'a1', notification_id: 'n', confirm_notification_id: 'c' }, { userId: OWNER, childIdOf: () => null })!;
    expect(alert).not.toHaveProperty('notification_id');
    const back = fromCloud(SPEC_BY_LOCAL.episodes, { ...c, owner_id: 'x', server_received_at: 'y', started_at: '2026-09-30T14:05:00+00:00' },
      ['id', 'child_id', 'safety_concern', 'details_complete', 'antecedent_tags', 'started_at']);
    expect(back).toEqual({ id: 'e1', child_id: 'c1', safety_concern: 1, details_complete: 0, antecedent_tags: '["transition"]', started_at: '2026-09-30T14:05:00.000Z' });
  });

  test('backoff: 2, 4, 8 ... seconds, capped at 2^10', () => {
    expect([1, 2, 3].map(backoffMs)).toEqual([2000, 4000, 8000]);
    expect(backoffMs(40)).toBe(2 ** MAX_ATTEMPTS * 1000);
  });
});

describe('two phones', () => {
  test('the owner turns on Care Team: history uploads parents first in batches of 500, as the account, without coordinates', async () => {
    await turnOnCareTeam(A.db, OWNER);
    A.env.createdBy = OWNER;
    const left = await all<{ n: number }>(A.db, "SELECT COUNT(*) AS n FROM episodes WHERE created_by = 'local'");
    expect(left[0].n).toBe(0);
    expect(await initialPush(A.db, cloud.as(OWNER), OWNER)).toBeNull();
    await setSettings(A.db, { care_team_pushed: true });

    expect(cloud.calls[0].table).toBe('children');
    expect(cloud.calls.every((c) => c.rows <= 500)).toBe(true);
    const first = (t: string) => cloud.calls.findIndex((c) => c.table === t);
    expect(first('medications')).toBeLessThan(first('med_doses'));
    if (first('alert_responses') >= 0) expect(first('alerts')).toBeLessThan(first('alert_responses'));
    for (const spec of SYNC_SPECS) {
      const local = await all(A.db, `SELECT id FROM ${spec.local}`);
      expect([spec.cloud, cloud.rows(spec.cloud).length]).toEqual([spec.cloud, local.length]);
    }
    const everything = JSON.stringify([...cloud.tables.values()].map((t) => [...t.values()]));
    expect(everything).not.toMatch(/41\.88|-87\.63|latitude|longitude|notification_id|audio_path/);
    expect(everything).not.toContain('"created_by":"local"');
    expect(cloud.roleOf(OWNER, profile.id)).toBe('owner');
  });

  test('a caregiver joins with a code: the second phone gets the same data in every synced table', async () => {
    const inv = await cloud.as(OWNER).call<{ code: string }>('invite-create', { child_id: profile.id, role: 'caregiver' });
    B = await phone('device-b', CARE);
    const r = await joinCareTeam(B.db, cloud.as(CARE), CARE, inv.data!.code, { receiveAlerts: true, childDevice: false });
    expect(r).toMatchObject({ childId: profile.id, role: 'caregiver', nickname: 'Sam (demo)' });

    for (const spec of SYNC_SPECS) {
      const cols = (await all<{ name: string }>(B.db, `PRAGMA table_info(${spec.local})`)).map((c) => c.name).filter((c) => !spec.localOnly.includes(c));
      const [a, b] = await Promise.all([A, B].map((p) => all<Record<string, unknown>>(p.db, `SELECT ${cols.join(', ')} FROM ${spec.local} ORDER BY id`)));
      const norm = (rows: Record<string, unknown>[]) => rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) =>
        [k, spec.json.includes(k) && v != null ? JSON.parse(String(v)) : v])));
      expect([spec.local, norm(b)]).toEqual([spec.local, norm(a)]);
    }
    expect(await all(B.db, 'SELECT latitude FROM places WHERE latitude IS NOT NULL')).toHaveLength(0);
    const s = await getAllSettings(B.db);
    expect(s).toMatchObject({ care_team_enabled: true, member_role: 'caregiver', primary_forecaster: false, receive_alerts: true, mode: 'account' });
    // a second use of the same code doesn't work
    const again = await joinCareTeam((await phone('device-x', TEACHER)).db, cloud.as(TEACHER), TEACHER, inv.data!.code, { receiveAlerts: false, childDevice: false });
    expect(again).toEqual({ error: 'expired' });
  });

  test('entries sync both ways; pulled rows mark blocks dirty and never go back into the outbox', async () => {
    await A.db.execute('UPDATE blocks SET dirty = 0');
    const id = await B.write((w) => w.insert('episodes', { child_id: profile.id, started_at: '2026-09-29T20:00:00.000Z', duration_min: 10, type: 'meltdown',
      intensity: 3, place_id: null, place_type: 'home', antecedent_tags: '[]', antecedent_note: null, behavior_tags: '[]', safety_concern: 0,
      notes: 'from the caregiver', details_complete: 1, source: 'manual' }));
    expect(await outboxCount(B.db)).toBe(1);
    expect((await push(B.db, cloud.as(CARE), { userId: CARE, isOwner: false })).error).toBeNull();
    expect(await outboxCount(B.db)).toBe(0);

    const pulled = await pull(A.db, cloud.as(OWNER), profile.id);
    expect(pulled.ids.episodes).toContain(id);
    expect(await one(A.db, 'SELECT created_by, notes FROM episodes WHERE id = ?', [id])).toEqual({ created_by: CARE, notes: 'from the caregiver' });
    expect(await outboxCount(A.db)).toBe(0);
    const dirty = await all<{ block_start: string }>(A.db, 'SELECT block_start FROM blocks WHERE dirty = 1');
    expect(dirty.length).toBeGreaterThan(0);
    expect(dirty.every((b) => Math.abs(Date.parse(b.block_start) - Date.parse('2026-09-29T20:00:00.000Z')) <= 24 * 3_600_000)).toBe(true);
    // pulling again changes nothing
    expect((await pull(A.db, cloud.as(OWNER), profile.id)).applied).toEqual({});
  });

  test('both phones edit the same hard moment: the later edit wins on both; a tie goes to the greater device id', async () => {
    const [ep] = await all<{ id: string }>(A.db, "SELECT id FROM episodes WHERE notes = 'from the caregiver'");
    const edit = async (p: Repo, notes: string, at: string) => {
      await p.write((w) => w.update('episodes', ep.id, { notes }));
      await p.db.execute('UPDATE episodes SET updated_at = ? WHERE id = ?', [at, ep.id]);
    };
    const syncBoth = async () => {
      await push(A.db, cloud.as(OWNER), { userId: OWNER, isOwner: true });
      await push(B.db, cloud.as(CARE), { userId: CARE, isOwner: false });
      await pull(A.db, cloud.as(OWNER), profile.id);
      await pull(B.db, cloud.as(CARE), profile.id);
    };
    const notes = async () => Promise.all([A, B].map(async (p) => (await one<{ notes: string }>(p.db, 'SELECT notes FROM episodes WHERE id = ?', [ep.id]))!.notes));
    // edit times after the row's real save time (fixed dates turned into the past once the test was a day old)
    const at = (ms: number) => new Date(Date.now() + 86_400_000 + ms).toISOString();

    await edit(B, 'later, from B', at(5_000));
    await edit(A, 'earlier, from A', at(0));
    await syncBoth();
    expect(await notes()).toEqual(['later, from B', 'later, from B']);

    const tie = at(3_600_000);
    await edit(A, 'tie, from A', tie);
    await edit(B, 'tie, from B', tie);
    await syncBoth();
    expect(await notes()).toEqual(['tie, from B', 'tie, from B']); // 'device-b' > 'device-a'
  });

  test('push: 200 at a time in outbox order; a failed upload keeps everything queued and counts the attempt', async () => {
    await B.write(async (w) => {
      for (let i = 0; i < 450; i++) {
        await w.insert('notes', { child_id: profile.id, noted_at: '2026-09-30T12:00:00.000Z', text: `note ${i}`, source: 'manual', audio_path: null, structured_status: null });
      }
    });
    expect(await outboxCount(B.db)).toBe(450);
    cloud.failures = 1;
    const failed = await push(B.db, cloud.as(CARE), { userId: CARE, isOwner: false });
    expect(failed.error?.code).toBe('network');
    expect(failed.attempts).toBe(1);
    expect(await outboxCount(B.db)).toBe(450);

    const before = cloud.calls.length;
    const ok = await push(B.db, cloud.as(CARE), { userId: CARE, isOwner: false });
    expect(ok).toMatchObject({ sent: 450, error: null });
    expect(cloud.calls.slice(before).map((c) => c.rows)).toEqual([PUSH_BATCH, PUSH_BATCH, 50]);
    expect(await outboxCount(B.db)).toBe(0);
  });

  test('a teacher sees only what teachers may; a row the role may not write is dropped and noted, the rest upload', async () => {
    const inv = await cloud.as(OWNER).call<{ code: string }>('invite-create', { child_id: profile.id, role: 'teacher' });
    const T = await phone('device-t', TEACHER);
    const r = await joinCareTeam(T.db, cloud.as(TEACHER), TEACHER, inv.data!.code, { receiveAlerts: true, childDevice: false });
    expect(r).toMatchObject({ role: 'teacher' });
    for (const t of ['medications', 'med_doses', 'medication_changes', 'sleep_entries', 'illness_logs', 'places', 'place_visits', 'alerts', 'alert_responses', 'day_closures']) {
      expect([t, (await all(T.db, `SELECT id FROM ${t}`)).length]).toEqual([t, 0]);
    }
    const eps = await all<{ place_type: string | null; created_by: string }>(T.db, 'SELECT place_type, created_by FROM episodes');
    expect(eps.every((e) => e.place_type === 'school' || e.created_by === TEACHER)).toBe(true);
    expect((await getAllSettings(T.db)).receive_alerts).toBe(false); // teachers get no heads-ups

    await T.write(async (w) => {
      await w.insert('medications', { child_id: profile.id, name: 'Not allowed', rxcui: null, strength: null, form: null, schedule: '{"times":[],"days":[]}',
        as_needed: 1, reminders_enabled: 0, active_from: '2026-09-30', active_to: null, notes: null });
      await w.insert('episodes', { child_id: profile.id, started_at: '2026-09-30T15:00:00.000Z', duration_min: 5, type: 'shutdown', intensity: 2, place_id: null,
        place_type: 'school', antecedent_tags: '[]', antecedent_note: null, behavior_tags: '[]', safety_concern: 0, notes: null, details_complete: 1, source: 'manual' });
    });
    const res = await push(T.db, cloud.as(TEACHER), { userId: TEACHER, isOwner: false });
    expect(res).toMatchObject({ error: null, sent: 1, dropped: 1 });
    expect(cloud.rows('medications').some((m) => m.name === 'Not allowed')).toBe(false);
    expect(cloud.rows('episodes').some((e) => e.created_by === TEACHER)).toBe(true);
    expect((await all<{ area: string }>(T.db, 'SELECT area FROM app_errors')).map((e) => e.area)).toContain('sync.push');
  });

  test('the same day closed on two phones ends up as one end-of-day check on both', async () => {
    const close = (p: Repo, at: string) => p.write(async (w) => {
      const id = await w.insert('day_closures', { child_id: profile.id, local_date: '2026-10-02', all_logged: 1, closed_at: at });
      await w.ex.execute('UPDATE day_closures SET updated_at = ? WHERE id = ?', [at, id]);
    });
    await close(A, '2026-10-03T01:00:00.000Z');
    await close(B, '2026-10-03T02:00:00.000Z');
    await push(A.db, cloud.as(OWNER), { userId: OWNER, isOwner: true });
    await push(B.db, cloud.as(CARE), { userId: CARE, isOwner: false });
    await pull(A.db, cloud.as(OWNER), profile.id);
    await pull(B.db, cloud.as(CARE), profile.id);
    const rows = await Promise.all([A, B].map((p) => all<{ id: string; closed_at: string }>(p.db, "SELECT id, closed_at FROM day_closures WHERE local_date = '2026-10-02'")));
    expect(rows[0]).toHaveLength(1);
    expect(rows[1]).toEqual(rows[0]);
    expect(rows[0][0].closed_at).toBe('2026-10-03T02:00:00.000Z');
  });

  test('"How did it go?" answered on one phone cancels the question on the other phone', async () => {
    const alertId = await A.write((w) => w.insert('alerts', { child_id: profile.id, block_start: '2026-09-30T20:00:00.000Z', prediction_id: null,
      scheduled_for: '2026-09-30T19:30:00.000Z', notification_id: 'risk-x', confirm_notification_id: 'confirm-x', status: 'scheduled' }));
    await push(A.db, cloud.as(OWNER), { userId: OWNER, isOwner: true });
    await pull(B.db, cloud.as(CARE), profile.id);
    expect(await one(B.db, 'SELECT notification_id FROM alerts WHERE id = ?', [alertId])).toEqual({ notification_id: null }); // A's ids stay on A
    await B.write((w) => w.insert('alert_responses', { alert_id: alertId, response: 'calm', responded_at: '2026-09-30T22:30:00.000Z' }));
    await push(B.db, cloud.as(CARE), { userId: CARE, isOwner: false });
    const pulled = await pull(A.db, cloud.as(OWNER), profile.id);
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockClear();
    expect(await afterPullAlerts(A.db, pulled.ids.alert_responses ?? [])).toBe(1);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('confirm-x');
    expect(await one(A.db, 'SELECT confirm_notification_id FROM alerts WHERE id = ?', [alertId])).toEqual({ confirm_notification_id: null });
  });

  test('the forecasting phone shares one insight snapshot a day and today\'s school-hours levels (no reasons)', async () => {
    const snap = (await readSnapshot(A.db, profile.id))!;
    const settings = { ...(await getAllSettings(A.db)), care_team_enabled: true, primary_forecaster: true, care_team_pushed: true };
    const api = cloud.as(OWNER);
    const first = await shareAfterForecast(A, profile, settings, snap, NOW, api, null);
    expect(first.snapshot).toBe(true);
    const row = cloud.rows('insight_snapshots')[0];
    expect(row).toMatchObject({ child_id: profile.id });
    expect(JSON.stringify(row)).not.toMatch(/"reasons"/);
    expect((row.model_health as { health: unknown }).health).toBeTruthy();
    const today = localDateOf(NOW, TZ);
    expect((await shareAfterForecast(A, profile, settings, snap, NOW, api, today)).snapshot).toBe(false); // once a day
    const school = schoolBlocks(profile, snap, NOW);
    if (school.blocks.length) {
      expect(cloud.rows('school_forecasts')[0]).toMatchObject({ child_id: profile.id, local_date: today });
      expect(Object.keys(school.blocks[0]).sort()).toEqual(['end', 'level', 'start']);
    }
    // other phones never upload
    expect(await shareAfterForecast(B, profile, { ...settings, primary_forecaster: false }, snap, NOW, cloud.as(CARE), null)).toEqual({ snapshot: false, school: false });
  });

  test('share links: a School snapshot passes the privacy check; create, list, revoke; tokens never go in a backup', async () => {
    const facts = {
      medications: (await all<{ name: string }>(A.db, 'SELECT name FROM medications')).map((m) => m.name),
      placesOutsideSchool: (await all<{ label: string }>(A.db, "SELECT label FROM places WHERE type <> 'school'")).map((p) => p.label),
    };
    const o = { from: '2026-09-01', to: '2026-09-30', audience: 'school' as const, days: 7 as const, noteIds: [], lang: 'en' as const, now: NOW };
    expect(findSchoolLeaks(JSON.stringify(await shareSnapshot(A.db, profile, o)), facts)).toEqual([]);

    const made = await createShareLink(A.db, cloud.as(OWNER), profile, o);
    if ('error' in made) throw new Error(made.error.code);
    expect(made.url).toMatch(/\/share\/tok0x+$/);
    const list = await listShareLinks(A.db, cloud.as(OWNER), profile.id, NOW);
    expect(list).toEqual([expect.objectContaining({ id: made.id, url: made.url, active: true, audience: 'school' })]);
    expect(JSON.stringify(await exportAll(A.db))).not.toContain('tok0');
    expect(await listShareLinks(B.db, cloud.as(CARE), profile.id, NOW)).toEqual([]); // only the owner sees links
    expect(await revokeShareLink(A.db, cloud.as(OWNER), made.id)).toBeNull();
    expect(await listShareLinks(A.db, cloud.as(OWNER), profile.id, NOW)).toEqual([expect.objectContaining({ active: false, url: null })]);
  });

  test('deleting a hard moment from the Timeline also deletes (and syncs) its "what helped" entries; undo restores them', async () => {
    const [ep] = await all<{ id: string; started_at: string }>(A.db,
      `SELECT e.id, e.started_at FROM episodes e WHERE e.deleted_at IS NULL AND EXISTS (SELECT 1 FROM strategy_uses u WHERE u.episode_id = e.id AND u.deleted_at IS NULL) LIMIT 1`);
    const uses = await all<{ id: string }>(A.db, 'SELECT id FROM strategy_uses WHERE episode_id = ? AND deleted_at IS NULL', [ep.id]);
    await A.db.execute('DELETE FROM outbox');
    const item = { kind: 'episode' as const, id: ep.id, at: ep.started_at } as unknown as Parameters<typeof deleteItem>[2];
    await deleteItem(A, profile.id, item);
    const queued = await all<{ table_name: string; row_id: string }>(A.db, 'SELECT table_name, row_id FROM outbox');
    expect(queued.filter((q) => q.table_name === 'strategy_uses').map((q) => q.row_id).sort()).toEqual(uses.map((u) => u.id).sort());
    await push(A.db, cloud.as(OWNER), { userId: OWNER, isOwner: true });
    expect(uses.every((u) => cloud.tables.get('strategy_uses')!.get(u.id)!.deleted_at != null)).toBe(true);
    await restoreItem(A, profile.id, item);
    expect(await all(A.db, 'SELECT id FROM strategy_uses WHERE episode_id = ? AND deleted_at IS NULL', [ep.id])).toHaveLength(uses.length);
    await push(A.db, cloud.as(OWNER), { userId: OWNER, isOwner: true });
    expect(uses.every((u) => cloud.tables.get('strategy_uses')!.get(u.id)!.deleted_at == null)).toBe(true);
  });

  test('removed from the team: the phone finds out at its next sync', async () => {
    expect((await refreshTeam(B.db, cloud.as(CARE), profile.id, CARE)).me).toBe('active');
    expect((await all(B.db, 'SELECT user_id FROM team_members')).length).toBeGreaterThanOrEqual(3);
    const res = await cloud.as(CARE).call('member-remove', { child_id: profile.id, user_id: CARE });
    expect(res.error?.code).toBe('not_owner'); // a caregiver can't remove anyone
    await cloud.as(OWNER).call('member-remove', { child_id: profile.id, user_id: CARE });
    expect((await refreshTeam(B.db, cloud.as(CARE), profile.id, CARE)).me).toBe('removed');
    expect((await pull(B.db, cloud.as(CARE), profile.id)).applied).toEqual({});
  });
});

describe('the sync engine', () => {
  afterEach(() => setCloudApiForTests(null));
  // settings changes schedule a forecast (forecast/index.ts); let it finish before the test environment closes
  afterAll(async () => { await new Promise((r) => setTimeout(r, 700)); await forecastIdle(); });

  test('demo mode never syncs', async () => {
    const fake = new FakeCloud();
    setCloudApiForTests(fake.as(OWNER));
    await useSession.getState().useRepoForTests(A);
    useSession.setState({ isDemo: true });
    await syncNow();
    await syncIdle();
    expect(fake.calls).toHaveLength(0);
    expect(useSyncStatus.getState().state).toBe('off');
    useSession.setState({ isDemo: false });
  });

  test('a full sync: push, pull, team; the removed phone deletes its copy and says so (DECISIONS #118)', async () => {
    setCloudApiForTests(cloud.as(OWNER));
    await setSettings(A.db, { account_user_id: OWNER, care_team_enabled: true, member_role: 'owner', care_team_pushed: true, onboarding_complete: true });
    await useSession.getState().useRepoForTests(A);
    await syncNow();
    await syncIdle();
    expect(useSyncStatus.getState()).toMatchObject({ state: 'idle', pending: 0 });

    await setSettings(B.db, { account_user_id: CARE, onboarding_complete: true });
    setCloudApiForTests(cloud.as(CARE));
    await useSession.getState().useRepoForTests(B);
    await syncNow();
    await syncIdle();
    expect(useSyncStatus.getState().state).toBe('removed');
    // the caregiver's copy is gone without asking: database files and keys deleted, back to Welcome, signed out
    expect(deleteDatabaseFile).toHaveBeenCalledWith('emolens.db', 'key');
    expect(deleteKeys).toHaveBeenCalled();
    const s = useSession.getState();
    expect(s).toMatchObject({ status: 'onboarding', child: null, profile: null, removedNotice: { name: profile.nickname } });
    expect(await getAllSettings(s.repo!.db)).toMatchObject({ removed_from_team: false, account_user_id: null, care_team_enabled: false, member_role: null });
    // only the child's nickname stays on the phone, for the message, until OK
    expect([...keychain.entries()]).toEqual([['emolens.removed.notice', JSON.stringify({ name: profile.nickname })]]);
    await s.dismissRemovedNotice();
    expect(useSession.getState().removedNotice).toBeNull();
    expect(keychain.size).toBe(0);
  });
});
