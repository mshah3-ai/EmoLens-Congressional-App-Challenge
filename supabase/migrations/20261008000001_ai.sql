--
-- Phase 8: the daily AI request counter (SPEC 7.4 "AI rate limiting"). Every ai-* edge function calls this once per
-- request, before it talks to the AI provider. It adds 1 to today's count for the user in a single statement (so two
-- requests at the same moment can't both slip under the limit) and returns the new count; the function refuses the
-- request when the count is above the limit. "Today" is the UTC day.
--
-- security definer + empty search_path: it runs with the owner's rights on exactly this one table. Only the edge
-- functions' server key (service_role) may call it; signed-in users can't raise or reset their own counter.

create function public.ai_usage_increment(p_user uuid) returns int
language sql volatile security definer set search_path = '' as $$
  insert into public.ai_usage as u (user_id, day, count)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set count = u.count + 1
  returning u.count;
$$;

revoke all on function public.ai_usage_increment(uuid) from public, anon, authenticated;
grant execute on function public.ai_usage_increment(uuid) to service_role;
