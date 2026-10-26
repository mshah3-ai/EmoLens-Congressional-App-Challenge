--
-- Row-level security tests (SPEC 7.3, 30.3), run with `supabase test db` against the local Supabase.
-- Everything happens inside one transaction that is rolled back at the end, so the database is left untouched.
--
-- The cast: family A has an owner, a caregiver, a teacher, a clinician and a removed ex-member; family B has its own
-- owner; one outsider belongs to no family. Family A has at least one row in every table. Each test "signs in" as one
-- person (the same way Supabase does for a real request: role `authenticated` + a JWT whose `sub` is the user id)
-- and checks what that person can read and write.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- ---------------------------------------------------------------------------------------------------------------
-- test helpers (in their own schema; rolled back with everything else)
-- ---------------------------------------------------------------------------------------------------------------
create schema tests;
grant usage on schema tests to authenticated, anon;

create function tests.login_as(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function tests.login_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('role', 'anon', true);
end $$;

-- Rows of table `t` the current user can see; -1 when the user may not even try (permission denied).
create function tests.visible_rows(t text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from public.%I', t) into n;
  return n;
exception when insufficient_privilege then
  return -1;
end $$;

-- How many rows an UPDATE really changed for the current user (0 = blocked by row-level security or the
-- last-writer-wins guard; RLS hides rows instead of raising an error on UPDATE).
create function tests.changed(sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
end $$;

create function tests.public_tables() returns setof text language sql as $$
  select c.relname::text from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' order by 1;
$$;

grant execute on all functions in schema tests to authenticated, anon;

-- ---------------------------------------------------------------------------------------------------------------
-- fixtures (written as the database owner, which bypasses row-level security)
-- ---------------------------------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'caregiver@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'teacher@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'clinician@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'removed@test.local'),
  ('66666666-6666-6666-6666-666666666666', 'outsider@test.local'),
  ('77777777-7777-7777-7777-777777777777', 'owner2@test.local');

-- children (the trigger makes each creator the owner)
insert into public.children (id, owner_id, nickname, home_tz, episodes_per_week_estimate, created_at, updated_at, created_by, device_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Sam', 'America/Chicago', 7, '2026-09-01T10:00Z', '2026-09-01T10:00Z', '11111111-1111-1111-1111-111111111111', 'dev-o'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '77777777-7777-7777-7777-777777777777', 'Alex', 'America/Chicago', 3, '2026-09-01T10:00Z', '2026-09-01T10:00Z', '77777777-7777-7777-7777-777777777777', 'dev-o2');

insert into public.memberships (child_id, user_id, role, status) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'caregiver', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'teacher', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'clinician', 'active'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'caregiver', 'removed');

insert into public.episodes (id, child_id, started_at, type, place_type, source, created_at, updated_at, created_by, device_id) values
  -- e1: at school, logged by the owner; e2: at home, by the owner; e3: at home, logged by the teacher
  ('e0000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01T15:00Z', 'meltdown', 'school', 'manual', '2026-09-01T10:00Z', '2026-09-01T10:00Z', '11111111-1111-1111-1111-111111111111', 'dev-o'),
  ('e0000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01T23:00Z', 'shutdown', 'home', 'manual', '2026-09-01T10:00Z', '2026-09-01T10:00Z', '11111111-1111-1111-1111-111111111111', 'dev-o'),
  ('e0000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-02T15:00Z', 'meltdown', 'home', 'manual', '2026-09-01T10:00Z', '2026-09-01T10:00Z', '33333333-3333-3333-3333-333333333333', 'dev-t'),
  ('e0000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '2026-09-01T15:00Z', 'meltdown', 'school', 'manual', '2026-09-01T10:00Z', '2026-09-01T10:00Z', '77777777-7777-7777-7777-777777777777', 'dev-o2');

insert into public.strategies (id, child_id, name, category, created_at, updated_at, created_by, device_id) values
  ('50000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Quiet space', 'environment', '2026-09-01T10:00Z', '2026-09-01T10:00Z', '11111111-1111-1111-1111-111111111111', 'dev-o');

insert into public.strategy_uses (id, child_id, strategy_id, context, episode_id, outcome, used_at, created_at, updated_at, created_by, device_id) values
  ('51000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '50000000-0000-0000-0000-000000000001', 'during', 'e0000000-0000-0000-0000-000000000001', 'helped', '2026-09-01T15:05Z', '2026-09-01T10:00Z', '2026-09-01T10:00Z', '11111111-1111-1111-1111-111111111111', 'dev-o'),
  ('51000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '50000000-0000-0000-0000-000000000001', 'during', 'e0000000-0000-0000-0000-000000000002', 'helped', '2026-09-01T23:05Z', '2026-09-01T10:00Z', '2026-09-01T10:00Z', '11111111-1111-1111-1111-111111111111', 'dev-o'),
  ('51000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '50000000-0000-0000-0000-000000000001', 'proactive', null, 'helped', '2026-09-02T14:00Z', '2026-09-01T10:00Z', '2026-09-01T10:00Z', '33333333-3333-3333-3333-333333333333', 'dev-t');

insert into public.notes (id, child_id, noted_at, text, source, created_at, updated_at, created_by, device_id) values
  ('52000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01T12:00Z', 'Parent note', 'manual', '2026-09-01T10:00Z', '2026-09-01T10:00Z', '11111111-1111-1111-1111-111111111111', 'dev-o'),
  ('52000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01T13:00Z', 'Teacher note', 'manual', '2026-09-01T10:00Z', '2026-09-01T10:00Z', '33333333-3333-3333-3333-333333333333', 'dev-t');

insert into public.meals (id, child_id, eaten_at, meal_type, created_at, updated_at, created_by, device_id) values
  ('53000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01T12:00Z', 'dinner', '2026-09-01T10:00Z', '2026-09-01T10:00Z', '11111111-1111-1111-1111-111111111111', 'dev-o'),
  ('53000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01T17:00Z', 'lunch', '2026-09-01T10:00Z', '2026-09-01T10:00Z', '33333333-3333-3333-3333-333333333333', 'dev-t');

insert into public.medications (id, child_id, name, active_from, created_at, updated_at, created_by, device_id) values
  ('54000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Medication A', '2026-08-01', '2026-09-01T10:00Z', '2026-09-01T10:00Z', '11111111-1111-1111-1111-111111111111', 'dev-o'),
  ('54000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Medication B', '2026-08-01', '2026-09-01T10:00Z', '2026-09-01T10:00Z', '77777777-7777-7777-7777-777777777777', 'dev-o2');

insert into public.medication_changes (id, child_id, medication_id, changed_at, change_type, created_at, updated_at, created_by, device_id) values
  ('55000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '54000000-0000-0000-0000-000000000001', '2026-08-01T12:00Z', 'start', '2026-09-01T10:00Z', '2026-09-01T10:00Z', '11111111-1111-1111-1111-111111111111', 'dev-o');

insert into public.med_doses (id, child_id, medication_id, scheduled_for, status, created_at, updated_at, created_by, device_id) values
  ('56000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '54000000-0000-0000-0000-000000000001', '2026-09-01T13:00Z', 'taken', '2026-09-01T10:00Z', '2026-09-01T10:00Z', '11111111-1111-1111-1111-111111111111', 'dev-o');

insert into public.sleep_entries (id, child_id, sleep_start, sleep_end, duration_min, source, created_at, updated_at, created_by, device_id) values
  ('57000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01T02:00Z', '2026-09-01T12:00Z', 580, 'manual', '2026-09-01T10:00Z', '2026-09-01T10:00Z', '11111111-1111-1111-1111-111111111111', 'dev-o');

insert into public.illness_logs (id, child_id, started_at, kind, severity, created_at, updated_at, created_by, device_id) values
  ('58000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01T12:00Z', 'cold', 1, '2026-09-01T10:00Z', '2026-09-01T10:00Z', '11111111-1111-1111-1111-111111111111', 'dev-o');

insert into public.routine_changes (id, child_id, local_date, severity, created_at, updated_at, created_by, device_id) values
  ('59000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01', 2, '2026-09-01T10:00Z', '2026-09-01T10:00Z', '11111111-1111-1111-1111-111111111111', 'dev-o');

insert into public.places_public (id, child_id, label, type, created_at, updated_at) values
  ('5a000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Grandma''s', 'relative', '2026-09-01T10:00Z', '2026-09-01T10:00Z');

insert into public.place_visits (id, child_id, place_id, place_type, arrived_at, source, created_at, updated_at, created_by, device_id) values
  ('5b000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5a000000-0000-0000-0000-000000000001', 'relative', '2026-09-01T18:00Z', 'manual', '2026-09-01T10:00Z', '2026-09-01T10:00Z', '11111111-1111-1111-1111-111111111111', 'dev-o');

insert into public.alerts (id, child_id, block_start, scheduled_for, status, created_at, updated_at, created_by, device_id) values
  ('5c000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01T20:00Z', '2026-09-01T19:30Z', 'delivered', '2026-09-01T10:00Z', '2026-09-01T10:00Z', '11111111-1111-1111-1111-111111111111', 'dev-o');

insert into public.alert_responses (id, child_id, alert_id, response, responded_at, created_at, updated_at, created_by, device_id) values
  ('5d000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '5c000000-0000-0000-0000-000000000001', 'calm', '2026-09-01T22:30Z', '2026-09-01T10:00Z', '2026-09-01T10:00Z', '11111111-1111-1111-1111-111111111111', 'dev-o');

insert into public.day_closures (id, child_id, local_date, all_logged, created_at, updated_at, created_by, device_id) values
  ('5e000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01', true, '2026-09-01T10:00Z', '2026-09-01T10:00Z', '11111111-1111-1111-1111-111111111111', 'dev-o');

insert into public.block_physio (child_id, block_start, mean_hr, created_by, updated_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01T14:00Z', 92, '11111111-1111-1111-1111-111111111111', '2026-09-01T10:00Z');

insert into public.insight_snapshots (child_id, computed_at, fit_summary, insights, worth_watching, strategies, model_health, time_of_day) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-01T23:00Z', '{}', '[]', '[]', '[]', '{}', '[]');

insert into public.school_forecasts (child_id, local_date, blocks, computed_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-02', '[]', '2026-09-01T23:00Z');

insert into public.clinician_notes (id, child_id, author_id, body) values
  ('5f000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'Session note');

insert into public.share_links (id, child_id, created_by, token_hash, audience, range_from, range_to, snapshot, expires_at) values
  ('60000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'hash-a', 'school', '2026-08-01', '2026-09-01', '{}', now() + interval '7 days'),
  ('60000000-0000-0000-0000-0000000000b1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '77777777-7777-7777-7777-777777777777', 'hash-b', 'clinician', '2026-08-01', '2026-09-01', '{}', now() + interval '7 days');

insert into public.invites (child_id, role, code_hash, expires_at, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'caregiver', 'code-hash', now() + interval '7 days', '11111111-1111-1111-1111-111111111111');
insert into public.invite_attempts (user_id) values ('66666666-6666-6666-6666-666666666666');
insert into public.ai_usage (user_id, day, count) values ('11111111-1111-1111-1111-111111111111', '2026-09-01', 3);

-- ---------------------------------------------------------------------------------------------------------------
-- 0. every table has row-level security switched on (a new table without it fails this test)
-- ---------------------------------------------------------------------------------------------------------------
select is_empty($$ select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity $$,
  'every public table has row-level security enabled');
select is_empty($$ select t from tests.public_tables() t
                   where t not in ('invites','invite_attempts') and tests.visible_rows(t) = 0 $$,
  'fixtures: the database owner sees rows in every table (so the "0 rows" tests below mean something)');

-- ---------------------------------------------------------------------------------------------------------------
-- 1. a teacher cannot read medications (or sleep, health, home places, alerts, snapshots) (SPEC 30.3)
-- ---------------------------------------------------------------------------------------------------------------
select tests.login_as('33333333-3333-3333-3333-333333333333');

select is(tests.visible_rows('medications'), 0::bigint, 'teacher: cannot read medications');
select is_empty($$ select t from unnest(array['medication_changes','med_doses','sleep_entries','illness_logs','places_public',
    'place_visits','routine_changes','alerts','alert_responses','day_closures','block_physio','insight_snapshots',
    'share_links','clinician_notes','invites','invite_attempts','ai_usage']) t where tests.visible_rows(t) <> 0 $$,
  'teacher: reads nothing about medications, sleep, health, places, alerts, snapshots, notes from clinicians, links');
select results_eq($$ select id::text from public.episodes order by id $$,
  $$ values ('e0000000-0000-0000-0000-000000000001'), ('e0000000-0000-0000-0000-000000000003') $$,
  'teacher: sees hard moments at school and their own, not the one at home');
select results_eq($$ select id::text from public.strategy_uses order by id $$,
  $$ values ('51000000-0000-0000-0000-000000000001'), ('51000000-0000-0000-0000-000000000003') $$,
  'teacher: sees strategy uses during school hard moments and their own');
select results_eq($$ select text from public.notes $$, $$ values ('Teacher note') $$, 'teacher: sees only their own notes');
select results_eq($$ select meal_type from public.meals $$, $$ values ('lunch') $$, 'teacher: sees only meals they logged');
select is(tests.visible_rows('strategies'), 1::bigint, 'teacher: sees the list of strategies');
select is(tests.visible_rows('school_forecasts'), 1::bigint, 'teacher: sees today''s school-hours forecast');
select is(tests.visible_rows('children'), 1::bigint, 'teacher: sees the child');
select throws_ok($$ insert into public.medications (id, child_id, name, active_from, created_at, updated_at, created_by, device_id)
  values (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'X', '2026-09-01', now(), now(), '33333333-3333-3333-3333-333333333333', 'dev-t') $$,
  '42501', null, 'teacher: cannot add a medication');
select lives_ok($$ insert into public.episodes (id, child_id, started_at, type, place_type, source, created_at, updated_at, created_by, device_id)
  values ('e0000000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 'meltdown', 'school', 'manual', now(), now(), '33333333-3333-3333-3333-333333333333', 'dev-t') $$,
  'teacher: can log a hard moment as themselves');
select throws_ok($$ insert into public.episodes (id, child_id, started_at, type, place_type, source, created_at, updated_at, created_by, device_id)
  values (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 'meltdown', 'school', 'manual', now(), now(), '11111111-1111-1111-1111-111111111111', 'dev-t') $$,
  '42501', null, 'teacher: cannot log a hard moment in someone else''s name');
select is(tests.changed($$ update public.episodes set notes = 'changed', updated_at = now() where id = 'e0000000-0000-0000-0000-000000000001' $$),
  0::bigint, 'teacher: cannot edit a hard moment someone else logged (even one at school)');
select is(tests.changed($$ update public.episodes set notes = 'mine', updated_at = now() where id = 'e0000000-0000-0000-0000-000000000003' $$),
  1::bigint, 'teacher: can edit their own entry');
select throws_ok($$ update public.episodes set created_by = '11111111-1111-1111-1111-111111111111', updated_at = now() + interval '1 day'
  where id = 'e0000000-0000-0000-0000-000000000003' $$,
  '42501', null, 'teacher: cannot hand their entry to someone else');
select is((select created_by::text from public.episodes where id = 'e0000000-0000-0000-0000-000000000003'), '33333333-3333-3333-3333-333333333333',
  'teacher: the entry is still theirs');

-- ---------------------------------------------------------------------------------------------------------------
-- 2. a clinician reads everything synced but cannot insert or edit the family's logs (SPEC 30.3)
-- ---------------------------------------------------------------------------------------------------------------
select tests.login_as('44444444-4444-4444-4444-444444444444');

select is(tests.visible_rows('medications'), 1::bigint, 'clinician: reads medications');
select is(tests.visible_rows('episodes'), 4::bigint, 'clinician: reads every hard moment of this child (not family B''s)');
select throws_ok($$ insert into public.episodes (id, child_id, started_at, type, source, created_at, updated_at, created_by, device_id)
  values (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 'meltdown', 'manual', now(), now(), '44444444-4444-4444-4444-444444444444', 'dev-k') $$,
  '42501', null, 'clinician: cannot insert episodes');
select is(tests.changed($$ update public.episodes set notes = 'x', updated_at = now() $$), 0::bigint, 'clinician: cannot edit episodes');
select is(tests.changed($$ update public.medications set name = 'x', updated_at = now() $$), 0::bigint, 'clinician: cannot edit medications');
select lives_ok($$ insert into public.clinician_notes (child_id, author_id, body) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '44444444-4444-4444-4444-444444444444', 'Note') $$,
  'clinician: can write their own clinician notes');
select throws_ok($$ insert into public.clinician_notes (child_id, author_id, body) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Fake') $$,
  '42501', null, 'clinician: cannot write a note in someone else''s name');
select is(tests.visible_rows('share_links'), 0::bigint, 'clinician: cannot read share links');

-- ---------------------------------------------------------------------------------------------------------------
-- 3. a caregiver logs everything but can't manage the team, the child or share links
-- ---------------------------------------------------------------------------------------------------------------
select tests.login_as('22222222-2222-2222-2222-222222222222');

select is(tests.visible_rows('medications'), 1::bigint, 'caregiver: reads medications');
select is(tests.visible_rows('share_links'), 0::bigint, 'caregiver: cannot read share links');
select is(tests.visible_rows('invites'), 0::bigint, 'caregiver: cannot read invites');
select lives_ok($$ insert into public.med_doses (id, child_id, medication_id, scheduled_for, status, created_at, updated_at, created_by, device_id)
  values (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '54000000-0000-0000-0000-000000000001', now(), 'taken', now(), now(), '22222222-2222-2222-2222-222222222222', 'dev-c') $$,
  'caregiver: can log a dose');
select is(tests.changed($$ update public.children set nickname = 'Hacked', updated_at = now() $$), 0::bigint, 'caregiver: cannot edit the child profile');
select throws_ok($$ insert into public.children (id, owner_id, nickname, home_tz, episodes_per_week_estimate, created_at, updated_at, created_by, device_id)
  values (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', 'X', 'UTC', 1, now(), now(), '11111111-1111-1111-1111-111111111111', 'dev-c') $$,
  '42501', null, 'caregiver: cannot create a child owned by someone else');
select throws_ok($$ insert into public.memberships (child_id, user_id, role) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '66666666-6666-6666-6666-666666666666', 'caregiver') $$,
  '42501', null, 'caregiver: cannot add team members');
select throws_ok($$ update public.memberships set role = 'owner' where user_id = '22222222-2222-2222-2222-222222222222' $$,
  '42501', null, 'caregiver: cannot make themselves owner');
select throws_ok($$ insert into public.share_links (child_id, created_by, token_hash, audience, range_from, range_to, snapshot, expires_at)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'x', 'family', '2026-09-01', '2026-09-02', '{}', now()) $$,
  '42501', null, 'caregiver: cannot create share links directly');

-- ---------------------------------------------------------------------------------------------------------------
-- 4. share links are readable only by their owner (SPEC 30.3); the owner can't change the table directly either
-- ---------------------------------------------------------------------------------------------------------------
select tests.login_as('11111111-1111-1111-1111-111111111111');

select results_eq($$ select id::text from public.share_links $$, $$ values ('60000000-0000-0000-0000-000000000001') $$,
  'owner: sees their own child''s share link only');
select throws_ok($$ insert into public.share_links (child_id, created_by, token_hash, audience, range_from, range_to, snapshot, expires_at)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'x', 'family', '2026-09-01', '2026-09-02', '{}', now()) $$,
  '42501', null, 'owner: share links are created only by the share-create function');
select throws_ok($$ update public.share_links set revoked_at = null $$, '42501', null, 'owner: cannot un-revoke a link directly');
select is(tests.visible_rows('invites'), 0::bigint, 'owner: invite codes (hashes) are never readable');
select is(tests.visible_rows('episodes'), 4::bigint, 'owner: sees only their own child''s hard moments');
select throws_ok($$ update public.children set owner_id = '66666666-6666-6666-6666-666666666666' $$, '42501', null, 'owner: the owner of a child can''t be changed');
select throws_ok($$ insert into public.ai_usage (user_id, day, count) values ('11111111-1111-1111-1111-111111111111', current_date, 0) $$,
  '42501', null, 'owner: cannot reset their own AI usage counter');
select throws_ok($$ select public.ai_usage_increment('11111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'owner: cannot call the AI usage counter (only the edge functions can)');

select tests.login_as('77777777-7777-7777-7777-777777777777');
select results_eq($$ select id::text from public.share_links $$, $$ values ('60000000-0000-0000-0000-0000000000b1') $$,
  'another family''s owner: sees only their own link');

-- ---------------------------------------------------------------------------------------------------------------
-- 5. a non-member can't read anything (SPEC 30.3), and neither can a removed member or a signed-out visitor
-- ---------------------------------------------------------------------------------------------------------------
select tests.login_as('66666666-6666-6666-6666-666666666666');
select is_empty($$ select t from tests.public_tables() t where t <> 'profiles' and tests.visible_rows(t) <> 0 $$,
  'outsider: reads 0 rows from every table');
select is(tests.visible_rows('profiles'), 1::bigint, 'outsider: sees only their own profile');
select throws_ok($$ insert into public.episodes (id, child_id, started_at, type, source, created_at, updated_at, created_by, device_id)
  values (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 'meltdown', 'manual', now(), now(), '66666666-6666-6666-6666-666666666666', 'dev-x') $$,
  '42501', null, 'outsider: cannot add to a child they don''t belong to');
select is(tests.changed($$ update public.episodes set notes = 'x', updated_at = now() $$), 0::bigint, 'outsider: cannot edit anything');

select tests.login_as('55555555-5555-5555-5555-555555555555');
select is_empty($$ select t from tests.public_tables() t where t not in ('profiles','memberships') and tests.visible_rows(t) <> 0 $$,
  'removed member: reads 0 rows of the family''s data');
select results_eq($$ select status from public.memberships $$, $$ values ('removed') $$,
  'removed member: sees only their own (removed) membership, so the app can tell them');
select throws_ok($$ insert into public.episodes (id, child_id, started_at, type, source, created_at, updated_at, created_by, device_id)
  values (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 'meltdown', 'manual', now(), now(), '55555555-5555-5555-5555-555555555555', 'dev-r') $$,
  '42501', null, 'removed member: cannot log anymore');

select tests.login_anon();
select is_empty($$ select t from tests.public_tables() t where tests.visible_rows(t) > 0 $$,
  'signed-out visitor: reads nothing (permission denied or 0 rows) from every table');

-- ---------------------------------------------------------------------------------------------------------------
-- 6. sync rules enforced by the database
-- ---------------------------------------------------------------------------------------------------------------
select tests.login_as('11111111-1111-1111-1111-111111111111');

select is(tests.changed($$ update public.episodes set notes = 'older edit', updated_at = '2026-08-01T00:00Z' where id = 'e0000000-0000-0000-0000-000000000002' $$),
  0::bigint, 'last writer wins: an older edit is ignored');
select is(tests.changed($$ update public.episodes set notes = 'tie, smaller device', device_id = 'dev-a' where id = 'e0000000-0000-0000-0000-000000000002' $$),
  0::bigint, 'last writer wins: same time, smaller device id loses');
select is(tests.changed($$ update public.episodes set notes = 'tie, greater device', device_id = 'dev-z' where id = 'e0000000-0000-0000-0000-000000000002' $$),
  1::bigint, 'last writer wins: same time, greater device id wins');
select is(tests.changed($$ update public.episodes set notes = 'newer edit', updated_at = '2026-09-02T00:00Z' where id = 'e0000000-0000-0000-0000-000000000002' $$),
  1::bigint, 'last writer wins: a newer edit lands');
select is((select notes from public.episodes where id = 'e0000000-0000-0000-0000-000000000002'), 'newer edit', 'the newer edit is what is stored');

select lives_ok($$ insert into public.notes (id, child_id, noted_at, text, source, created_at, updated_at, created_by, device_id, server_received_at)
  values ('52000000-0000-0000-0000-000000000009', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 'x', 'manual', now(), now(), '11111111-1111-1111-1111-111111111111', 'dev-o', '2000-01-01') $$,
  'a row with a made-up server time can be inserted');
select ok((select server_received_at > '2026-01-01' from public.notes where id = '52000000-0000-0000-0000-000000000009'),
  'but the server replaces the made-up server_received_at with its own clock');

select throws_ok($$ insert into public.med_doses (id, child_id, medication_id, status, created_at, updated_at, created_by, device_id)
  values (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '54000000-0000-0000-0000-0000000000b1', 'taken', now(), now(), '11111111-1111-1111-1111-111111111111', 'dev-o') $$,
  '23503', null, 'a dose can''t point at another child''s medication');

-- keep only the newest 60 insight snapshots per child
reset role;
insert into public.insight_snapshots (child_id, computed_at, fit_summary, insights, worth_watching, strategies, model_health, time_of_day)
  select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-02T00:00Z'::timestamptz + make_interval(hours => g), '{}', '[]', '[]', '[]', '{}', '[]'
  from generate_series(1, 65) g;
select is((select count(*) from public.insight_snapshots where child_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 60::bigint,
  'only the newest 60 insight snapshots are kept');
select is((select min(computed_at) from public.insight_snapshots where child_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '2026-09-02T06:00Z'::timestamptz, 'the oldest ones are the ones removed');

-- the AI usage counter (Phase 8): the edge functions' server role adds 1 per request and gets the new count back
set local role service_role;
select is(public.ai_usage_increment('11111111-1111-1111-1111-111111111111'), 1, 'AI counter: first request today counts 1');
select is(public.ai_usage_increment('11111111-1111-1111-1111-111111111111'), 2, 'AI counter: second request counts 2');
select is(public.ai_usage_increment('22222222-2222-2222-2222-222222222222'), 1, 'AI counter: each person has their own count');
reset role;
select is((select count from public.ai_usage where user_id = '11111111-1111-1111-1111-111111111111' and day = '2026-09-01'), 3,
  'AI counter: an earlier day''s count is untouched');

select * from finish();
rollback;
