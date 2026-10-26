--
-- Realtime (SPEC 23.3): while the app is open it listens for changes to its child's rows and then pulls. Supabase
-- Realtime checks the same row-level security rules before telling a phone about a change, so a teacher's phone is
-- never told about a medication row. Only the "something changed" signal matters: the app always pulls the rows.
alter publication supabase_realtime add table
  public.children, public.memberships, public.episodes, public.strategies, public.strategy_uses, public.medications,
  public.medication_changes, public.med_doses, public.meals, public.sleep_entries, public.illness_logs,
  public.routine_changes, public.places_public, public.place_visits, public.notes, public.alerts, public.alert_responses,
  public.day_closures, public.block_physio, public.school_forecasts;
