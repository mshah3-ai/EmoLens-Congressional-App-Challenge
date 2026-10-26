--
-- EmoLens cloud schema (SPEC 7.2). The cloud is only used when a family turns on Care Team.
--
-- * "Mirror" tables copy the phone's syncable tables with the same column names. Types differ only where Postgres
--   has a better one: JSON text -> jsonb, 0/1 integers -> boolean, ISO text times -> timestamptz.
-- * Things that must never leave the phone are simply not here: place coordinates, calendar titles, raw heart rate,
--   sound, model fits and predictions (SPEC 7.2 exclusions), plus phone-only columns (notification ids, audio paths).
-- * Every mirror row belongs to one child (`child_id`), which is what row-level security checks (next migration).
-- * Sync is last-writer-wins on the phone's own `updated_at`. `server_received_at` is stamped by the server on every
--   write and is what other phones use as their "what's new since last time" cursor.

-- ---------------------------------------------------------------------------------------------------------------
-- people and teams
-- ---------------------------------------------------------------------------------------------------------------

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now()
);

create table public.children (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 60),
  birth_year int,
  home_tz text not null,
  communication text check (communication in ('speaking','some_words','minimally_speaking','aac','prefer_not')),
  wake_start text not null default '06:00',
  wake_end text not null default '22:00',
  typical_sleep_hours real,
  episodes_per_week_estimate real not null,
  modeled_episode_types jsonb not null default '["meltdown","shutdown","other"]',
  min_modeled_intensity int not null default 1,
  school_days jsonb not null default '[1,2,3,4,5]',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid not null,
  device_id text not null,
  server_received_at timestamptz not null default now()
);

