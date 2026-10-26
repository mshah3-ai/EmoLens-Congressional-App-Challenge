/**
 * SPEC 32 Phase 7 acceptance, "two devices sync", automated against the REAL local Supabase: three phones (three
 * SQLite databases with the app's own migrations and the app's own sync code from apps/mobile/src/sync) and real
 * accounts signed in with emailed codes. Plain Node (the app's Jest setup replaces the network functions).
 */
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Repo, type Writer } from '../../../apps/mobile/src/db/repo/writer';
import { getAllSettings, setSettings } from '../../../apps/mobile/src/db/repo/settings';
import { all, one } from '../../../apps/mobile/src/db/types';
import { supabaseApi } from '../../../apps/mobile/src/cloud/supabaseApi';
import { initialPush, joinCareTeam, turnOnCareTeam } from '../../../apps/mobile/src/sync/enable';
import { push } from '../../../apps/mobile/src/sync/push';
import { pull } from '../../../apps/mobile/src/sync/pull';
import { refreshTeam } from '../../../apps/mobile/src/sync/team';
import { SYNC_SPECS } from '../../../apps/mobile/src/sync/tables';
import { testRepo } from '../../../apps/mobile/test/nodeDb';
import { call, email, signIn } from './local';

type Person = Awaited<ReturnType<typeof signIn>>;
const phone = async (deviceId: string, createdBy: string) => { const r = await testRepo(); return new Repo(r.db, { deviceId, createdBy }); };
const api = (p: Person) => supabaseApi(p.sb);

/** One row in every synced table, the way the app writes them (Writer: standard columns, outbox, dirty blocks). */
async function family(w: Writer): Promise<string> {
  const child = await w.insert('children', { nickname: 'Sam', birth_year: 2017, home_tz: 'America/Chicago', communication: 'some_words', wake_start: '06:30',
    wake_end: '21:00', typical_sleep_hours: 10, episodes_per_week_estimate: 3, modeled_episode_types: '["meltdown","shutdown","other"]',
    min_modeled_intensity: 1, school_days: '[1,2,3,4,5]' });
  const home = await w.insert('places', { child_id: child, label: 'Home', type: 'home', latitude: 41.88, longitude: -87.63, radius_m: 150, geofence_enabled: 1 });
  const strategy = await w.insert('strategies', { child_id: child, name: 'Quiet space', category: 'environment', is_default: 1, active: 1, onboarding_favorite: 1 });
  const ep = await w.insert('episodes', { child_id: child, started_at: '2026-09-28T20:00:00.000Z', duration_min: 15, type: 'meltdown', intensity: 4,
    place_id: home, place_type: 'home', antecedent_tags: '["transition"]', antecedent_note: null, behavior_tags: '["crying"]', safety_concern: 0,
    notes: null, details_complete: 1, source: 'manual' });
  await w.insert('strategy_uses', { child_id: child, strategy_id: strategy, context: 'during', episode_id: ep, alert_id: null, outcome: 'helped', used_at: '2026-09-28T20:05:00.000Z' });
  const med = await w.insert('medications', { child_id: child, name: 'Medication A', rxcui: null, strength: '5 mg', form: 'tablet',
    schedule: '{"times":["08:00"],"days":[1,2,3,4,5,6,7]}', as_needed: 0, reminders_enabled: 1, active_from: '2026-09-01', active_to: null, notes: null });
  await w.insert('medication_changes', { medication_id: med, changed_at: '2026-09-01T13:00:00.000Z', change_type: 'start', old_value: null, new_value: '5 mg' });
  await w.insert('med_doses', { medication_id: med, scheduled_for: '2026-09-28T13:00:00.000Z', taken_at: '2026-09-28T13:05:00.000Z', status: 'taken', dose_text: '5 mg' });
  await w.insert('meals', { child_id: child, eaten_at: '2026-09-28T17:00:00.000Z', meal_type: 'lunch', items: '[{"name":"apple","source":"custom","code":null,"tags":[]}]', amount: 'most', notes: null });
  await w.insert('sleep_entries', { child_id: child, sleep_start: '2026-09-28T02:00:00.000Z', sleep_end: '2026-09-28T12:00:00.000Z', duration_min: 560, quality: 3, night_wakings: 1, source: 'manual', external_id: null });
  await w.insert('illness_logs', { child_id: child, started_at: '2026-09-27T12:00:00.000Z', ended_at: null, kind: 'cold', severity: 1, notes: null });
  await w.insert('routine_changes', { child_id: child, local_date: '2026-09-28', start_at: null, description: 'Substitute teacher', severity: 2 });
  await w.insert('place_visits', { child_id: child, place_id: home, place_type: 'home', arrived_at: '2026-09-28T21:00:00.000Z', departed_at: null, source: 'manual' });
  await w.insert('notes', { child_id: child, noted_at: '2026-09-28T23:00:00.000Z', text: 'Calm evening.', source: 'manual', audio_path: '/private/voice.m4a', structured_status: null });
  const alert = await w.insert('alerts', { child_id: child, block_start: '2026-09-28T20:00:00.000Z', prediction_id: null, scheduled_for: '2026-09-28T19:30:00.000Z',
    notification_id: 'risk-local', confirm_notification_id: 'confirm-local', status: 'delivered' });
  await w.insert('alert_responses', { alert_id: alert, response: 'happened', responded_at: '2026-09-28T22:30:00.000Z' });
  await w.insert('day_closures', { child_id: child, local_date: '2026-09-28', all_logged: 1, closed_at: '2026-09-29T02:00:00.000Z' });
  return child;
}

