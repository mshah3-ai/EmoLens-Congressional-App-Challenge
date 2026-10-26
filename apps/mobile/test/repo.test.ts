/**
 * @jest-environment node
 * Repository tests (SPEC 30.2): writes set updated_at, enqueue outbox rows only when Care Team is on,
 * and mark the right time blocks dirty. Also the medication dose rules (SPEC 10.3).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MIGRATIONS } from '../src/db/migrations';
import { migrate } from '../src/db/migrate';
import { createChild, getChild, toChildProfile, updateChild } from '../src/db/repo/children';
import { logEpisode, mostUsedType, type EpisodeInput } from '../src/db/repo/episodes';
import { addMedication, dueDoses, ensureDoseRows, markDoseTaken, markMissedDoses } from '../src/db/repo/meds';
import { autoFoodTags, checkIn, addPlace, listPlaces, logMeal, recentFoods, currentVisit } from '../src/db/repo/logs';
import { getAllSettings, setSetting } from '../src/db/repo/settings';
import { deleteItem, restoreItem, searchTimeline, timelineForDay } from '../src/db/repo/timeline';
import { iso } from '../src/db/time';
import type { Repo } from '../src/db/repo/writer';
import type { DoseRow } from '../src/db/rows';
import { nodeDb, testRepo } from './nodeDb';

const TZ = 'America/Chicago';
const H = 3_600_000;

async function setup(): Promise<{ repo: Repo; childId: string }> {
  const repo = await testRepo();
  const childId = await createChild(repo, {
    nickname: 'Sam', birthYear: 2017, homeTz: TZ, communication: 'speaking', wakeStart: '07:00', wakeEnd: '21:00',
    typicalSleepHours: 10, episodesPerWeekEstimate: 3, modeledEpisodeTypes: ['meltdown', 'shutdown'],
  });
  return { repo, childId };
}

const episode = (startedAt: string, extra: Partial<EpisodeInput> = {}): EpisodeInput => ({
  type: 'meltdown', startedAt, durationMin: null, intensity: null, placeId: null, placeType: null, antecedentTags: [],
  antecedentNote: null, behaviorTags: [], safetyConcern: false, notes: null, detailsComplete: false, source: 'manual', strategies: [], ...extra,
});

async function addBlocks(repo: Repo, childId: string, startsMs: number[]) {
  for (const s of startsMs) {
    await repo.db.execute('INSERT INTO blocks (child_id, block_start, block_end, local_date, block_index, dirty) VALUES (?, ?, ?, ?, ?, 0)',
      [childId, iso(s), iso(s + 2 * H), '2026-09-28', 0]);
  }
}

describe('migrations', () => {
  test('generated migrations module matches the .sql files', () => {
    const dir = join(__dirname, '../src/db/migrations');
    const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    expect(MIGRATIONS.map((m) => m.name)).toEqual(files);
    for (const m of MIGRATIONS) expect(m.sql).toBe(readFileSync(join(dir, m.name), 'utf8'));
  });

  test('apply once, then skip on the next run', async () => {
    const db = nodeDb();
    expect(await migrate(db)).toEqual([1, 2, 3, 4, 5]);
    expect(await migrate(db)).toEqual([]);
    const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['children', 'episodes', 'outbox', 'blocks', 'schema_migrations']));
  });

  test('a failing migration rolls back completely', async () => {
    const db = nodeDb();
    await expect(migrate(db, [{ version: 1, name: '001_bad.sql', sql: 'CREATE TABLE a (x INTEGER); CREATE TABLE broken (' }])).rejects.toThrow();
    const tables = (await db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map((r) => r.name);
    expect(tables).not.toContain('a');
  });
});

describe('syncable writes', () => {
  test('insert fills the standard columns; update bumps updated_at', async () => {
    const { repo, childId } = await setup();
    const row = await getChild(repo.db);
    expect(row?.id).toBe(childId);
    const raw = (await repo.db.execute('SELECT * FROM children')).rows[0];
    expect(raw.created_by).toBe('local');
    expect(raw.device_id).toBe('test-device');
    expect(String(raw.id)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/); // uuidv7
    const before = String(raw.updated_at);
    await new Promise((r) => setTimeout(r, 5));
    await updateChild(repo, childId, { nickname: 'Sammy' });
    const after = (await repo.db.execute('SELECT updated_at, nickname FROM children')).rows[0];
    expect(after.nickname).toBe('Sammy');
    expect(String(after.updated_at) > before).toBe(true);
  });

  test('outbox gets rows only when Care Team is on, and never place coordinates', async () => {
    const { repo, childId } = await setup();
    const child = toChildProfile((await getChild(repo.db))!);
    await logEpisode(repo, child, episode('2026-09-28T19:05:00.000Z'));
    expect((await repo.db.execute('SELECT * FROM outbox')).rows).toHaveLength(0);

    await setSetting(repo.db, 'care_team_enabled', true);
    const id = await logEpisode(repo, child, episode('2026-09-28T20:05:00.000Z'));
    await addPlace(repo, childId, { label: 'Home', type: 'home' });
    const outbox = (await repo.db.execute('SELECT * FROM outbox ORDER BY seq')).rows;
    expect(outbox.map((r) => [r.table_name, r.op])).toEqual([['episodes', 'upsert'], ['places_public', 'upsert']]);
    expect(outbox[0].row_id).toBe(id);
    expect(JSON.parse(String(outbox[1].payload_json))).not.toHaveProperty('latitude');
  });

  test('an episode marks blocks within ±24 h dirty, and only those', async () => {
    const { repo } = await setup();
    const child = toChildProfile((await getChild(repo.db))!);
    const t = Date.parse('2026-09-28T19:00:00.000Z');
    await addBlocks(repo, child.id, [t - 30 * H, t - 20 * H, t, t + 20 * H, t + 30 * H]);
    await logEpisode(repo, child, episode(iso(t)));
    const dirty = (await repo.db.execute('SELECT block_start, dirty FROM blocks ORDER BY block_start')).rows.map((r) => r.dirty);
    expect(dirty).toEqual([0, 1, 1, 1, 0]);
  });

  test('changing the wake window marks every block dirty', async () => {
    const { repo, childId } = await setup();
    const t = Date.parse('2026-09-28T19:00:00.000Z');
    await addBlocks(repo, childId, [t - 900 * H, t, t + 900 * H]);
    await updateChild(repo, childId, { wakeStart: '06:30' });
    const dirty = (await repo.db.execute('SELECT dirty FROM blocks')).rows.map((r) => r.dirty);
    expect(dirty).toEqual([1, 1, 1]);
  });

  test('a medication change marks the next 21 days dirty', async () => {
    const { repo, childId } = await setup();
    const now = Date.now();
    await addBlocks(repo, childId, [now - 2 * H, now + 20 * 24 * H, now + 22 * 24 * H]);
    await addMedication(repo, childId, { name: 'Melatonin', strength: '1 mg', form: null, schedule: { times: ['19:30'], days: [1, 2, 3, 4, 5, 6, 7] },
      asNeeded: false, remindersEnabled: true, activeFrom: '2026-01-01', notes: null });
    const dirty = (await repo.db.execute('SELECT dirty FROM blocks ORDER BY block_start')).rows.map((r) => r.dirty);
    expect(dirty).toEqual([0, 1, 0]);
    const changes = (await repo.db.execute('SELECT change_type FROM medication_changes')).rows.map((r) => r.change_type);
    expect(changes).toEqual(['start']);
  });
});

describe('episodes', () => {
  test('most-used type drives the fast path preselection', async () => {
    const { repo } = await setup();
    const child = toChildProfile((await getChild(repo.db))!);
    expect(await mostUsedType(repo.db, child)).toBe('meltdown'); // first tracked type before any logs
    await logEpisode(repo, child, episode('2026-09-28T19:05:00.000Z', { type: 'shutdown' }));
    await logEpisode(repo, child, episode('2026-09-28T20:05:00.000Z', { type: 'shutdown' }));
    await logEpisode(repo, child, episode('2026-09-28T21:05:00.000Z'));
    expect(await mostUsedType(repo.db, child)).toBe('shutdown');
  });

  test('an unanswered alert for the same block is answered "happened" automatically', async () => {
    const { repo } = await setup();
    const child = toChildProfile((await getChild(repo.db))!);
    // 14:00-16:00 Chicago (CDT, UTC-5) = 19:00-21:00 UTC
    await repo.write((w) => w.insert('alerts', { child_id: child.id, block_start: '2026-09-28T19:00:00.000Z', prediction_id: null,
      scheduled_for: '2026-09-28T18:30:00.000Z', notification_id: null, confirm_notification_id: null, status: 'delivered' }));
    await logEpisode(repo, child, episode('2026-09-28T20:10:00.000Z'));
    const r = (await repo.db.execute('SELECT response FROM alert_responses')).rows;
    expect(r.map((x) => x.response)).toEqual(['happened']);
  });

  test('"what helped" is saved as during-context strategy uses', async () => {
    const { repo, childId } = await setup();
    const child = toChildProfile((await getChild(repo.db))!);
    const sid = String((await repo.db.execute('SELECT id FROM strategies LIMIT 1')).rows[0]?.id ?? '');
    expect(sid).toBe(''); // createChild alone seeds no strategies
    const s = await repo.write((w) => w.insert('strategies', { child_id: childId, name: 'Quiet space', category: 'environment', is_default: 1, active: 1, onboarding_favorite: 0 }));
    const eid = await logEpisode(repo, child, episode('2026-09-28T20:10:00.000Z', { strategies: [{ strategyId: s, outcome: 'helped' }] }));
    const uses = (await repo.db.execute('SELECT * FROM strategy_uses')).rows;
    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatchObject({ context: 'during', outcome: 'helped', episode_id: eid });
  });
});

describe('medication doses (SPEC 10.3)', () => {
  test('generates pending rows for scheduled times, classifies taken/late, and auto-marks missed', async () => {
    const { repo, childId } = await setup();
    const child = toChildProfile((await getChild(repo.db))!);
    await addMedication(repo, childId, { name: 'Guanfacine', strength: '1 mg', form: 'tablet', schedule: { times: ['08:00', '20:00'], days: [1, 2, 3, 4, 5, 6, 7] },
      asNeeded: false, remindersEnabled: true, activeFrom: '2026-09-27', notes: null });
    const now = Date.parse('2026-09-28T13:30:00.000Z'); // 08:30 in Chicago
    expect(await ensureDoseRows(repo, child, now)).toBe(4); // Sep 27 + 28, two times each
    expect(await ensureDoseRows(repo, child, now)).toBe(0); // idempotent

    const due = await dueDoses(repo.db, childId, now);
    expect(due.map((d) => d.scheduled_for)).toEqual(['2026-09-28T13:00:00.000Z']);
    await markDoseTaken(repo, childId, due[0] as DoseRow, '2026-09-28T13:30:00.000Z');

    // The Sep 27 doses are long past: both missed.
    expect(await markMissedDoses(repo, childId, now)).toBe(2);
    const statuses = (await repo.db.execute('SELECT scheduled_for, status FROM med_doses ORDER BY scheduled_for')).rows.map((r) => r.status);
    expect(statuses).toEqual(['missed', 'missed', 'taken', 'pending']);

    const evening = (await repo.db.execute("SELECT * FROM med_doses WHERE status = 'pending'")).rows[0] as unknown as DoseRow;
    await markDoseTaken(repo, childId, evening, '2026-09-29T02:30:00.000Z'); // 21:30 local, 90 min late
    expect((await repo.db.execute('SELECT status FROM med_doses WHERE id = ?', [evening.id])).rows[0].status).toBe('late');
  });
});

describe('meals, places, timeline', () => {
  test('automatic food tags', () => {
    expect(autoFoodTags('Iced tea')).toEqual(['caffeine']);
    expect(autoFoodTags('Steak')).toEqual([]);
    expect(autoFoodTags('Candy with Red 40')).toEqual(['artificial_color']);
    expect(autoFoodTags('Café con leche')).toEqual(['caffeine']);
  });

  test('new_food only the first time; recent foods ranked by count', async () => {
    const { repo, childId } = await setup();
    await logMeal(repo, childId, { eatenAt: '2026-09-28T12:00:00.000Z', mealType: 'lunch', items: [{ name: 'Pasta' }, { name: 'Apple' }], amount: 'most', notes: null });
    await logMeal(repo, childId, { eatenAt: '2026-09-28T17:00:00.000Z', mealType: 'dinner', items: [{ name: 'pasta ' }], amount: 'all', notes: null });
    const items = (await repo.db.execute('SELECT items FROM meals ORDER BY eaten_at')).rows.map((r) => JSON.parse(String(r.items)));
    expect(items[0][0].tags).toContain('new_food');
    expect(items[1][0].tags).not.toContain('new_food');
    expect((await recentFoods(repo.db, childId)).map((f) => f.name)).toEqual(['pasta', 'Apple']); // newest spelling wins
  });

  test('check-in closes the open visit', async () => {
    const { repo, childId } = await setup();
    await addPlace(repo, childId, { label: 'Home', type: 'home' });
    await addPlace(repo, childId, { label: 'Lincoln Elementary', type: 'school' });
    const [home, school] = await listPlaces(repo.db, childId);
    expect(home.type).toBe('home');
    await checkIn(repo, childId, home, '2026-09-28T12:00:00.000Z');
    await checkIn(repo, childId, school, '2026-09-28T13:00:00.000Z');
    const visits = (await repo.db.execute('SELECT place_type, departed_at FROM place_visits ORDER BY arrived_at')).rows;
    expect(visits).toEqual([{ place_type: 'home', departed_at: '2026-09-28T13:00:00.000Z' }, { place_type: 'school', departed_at: null }]);
    expect((await currentVisit(repo.db, childId))?.place_label).toBe('Lincoln Elementary');
    await checkIn(repo, childId, null, '2026-09-28T14:00:00.000Z');
    expect((await currentVisit(repo.db, childId))?.place_type).toBe('away_untagged');
  });

  test('timeline lists the day newest first; delete + undo; search', async () => {
    const { repo, childId } = await setup();
    const child = toChildProfile((await getChild(repo.db))!);
    await logEpisode(repo, child, episode('2026-09-28T19:05:00.000Z', { notes: 'After the fire drill' }));
    await logMeal(repo, childId, { eatenAt: '2026-09-28T17:00:00.000Z', mealType: 'lunch', items: [{ name: 'Chicken nuggets' }], amount: 'all', notes: null });
    await logMeal(repo, childId, { eatenAt: '2026-09-27T17:00:00.000Z', mealType: 'lunch', items: [{ name: 'Yesterday soup' }], amount: 'all', notes: null });
    const day = await timelineForDay(repo.db, childId, '2026-09-28T05:00:00.000Z', '2026-09-29T05:00:00.000Z', '2026-09-28');
    expect(day.map((i) => i.kind)).toEqual(['episode', 'meal']);

    await deleteItem(repo, childId, day[0]);
    expect((await timelineForDay(repo.db, childId, '2026-09-28T05:00:00.000Z', '2026-09-29T05:00:00.000Z', '2026-09-28')).map((i) => i.kind)).toEqual(['meal']);
    await restoreItem(repo, childId, day[0]);
    expect(await timelineForDay(repo.db, childId, '2026-09-28T05:00:00.000Z', '2026-09-29T05:00:00.000Z', '2026-09-28')).toHaveLength(2);

    expect((await searchTimeline(repo.db, childId, 'fire drill')).map((i) => i.kind)).toEqual(['episode']);
    expect((await searchTimeline(repo.db, childId, 'NUGGET')).map((i) => i.kind)).toEqual(['meal']);
    expect(await searchTimeline(repo.db, childId, '%')).toEqual([]);
  });

  test('settings fall back to spec defaults', async () => {
    const { repo } = await setup();
    const s = await getAllSettings(repo.db);
    expect(s.max_alerts_per_day).toBe(3);
    expect(s.quiet_hours).toEqual({ start: '21:00', end: '07:00' });
    await setSetting(repo.db, 'alert_sensitivity', 'more');
    expect((await getAllSettings(repo.db)).alert_sensitivity).toBe('more');
  });
});