create table public.memberships (
  child_id uuid not null references public.children (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner','caregiver','teacher','clinician')),
  status text not null default 'active' check (status in ('active','removed')),
  created_at timestamptz not null default now(),
  primary key (child_id, user_id)
);
create index memberships_user on public.memberships (user_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  role text not null check (role in ('caregiver','teacher','clinician')),  -- nobody can be invited as owner
  code_hash text not null unique,                                          -- SHA-256 of the 8-character code
  expires_at timestamptz not null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz
);

-- Failed invite-code tries, so nobody can guess codes quickly (edge function invite-accept).
create table public.invite_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index invite_attempts_user_at on public.invite_attempts (user_id, at);

-- ---------------------------------------------------------------------------------------------------------------
-- helpers used by every mirror table
-- ---------------------------------------------------------------------------------------------------------------

-- Server time of every insert/update, for pull cursors. clock_timestamp() (not now()) so rows written late in a long
-- transaction still get a late time. Clients can't set it: whatever they send is overwritten here.
create function public.stamp_server_received_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.server_received_at := clock_timestamp();
  return new;
end $$;

-- Last-writer-wins guard (SPEC 23.3): an update only lands if it is newer than what the server has, by the phone's
-- updated_at; on a tie the greater device_id wins. Returning null skips the update without an error, so a phone that
-- pushes an old edit simply loses, exactly like the phone-side merge.
create function public.lww_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.updated_at < old.updated_at
     or (new.updated_at = old.updated_at and new.device_id <= old.device_id) then
    return null;
  end if;
  return new;
end $$;

-- The same guard for tables without device_id (places_public, block_physio): ties keep what is there.
create function public.lww_guard_no_device() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.updated_at <= old.updated_at then
    return null;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- mirror tables (same columns as the phone's tables in apps/mobile/src/db/migrations)
-- ---------------------------------------------------------------------------------------------------------------

create table public.episodes (
  id uuid primary key,
  child_id uuid not null references public.children (id) on delete cascade,
  started_at timestamptz not null,
  duration_min int,
  type text not null check (type in ('meltdown','shutdown','other')),
  intensity int check (intensity between 1 and 5),
  place_id uuid,
  place_type text,
  antecedent_tags jsonb not null default '[]',
  antecedent_note text,
  behavior_tags jsonb not null default '[]',
  safety_concern boolean not null default false,
  notes text,
  details_complete boolean not null default false,
  source text not null check (source in ('manual','voice','alert_confirm','end_of_day','document','import')),
  created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz,
  created_by uuid not null, device_id text not null,
  server_received_at timestamptz not null default now()
);

create table public.strategies (
  id uuid primary key,
  child_id uuid not null references public.children (id) on delete cascade,
  name text not null,
  category text not null check (category in ('sensory','environment','connection','routine','movement','body_needs','preferred_activity','other')),
  is_default boolean not null default false,
  active boolean not null default true,
  onboarding_favorite boolean not null default false,
  created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz,
  created_by uuid not null, device_id text not null,
  server_received_at timestamptz not null default now()
);

create table public.strategy_uses (
  id uuid primary key,
  child_id uuid not null references public.children (id) on delete cascade,
  strategy_id uuid not null,
  context text not null check (context in ('proactive','during')),
  episode_id uuid,
  alert_id uuid,
  outcome text not null check (outcome in ('helped','not_helped','unsure','averted','not_averted','pending')),
  used_at timestamptz not null,
  created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz,
  created_by uuid not null, device_id text not null,
  server_received_at timestamptz not null default now()
);

create table public.medications (
  id uuid primary key,
  child_id uuid not null references public.children (id) on delete cascade,
  name text not null,
  rxcui text,
  strength text,
  form text,
  schedule jsonb not null default '{"times":[],"days":[1,2,3,4,5,6,7]}',
  as_needed boolean not null default false,
  reminders_enabled boolean not null default true,
  active_from text not null,            -- local date YYYY-MM-DD (a date, not an instant), kept as text like the phone
  active_to text,
  notes text,
  created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz,
  created_by uuid not null, device_id text not null,
  server_received_at timestamptz not null default now(),
  unique (id, child_id)                 -- target of the (medication_id, child_id) keys below
);

-- The phone's medication_changes, med_doses and alert_responses have no child_id (they point at a medication or an
-- alert). The cloud adds it, because row-level security and "what's new for this child" both need it. The composite
-- foreign key makes it impossible to attach a row to a different child than its medication's / alert's.
create table public.medication_changes (
  id uuid primary key,
  child_id uuid not null,
  medication_id uuid not null,
  changed_at timestamptz not null,
  change_type text not null check (change_type in ('start','stop','dose_change','time_change')),
  old_value text,
  new_value text,
  created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz,
  created_by uuid not null, device_id text not null,
  server_received_at timestamptz not null default now(),
  foreign key (medication_id, child_id) references public.medications (id, child_id) on delete cascade
);

create table public.med_doses (
  id uuid primary key,
  child_id uuid not null,
  medication_id uuid not null,
  scheduled_for timestamptz,
  taken_at timestamptz,
  status text not null check (status in ('pending','taken','late','missed','skipped')),
  dose_text text,
  created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz,
  created_by uuid not null, device_id text not null,
  server_received_at timestamptz not null default now(),
  foreign key (medication_id, child_id) references public.medications (id, child_id) on delete cascade
);

create table public.meals (
  id uuid primary key,
  child_id uuid not null references public.children (id) on delete cascade,
  eaten_at timestamptz not null,
  meal_type text not null check (meal_type in ('breakfast','lunch','dinner','snack','drink')),
  items jsonb not null default '[]',
  amount text check (amount in ('little','some','most','all')),
  notes text,
  created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz,
  created_by uuid not null, device_id text not null,
  server_received_at timestamptz not null default now()
);

create table public.sleep_entries (
  id uuid primary key,
  child_id uuid not null references public.children (id) on delete cascade,
  sleep_start timestamptz not null,
  sleep_end timestamptz not null,
  duration_min int not null,
  quality int check (quality between 1 and 5),
  night_wakings int,
  source text not null check (source in ('manual','healthkit','healthconnect','fitbit','end_of_day')),
  external_id text,
  created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz,
  created_by uuid not null, device_id text not null,
  server_received_at timestamptz not null default now()
);

create table public.illness_logs (
  id uuid primary key,
  child_id uuid not null references public.children (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  kind text not null check (kind in ('cold','fever','stomach','pain','constipation','allergy','dental','ear','injury','other')),
  severity int not null check (severity between 1 and 3),
  notes text,
  created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz,
  created_by uuid not null, device_id text not null,
  server_received_at timestamptz not null default now()
);

create table public.routine_changes (
  id uuid primary key,
  child_id uuid not null references public.children (id) on delete cascade,
  local_date text not null,
  start_at timestamptz,
  description text,
  severity int not null default 2 check (severity between 1 and 3),
  created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz,
  created_by uuid not null, device_id text not null,
  server_received_at timestamptz not null default now()
);

-- Places WITHOUT coordinates (SPEC 7.2): only the name and the kind of place ever reach the cloud.
create table public.places_public (
  id uuid primary key,
  child_id uuid not null references public.children (id) on delete cascade,
  label text not null,
  type text not null check (type in ('home','school','therapy','medical','relative','store_public','park_outdoor','other')),
  created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz,
  server_received_at timestamptz not null default now()
);

create table public.place_visits (
  id uuid primary key,
  child_id uuid not null references public.children (id) on delete cascade,
  place_id uuid,
  place_type text not null,
  arrived_at timestamptz not null,
  departed_at timestamptz,
  source text not null check (source in ('geofence_child_device','geofence_parent','manual','episode','schedule_default')),
  created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz,
  created_by uuid not null, device_id text not null,
  server_received_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key,
  child_id uuid not null references public.children (id) on delete cascade,
  noted_at timestamptz not null,
  text text not null,
  source text not null check (source in ('manual','voice','document')),
  structured_status text check (structured_status in ('none','pending','accepted','rejected')),
  created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz,
  created_by uuid not null, device_id text not null,
  server_received_at timestamptz not null default now()
);

create table public.alerts (
  id uuid primary key,
  child_id uuid not null references public.children (id) on delete cascade,
  block_start timestamptz not null,
  prediction_id uuid,
  scheduled_for timestamptz not null,
  status text not null check (status in ('scheduled','delivered','cancelled','suppressed')),
  created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz,
  created_by uuid not null, device_id text not null,
  server_received_at timestamptz not null default now(),
  unique (id, child_id)
);

create table public.alert_responses (
  id uuid primary key,
  child_id uuid not null,
  alert_id uuid not null,
  response text not null check (response in ('happened','stepped_in','calm')),
  responded_at timestamptz not null,
  followup_done boolean not null default false,
  created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz,
  created_by uuid not null, device_id text not null,
  server_received_at timestamptz not null default now(),
  foreign key (alert_id, child_id) references public.alerts (id, child_id) on delete cascade
);

-- One "that's everything for today" per child and day. Two phones can each close the same day, so the sync layer
-- merges on (child_id, local_date), not on id.
create table public.day_closures (
  id uuid primary key,
  child_id uuid not null references public.children (id) on delete cascade,
  local_date text not null,
  all_logged boolean not null,
  closed_at timestamptz,
  created_at timestamptz not null, updated_at timestamptz not null, deleted_at timestamptz,
  created_by uuid not null, device_id text not null,
  server_received_at timestamptz not null default now(),
  unique (child_id, local_date)
);

-- Per-block heart-rate / HRV / step summaries from a Child Device (never raw samples).
create table public.block_physio (
  child_id uuid not null references public.children (id) on delete cascade,
  block_start timestamptz not null,
  mean_hr real, hr_pre60_mean real, resting_hr real, hrv real,
  hrv_kind text check (hrv_kind in ('sdnn','rmssd')),
  steps_day_prior int,
  created_by uuid,
  updated_at timestamptz not null,
  server_received_at timestamptz not null default now(),
  primary key (child_id, block_start)
);

-- ---------------------------------------------------------------------------------------------------------------
-- results shared by the family's forecasting phone, clinician notes, share links, AI usage
-- ---------------------------------------------------------------------------------------------------------------

-- Uploaded by the child's primary forecasting phone after each daily fit, so the portal can show patterns without
-- recomputing (it doesn't have weather, sound or calendar data). Only the newest 60 per child are kept.
create table public.insight_snapshots (
  child_id uuid not null references public.children (id) on delete cascade,
  computed_at timestamptz not null,
  fit_summary jsonb not null,
  insights jsonb not null,
  worth_watching jsonb not null,
  strategies jsonb not null,
  model_health jsonb not null,
  time_of_day jsonb not null,
  created_by uuid,
  server_received_at timestamptz not null default now(),
  primary key (child_id, computed_at)
);

-- Today's forecast levels for school hours only, with no reasons (reasons can mention sleep or medications).
-- Teachers may see "Today's forecast (school hours)" (SPEC 7.1) but not insight snapshots, so this is separate.
create table public.school_forecasts (
  child_id uuid not null references public.children (id) on delete cascade,
  local_date text not null,
  blocks jsonb not null,               -- [{start, end, level}] for blocks that overlap school hours
  computed_at timestamptz not null,
  created_by uuid,
  server_received_at timestamptz not null default now(),
  primary key (child_id, local_date)
);

create table public.clinician_notes (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) <= 20000),
  kind text not null default 'note' check (kind in ('note','session_prep_draft','session_prep_final')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,     -- SHA-256 of the token; the token itself is never stored
  audience text not null check (audience in ('clinician','school','family')),
  range_from text not null,
  range_to text not null,
  snapshot jsonb not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  count int not null default 0,
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------------------------------------------
-- triggers and indexes
-- ---------------------------------------------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['children','episodes','strategies','strategy_uses','medications','medication_changes','med_doses',
    'meals','sleep_entries','illness_logs','routine_changes','places_public','place_visits','notes','alerts','alert_responses',
    'day_closures','block_physio','insight_snapshots','school_forecasts']
  loop
    -- named "z_..." so it runs after lww_guard (triggers of the same kind run in name order)
    execute format('create trigger z_stamp_server_received_at before insert or update on public.%I
      for each row execute function public.stamp_server_received_at()', t);
    if t <> 'children' then
      execute format('create index %I on public.%I (child_id, server_received_at)', t || '_pull', t);
    end if;
  end loop;
  foreach t in array array['children','episodes','strategies','strategy_uses','medications','medication_changes','med_doses',
    'meals','sleep_entries','illness_logs','routine_changes','place_visits','notes','alerts','alert_responses','day_closures']
  loop
    execute format('create trigger lww_guard before update on public.%I
      for each row execute function public.lww_guard()', t);
  end loop;
  foreach t in array array['places_public','block_physio']
  loop
    execute format('create trigger lww_guard before update on public.%I
      for each row execute function public.lww_guard_no_device()', t);
  end loop;
end $$;

-- the children table's own id is its child id
create index children_pull on public.children (id, server_received_at);
create index children_owner on public.children (owner_id);

-- A new account gets an empty profile.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Whoever creates a child becomes its owner (the only way an owner membership is ever made).
create function public.handle_new_child() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.memberships (child_id, user_id, role, status) values (new.id, new.owner_id, 'owner', 'active');
  return new;
end $$;
create trigger on_child_created after insert on public.children
  for each row execute function public.handle_new_child();

-- The owner of a child can never change (it would hand the child to someone else).
create function public.keep_child_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.owner_id <> old.owner_id then
    raise exception 'owner_id cannot change' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger keep_child_owner before update on public.children
  for each row execute function public.keep_child_owner();

-- Keep only the newest 60 insight snapshots per child (SPEC 7.2).
create function public.trim_insight_snapshots() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.insight_snapshots s
  where s.child_id = new.child_id
    and s.computed_at < (select computed_at from public.insight_snapshots
                         where child_id = new.child_id order by computed_at desc offset 59 limit 1);
  return null;
end $$;
create trigger trim_insight_snapshots after insert on public.insight_snapshots
  for each row execute function public.trim_insight_snapshots();

create index clinician_notes_child on public.clinician_notes (child_id, created_at);
create index share_links_child on public.share_links (child_id, created_at);
create index invites_child on public.invites (child_id);