describe('two phones and a teacher, through the local Supabase', () => {
  let owner: Person, helper: Person, teacher: Person;
  let A: Repo, B: Repo;
  let childId: string;

  before(async () => {
    [owner, helper, teacher] = await Promise.all([signIn(email('phone-owner')), signIn(email('phone-helper')), signIn(email('phone-teacher'))]);
    A = await phone('device-a', 'local');
    childId = await A.write(family);
    await turnOnCareTeam(A.db, owner.userId);
    A.env.createdBy = owner.userId;
    assert.equal(await initialPush(A.db, api(owner), owner.userId), null);
    await setSettings(A.db, { care_team_pushed: true });
  });

  test('a caregiver joins: phone B gets every synced table; coordinates, notification ids and audio paths stay on A', async () => {
    const inv = await call(owner.sb, 'invite-create', { child_id: childId, role: 'caregiver' });
    B = await phone('device-b', helper.userId);
    const r = await joinCareTeam(B.db, api(helper), helper.userId, String(inv.body.code), { receiveAlerts: true, childDevice: false });
    assert.deepEqual(r, { childId, role: 'caregiver', nickname: 'Sam' });
    for (const spec of SYNC_SPECS) {
      const [na, nb] = await Promise.all([A, B].map(async (p) => (await all(p.db, `SELECT id FROM ${spec.local}`)).length));
      assert.deepEqual([spec.local, nb], [spec.local, na]);
      assert.ok(na > 0, spec.local);
    }
    assert.deepEqual(await one(B.db, 'SELECT latitude, longitude FROM places'), { latitude: null, longitude: null });
    assert.deepEqual(await one(B.db, 'SELECT notification_id FROM alerts'), { notification_id: null });
    assert.deepEqual(await one(B.db, 'SELECT audio_path FROM notes'), { audio_path: null });
    const { data } = await owner.sb.from('places_public').select('*');
    assert.doesNotMatch(JSON.stringify(data), /41\.88|latitude/);
    assert.equal((await getAllSettings(B.db)).member_role, 'caregiver');
  });

  test('a hard moment logged on B reaches A; both edit it: the later edit wins on both phones and in the cloud', async () => {
    const id = await B.write((w) => w.insert('episodes', { child_id: childId, started_at: '2026-09-29T20:00:00.000Z', duration_min: 10, type: 'shutdown',
      intensity: 3, place_id: null, place_type: 'school', antecedent_tags: '[]', antecedent_note: null, behavior_tags: '[]', safety_concern: 0,
      notes: 'from phone B', details_complete: 1, source: 'manual' }));
    assert.equal((await push(B.db, api(helper), { userId: helper.userId, isOwner: false })).error, null);
    const pulled = await pull(A.db, api(owner), childId);
    assert.ok(pulled.ids.episodes?.includes(id));
    assert.deepEqual(await one(A.db, 'SELECT notes, created_by FROM episodes WHERE id = ?', [id]), { notes: 'from phone B', created_by: helper.userId });

    await A.write((w) => w.update('episodes', id, { notes: 'edited on A' }));
    await new Promise((r) => setTimeout(r, 20));
    await B.write((w) => w.update('episodes', id, { notes: 'edited later on B' }));
    // A uploads its older edit last: the server keeps B's newer one
    await push(B.db, api(helper), { userId: helper.userId, isOwner: false });
    await push(A.db, api(owner), { userId: owner.userId, isOwner: true });
    await pull(A.db, api(owner), childId);
    await pull(B.db, api(helper), childId);
    for (const p of [A, B]) assert.deepEqual(await one(p.db, 'SELECT notes FROM episodes WHERE id = ?', [id]), { notes: 'edited later on B' });
    const { data } = await owner.sb.from('episodes').select('notes').eq('id', id).single();
    assert.equal(data?.notes, 'edited later on B');
  });

  test('a teacher\'s phone gets no medications, sleep or home places; its school log reaches the owner', async () => {
    const inv = await call(owner.sb, 'invite-create', { child_id: childId, role: 'teacher' });
    const T = await phone('device-t', teacher.userId);
    const r = await joinCareTeam(T.db, api(teacher), teacher.userId, String(inv.body.code), { receiveAlerts: true, childDevice: false });
    assert.equal((r as { role: string }).role, 'teacher');
    for (const table of ['medications', 'medication_changes', 'med_doses', 'sleep_entries', 'illness_logs', 'places', 'place_visits', 'alerts', 'alert_responses', 'day_closures', 'meals', 'notes']) {
      assert.deepEqual([table, (await all(T.db, `SELECT id FROM ${table}`)).length], [table, 0]);
    }
    // the hard moment at school (from B) is visible; the one at home isn't
    assert.deepEqual((await all<{ place_type: string }>(T.db, 'SELECT place_type FROM episodes')).map((e) => e.place_type), ['school']);
    const id = await T.write((w) => w.insert('episodes', { child_id: childId, started_at: '2026-09-30T15:00:00.000Z', duration_min: 5, type: 'shutdown', intensity: 2,
      place_id: null, place_type: 'school', antecedent_tags: '[]', antecedent_note: null, behavior_tags: '[]', safety_concern: 0, notes: null, details_complete: 1, source: 'manual' }));
    const res = await push(T.db, api(teacher), { userId: teacher.userId, isOwner: false });
    assert.equal(res.error, null);
    assert.equal(res.sent, 1);
    await pull(A.db, api(owner), childId);
    assert.ok(await one(A.db, 'SELECT id FROM episodes WHERE id = ?', [id]));
  });

  test('removing the caregiver: phone B finds out at its next sync and can no longer read anything', async () => {
    assert.equal((await call(owner.sb, 'member-remove', { child_id: childId, user_id: helper.userId })).status, 200);
    assert.equal((await refreshTeam(B.db, api(helper), childId, helper.userId)).me, 'removed');
    assert.deepEqual((await pull(B.db, api(helper), childId)).applied, {});
    assert.deepEqual((await helper.sb.from('episodes').select('id')).data, []);
  });
});
