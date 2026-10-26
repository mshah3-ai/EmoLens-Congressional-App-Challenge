-- Migration 002 (Phase 4 integrations).
-- calendar_events.user_tagged = 1 when the parent re-tagged or ignored an event by hand, so the next calendar sync
-- keeps their choice instead of re-applying the automatic keyword tags (SPEC 11.3).
ALTER TABLE calendar_events ADD COLUMN user_tagged INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_calendar_start ON calendar_events(start_at);
CREATE INDEX idx_sound_time ON sound_samples(measured_at);
CREATE INDEX idx_sleep_external ON sleep_entries(external_id);
