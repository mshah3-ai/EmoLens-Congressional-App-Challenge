-- Migration 003 (Phase 5: in-app forecasting).
-- engine_snapshots: the latest engine run for the screens (forecasts, patterns, time of day, worth watching) and the
--   engine's own state between runs (tau, last good fit). Recomputable at any time; never synced.
-- day_closures.closed_at: the time the "nothing else happened" answer covers up to (SPEC 16). The next-morning
--   follow-up moves it later, so the evening blocks after the check can become calm too. NULL = created_at.
-- alert_responses.followup_done: 1 once the "What did you try?" card after "We stepped in early" was answered or
--   dismissed (SPEC 15.4).
CREATE TABLE engine_snapshots (
  child_id TEXT PRIMARY KEY,
  computed_at TEXT NOT NULL,
  result_json TEXT NOT NULL,
  state_json TEXT NOT NULL
);
ALTER TABLE day_closures ADD COLUMN closed_at TEXT;
ALTER TABLE alert_responses ADD COLUMN followup_done INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_blocks_dirty ON blocks(child_id, dirty, block_start);
CREATE INDEX idx_alerts_block ON alerts(child_id, block_start);
CREATE INDEX idx_responses_alert ON alert_responses(alert_id);
CREATE INDEX idx_fits_time ON model_fits(child_id, fitted_at);
CREATE INDEX idx_weather_time ON weather_hourly(time);
