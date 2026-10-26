-- Migration 004 (Phase 7: Care Team sync).
-- team_members: a copy of the care team (roles and names) for the Team tab and the activity feed ("Ms. Lopez logged a
--   hard moment"). Refreshed from the cloud at every sync; never synced back and never exported.
-- school_forecasts: today's school-hours forecast levels made by the family's forecasting phone, for a teacher's phone
--   (which has too little data to forecast itself). Pulled only; never exported.
-- idx_outbox_row: finds the queued uploads of one row quickly.
CREATE TABLE team_members (
  child_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','caregiver','teacher','clinician')),
  status TEXT NOT NULL CHECK (status IN ('active','removed')),
  display_name TEXT,
  PRIMARY KEY (child_id, user_id)
);
CREATE TABLE school_forecasts (
  child_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  blocks_json TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  PRIMARY KEY (child_id, local_date)
);
CREATE INDEX idx_outbox_row ON outbox(table_name, row_id);
