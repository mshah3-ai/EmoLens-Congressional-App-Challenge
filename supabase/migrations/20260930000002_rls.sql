--
-- Row-level security (SPEC 7.3): who can see and change which rows. Postgres checks these rules on EVERY query from
-- the app and the portal, so even a modified app can't read what its user isn't allowed to see.
--
-- Roles (SPEC 7.1): owner (the parent who created the child), caregiver, teacher, clinician. A membership that was
-- removed ('removed') gives no access at all. There are no delete policies: deleting is a soft delete (deleted_at).
-- memberships, invites and share_links have no insert/update policies: only the edge functions (server code with the
-- secret key, which never leaves Supabase) can write them.

-- ---------------------------------------------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------------------------------------------

-- Is the signed-in user an active member of child `c` with one of `roles`? security definer: it can read
-- memberships without going through memberships' own policy (which would call this function again, forever).
create function public.is_member(c uuid, roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m
    where m.child_id = c and m.user_id = (select auth.uid())
      and m.status = 'active' and m.role = any(roles));
$$;

-- Does the signed-in user share at least one child (both active) with user `u`? Used for team members' names.
create function public.shares_child_with(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships a join public.memberships b on a.child_id = b.child_id
    where a.user_id = (select auth.uid()) and a.status = 'active' and b.user_id = u and b.status = 'active');
$$;

revoke all on function public.is_member(uuid, text[]) from public, anon;
revoke all on function public.shares_child_with(uuid) from public, anon;
grant execute on function public.is_member(uuid, text[]) to authenticated;
grant execute on function public.shares_child_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- privileges: signed-out visitors (anon) get nothing; signed-in users never delete or truncate
-- ---------------------------------------------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
revoke truncate, references, trigger, delete on all tables in schema public from authenticated;
revoke insert, update on public.memberships, public.invites, public.invite_attempts, public.share_links, public.ai_usage
  from authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- turn RLS on for every table (a test checks that no public table is left without it)
-- ---------------------------------------------------------------------------------------------------------------

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- people and teams
-- ---------------------------------------------------------------------------------------------------------------

create policy "profiles: self and teammates read" on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_child_with(user_id));
create policy "profiles: insert own" on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "profiles: update own" on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "children: members read" on public.children for select to authenticated
  using (public.is_member(id, '{owner,caregiver,teacher,clinician}') or owner_id = (select auth.uid()));
create policy "children: create your own" on public.children for insert to authenticated
  with check (owner_id = (select auth.uid()) and created_by = (select auth.uid()));
create policy "children: owner edits" on public.children for update to authenticated
  using (public.is_member(id, '{owner}')) with check (public.is_member(id, '{owner}'));

-- Members see the whole team; anyone sees their own membership (so a removed person's app learns it was removed).
create policy "memberships: team reads" on public.memberships for select to authenticated
  using (public.is_member(child_id, '{owner,caregiver,teacher,clinician}') or user_id = (select auth.uid()));

-- invites, invite_attempts: no policies at all -> no user can read or write them (edge functions only).

create policy "ai_usage: read own" on public.ai_usage for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------------------------
-- logs that teachers may add: episodes, strategy uses, notes (SPEC 7.3), and meals
-- ---------------------------------------------------------------------------------------------------------------

-- A teacher sees hard moments at school and their own entries.
create policy "episodes: read" on public.episodes for select to authenticated
  using (public.is_member(child_id, '{owner,caregiver,clinician}')
    or (public.is_member(child_id, '{teacher}') and (place_type = 'school' or created_by = (select auth.uid()))));

-- Strategy uses have no place: a teacher sees their own and those during a hard moment they can see (at school).
create policy "strategy_uses: read" on public.strategy_uses for select to authenticated
  using (public.is_member(child_id, '{owner,caregiver,clinician}')
    or (public.is_member(child_id, '{teacher}') and (created_by = (select auth.uid())
      or exists (select 1 from public.episodes e where e.id = episode_id and e.child_id = strategy_uses.child_id
                 and e.place_type = 'school' and e.deleted_at is null))));

-- Notes have no place either: a teacher sees only their own.
create policy "notes: read" on public.notes for select to authenticated
  using (public.is_member(child_id, '{owner,caregiver,clinician}')
    or (public.is_member(child_id, '{teacher}') and created_by = (select auth.uid())));

create policy "meals: read" on public.meals for select to authenticated
  using (public.is_member(child_id, '{owner,caregiver,clinician}')
    or (public.is_member(child_id, '{teacher}') and created_by = (select auth.uid())));

-- Writing: owner and caregiver may write any row; a teacher only rows they created themselves.
do $$
declare t text;
begin
  foreach t in array array['episodes','strategy_uses','notes','meals'] loop
    execute format($f$
      create policy "%1$s: insert" on public.%1$I for insert to authenticated
        with check (public.is_member(child_id, '{owner,caregiver}')
          or (public.is_member(child_id, '{teacher}') and created_by = (select auth.uid())));
      create policy "%1$s: update" on public.%1$I for update to authenticated
        using (public.is_member(child_id, '{owner,caregiver}')
          or (public.is_member(child_id, '{teacher}') and created_by = (select auth.uid())))
        with check (public.is_member(child_id, '{owner,caregiver}')
          or (public.is_member(child_id, '{teacher}') and created_by = (select auth.uid())));
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- everything else the family logs: owner, caregiver and clinician read; owner and caregiver write
-- ---------------------------------------------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['medications','medication_changes','med_doses','sleep_entries','illness_logs',
    'places_public','place_visits','routine_changes','alerts','alert_responses','day_closures','block_physio',
    'insight_snapshots'] loop
    execute format($f$
      create policy "%1$s: read" on public.%1$I for select to authenticated
        using (public.is_member(child_id, '{owner,caregiver,clinician}'));
      create policy "%1$s: insert" on public.%1$I for insert to authenticated
        with check (public.is_member(child_id, '{owner,caregiver}'));
      create policy "%1$s: update" on public.%1$I for update to authenticated
        using (public.is_member(child_id, '{owner,caregiver}')) with check (public.is_member(child_id, '{owner,caregiver}'));
    $f$, t);
  end loop;
end $$;

-- Strategies (the list of calming ideas) and today's school-hours forecast: every member reads.
do $$
declare t text;
begin
  foreach t in array array['strategies','school_forecasts'] loop
    execute format($f$
      create policy "%1$s: read" on public.%1$I for select to authenticated
        using (public.is_member(child_id, '{owner,caregiver,teacher,clinician}'));
      create policy "%1$s: insert" on public.%1$I for insert to authenticated
        with check (public.is_member(child_id, '{owner,caregiver}'));
      create policy "%1$s: update" on public.%1$I for update to authenticated
        using (public.is_member(child_id, '{owner,caregiver}')) with check (public.is_member(child_id, '{owner,caregiver}'));
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- clinician notes and share links
-- ---------------------------------------------------------------------------------------------------------------

create policy "clinician_notes: read" on public.clinician_notes for select to authenticated
  using (public.is_member(child_id, '{owner,caregiver,clinician}'));
create policy "clinician_notes: clinician writes own" on public.clinician_notes for insert to authenticated
  with check (public.is_member(child_id, '{clinician}') and author_id = (select auth.uid()));
create policy "clinician_notes: clinician edits own" on public.clinician_notes for update to authenticated
  using (public.is_member(child_id, '{clinician}') and author_id = (select auth.uid()))
  with check (public.is_member(child_id, '{clinician}') and author_id = (select auth.uid()));

-- Only the child's owner can list share links (to revoke them). Creating and revoking go through edge functions;
-- the public share page reads one snapshot through the share-view function, never this table.
create policy "share_links: owner reads" on public.share_links for select to authenticated
  using (public.is_member(child_id, '{owner}'));
