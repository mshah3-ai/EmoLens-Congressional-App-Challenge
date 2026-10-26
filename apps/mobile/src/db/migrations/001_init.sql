-- Migration 001: every local table from SPEC Section 6.2.
-- "Syncable" tables (the ones Care Team will sync in Phase 7) start with the six standard columns:
-- id (uuidv7), created_at, updated_at, deleted_at (soft delete), created_by, device_id.
-- All times are UTC ISO-8601 strings with milliseconds, e.g. 2026-09-28T19:05:00.000Z.

-- key/value app settings (values are JSON)
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- the child profile (one child per install in v1; schema supports many)
CREATE TABLE children (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  created_by  TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  nickname TEXT NOT NULL,
  birth_year INTEGER,
  home_tz TEXT NOT NULL,
  communication TEXT CHECK (communication IN ('speaking','some_words','minimally_speaking','aac','prefer_not')),
  wake_start TEXT NOT NULL DEFAULT '06:00',
  wake_end   TEXT NOT NULL DEFAULT '22:00',
  typical_sleep_hours REAL,
  episodes_per_week_estimate REAL NOT NULL,
  modeled_episode_types TEXT NOT NULL DEFAULT '["meltdown","shutdown","other"]',
  min_modeled_intensity INTEGER NOT NULL DEFAULT 1,
  school_days TEXT NOT NULL DEFAULT '[1,2,3,4,5]'
);

-- hard moments
CREATE TABLE episodes (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  created_by  TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  child_id TEXT NOT NULL REFERENCES children(id),
  started_at TEXT NOT NULL,
  duration_min INTEGER,
  type TEXT NOT NULL CHECK (type IN ('meltdown','shutdown','other')),
  intensity INTEGER CHECK (intensity BETWEEN 1 AND 5),
  place_id TEXT,
  place_type TEXT,
  antecedent_tags TEXT NOT NULL DEFAULT '[]',
  antecedent_note TEXT,
  behavior_tags TEXT NOT NULL DEFAULT '[]',
  safety_concern INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  details_complete INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('manual','voice','alert_confirm','end_of_day','document','import'))
);
CREATE INDEX idx_episodes_child_time ON episodes(child_id, started_at);

-- calming strategies (defaults seeded from Appendix B + custom)
CREATE TABLE strategies (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  created_by  TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  child_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('sensory','environment','connection','routine','movement','body_needs','preferred_activity','other')),
  is_default INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  onboarding_favorite INTEGER NOT NULL DEFAULT 0
);

-- each use of a strategy
CREATE TABLE strategy_uses (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  created_by  TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  child_id TEXT NOT NULL,
  strategy_id TEXT NOT NULL,
  context TEXT NOT NULL CHECK (context IN ('proactive','during')),
  episode_id TEXT,
  alert_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('helped','not_helped','unsure','averted','not_averted','pending')),
  used_at TEXT NOT NULL
);

-- medications
CREATE TABLE medications (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  created_by  TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  child_id TEXT NOT NULL,
  name TEXT NOT NULL,
  rxcui TEXT,
  strength TEXT,
  form TEXT,
  schedule TEXT NOT NULL DEFAULT '{"times":[],"days":[1,2,3,4,5,6,7]}',
  as_needed INTEGER NOT NULL DEFAULT 0,
  reminders_enabled INTEGER NOT NULL DEFAULT 1,
  active_from TEXT NOT NULL,
  active_to TEXT,
  notes TEXT
);

-- medication history for change detection
CREATE TABLE medication_changes (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  created_by  TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  medication_id TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('start','stop','dose_change','time_change')),
  old_value TEXT,
  new_value TEXT
);

-- doses (scheduled rows are generated daily; as-needed rows created on log)
CREATE TABLE med_doses (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  created_by  TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  medication_id TEXT NOT NULL,
  scheduled_for TEXT,
  taken_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','taken','late','missed','skipped')),
  dose_text TEXT
);
CREATE INDEX idx_doses_sched ON med_doses(medication_id, scheduled_for);

-- meals, snacks, drinks
CREATE TABLE meals (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  created_by  TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  child_id TEXT NOT NULL,
  eaten_at TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack','drink')),
  items TEXT NOT NULL DEFAULT '[]',
  amount TEXT CHECK (amount IN ('little','some','most','all')),
  notes TEXT
);

-- sleep
CREATE TABLE sleep_entries (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  created_by  TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  child_id TEXT NOT NULL,
  sleep_start TEXT NOT NULL,
  sleep_end TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  quality INTEGER CHECK (quality BETWEEN 1 AND 5),
  night_wakings INTEGER,
  source TEXT NOT NULL CHECK (source IN ('manual','healthkit','healthconnect','fitbit','end_of_day')),
  external_id TEXT
);

-- raw physiology samples (local only, never synced)
CREATE TABLE health_samples (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('heart_rate','resting_hr','hrv_sdnn','hrv_rmssd','steps')),
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  source TEXT NOT NULL,
  external_id TEXT UNIQUE
);
CREATE INDEX idx_health_type_time ON health_samples(type, start_at);

-- illness / physical discomfort
CREATE TABLE illness_logs (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  created_by  TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  child_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('cold','fever','stomach','pain','constipation','allergy','dental','ear','injury','other')),
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 3),
  notes TEXT
);

-- manual "unusual day" / routine change
CREATE TABLE routine_changes (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  created_by  TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  child_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  start_at TEXT,
  description TEXT,
  severity INTEGER NOT NULL DEFAULT 2 CHECK (severity BETWEEN 1 AND 3)
);

-- places: coordinates are LOCAL ONLY. Synced copy excludes lat/lon/radius.
CREATE TABLE places (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('home','school','therapy','medical','relative','store_public','park_outdoor','other')),
  latitude REAL, longitude REAL, radius_m REAL DEFAULT 150,
  geofence_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
);

-- place visits (synced with place_type + place label only)
CREATE TABLE place_visits (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  created_by  TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  child_id TEXT NOT NULL,
  place_id TEXT,
  place_type TEXT NOT NULL,
  arrived_at TEXT NOT NULL,
  departed_at TEXT,
  source TEXT NOT NULL CHECK (source IN ('geofence_child_device','geofence_parent','manual','episode','schedule_default'))
);

-- calendar cache: titles LOCAL ONLY
CREATE TABLE calendar_events (
  id TEXT PRIMARY KEY,
  external_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  title TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  ignored INTEGER NOT NULL DEFAULT 0,
  UNIQUE(external_id, start_at)
);

-- weather + air quality (hourly, for the home location)
CREATE TABLE weather_hourly (
  time TEXT PRIMARY KEY,
  temperature_c REAL, pressure_hpa REAL, humidity REAL, precipitation_mm REAL,
  us_aqi REAL, pm2_5 REAL, pollen_index REAL,
  is_forecast INTEGER NOT NULL,
  fetched_at TEXT NOT NULL
);

-- phone "sound check" readings (relative loudness)
CREATE TABLE sound_samples (
  id TEXT PRIMARY KEY,
  measured_at TEXT NOT NULL,
  level_db REAL NOT NULL,
  duration_s INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('phone')),
  place_id TEXT
);

-- room sensors
CREATE TABLE sensor_devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ble_id TEXT NOT NULL UNIQUE,
  firmware_version TEXT,
  place_id TEXT,
  dba_offset REAL NOT NULL DEFAULT 0,
  last_seen_at TEXT,
  last_history_minute INTEGER
);
CREATE TABLE sensor_readings (
  device_id TEXT NOT NULL,
  minute_epoch INTEGER NOT NULL,
  dba_avg REAL, dba_max REAL, temp_c REAL, humidity REAL, lux REAL,
  PRIMARY KEY (device_id, minute_epoch)
);

-- free notes (voice, typed, document)
CREATE TABLE notes (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  created_by  TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  child_id TEXT NOT NULL,
  noted_at TEXT NOT NULL,
  text TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual','voice','document')),
  audio_path TEXT,
  structured_status TEXT CHECK (structured_status IN ('none','pending','accepted','rejected'))
);

-- modeling tables (local; recomputable)
CREATE TABLE blocks (
  child_id TEXT NOT NULL,
  block_start TEXT NOT NULL,
  block_end TEXT NOT NULL,
  local_date TEXT NOT NULL,
  block_index INTEGER NOT NULL,
  label_status TEXT NOT NULL DEFAULT 'unknown' CHECK (label_status IN ('positive','negative_confirmed','intervened','unknown')),
  label_updated_at TEXT,
  dirty INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (child_id, block_start)
);
CREATE TABLE block_features (
  child_id TEXT NOT NULL,
  block_start TEXT NOT NULL,
  feature_version INTEGER NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('actual','forecast')),
  values_json TEXT NOT NULL,
  estimated_json TEXT NOT NULL DEFAULT '[]',
  computed_at TEXT NOT NULL,
  PRIMARY KEY (child_id, block_start, mode)
);
CREATE TABLE model_fits (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  fitted_at TEXT NOT NULL,
  feature_keys TEXT NOT NULL,
  prior_mean TEXT NOT NULL, prior_sd TEXT NOT NULL,
  beta TEXT NOT NULL,
  cov TEXT NOT NULL,
  feature_means TEXT NOT NULL,
  tau REAL NOT NULL,
  log_marginal REAL NOT NULL,
  n_blocks INTEGER NOT NULL, n_positive INTEGER NOT NULL, labeled_days INTEGER NOT NULL,
  converged INTEGER NOT NULL, iterations INTEGER NOT NULL
);
CREATE TABLE predictions (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  block_start TEXT NOT NULL,
  made_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('day_ahead','in_block')),
  p REAL NOT NULL, p_lo REAL NOT NULL, p_hi REAL NOT NULL,
  p_baseline REAL NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('learning','low','moderate','high')),
  reasons_json TEXT NOT NULL,
  model_fit_id TEXT NOT NULL
);
CREATE INDEX idx_pred_block ON predictions(child_id, block_start, kind);

-- alerts and responses
CREATE TABLE alerts (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  created_by  TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  child_id TEXT NOT NULL,
  block_start TEXT NOT NULL,
  prediction_id TEXT,
  scheduled_for TEXT NOT NULL,
  notification_id TEXT,
  confirm_notification_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('scheduled','delivered','cancelled','suppressed'))
);
CREATE TABLE alert_responses (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  created_by  TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  alert_id TEXT NOT NULL,
  response TEXT NOT NULL CHECK (response IN ('happened','stepped_in','calm')),
  responded_at TEXT NOT NULL
);

-- end-of-day closures
CREATE TABLE day_closures (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  created_by  TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  child_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  all_logged INTEGER NOT NULL,
  UNIQUE(child_id, local_date)
);

CREATE TABLE app_errors (
  id TEXT PRIMARY KEY, at TEXT NOT NULL, area TEXT NOT NULL, message TEXT NOT NULL  -- never personal data
);

-- local mirror of cloud block_physio
CREATE TABLE block_physio (
  child_id TEXT NOT NULL, block_start TEXT NOT NULL,
  mean_hr REAL, hr_pre60_mean REAL, resting_hr REAL, hrv REAL, hrv_kind TEXT, steps_day_prior INTEGER,
  created_by TEXT, updated_at TEXT NOT NULL,
  PRIMARY KEY (child_id, block_start)
);

CREATE TABLE digests (
  id TEXT PRIMARY KEY, child_id TEXT NOT NULL, week_start TEXT NOT NULL,
  stats_json TEXT NOT NULL, narrative TEXT, created_at TEXT NOT NULL,
  UNIQUE(child_id, week_start)
);
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY, child_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content_json TEXT NOT NULL, sources_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL
);

-- sync plumbing
CREATE TABLE outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL, row_id TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('upsert','delete')),
  payload_json TEXT NOT NULL, created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE sync_state (table_name TEXT PRIMARY KEY, last_pulled_at TEXT);

-- extra indexes for the Timeline (one day at a time)
CREATE INDEX idx_meals_child_time ON meals(child_id, eaten_at);
CREATE INDEX idx_sleep_child_end ON sleep_entries(child_id, sleep_end);
CREATE INDEX idx_uses_child_time ON strategy_uses(child_id, used_at);
CREATE INDEX idx_notes_child_time ON notes(child_id, noted_at);
CREATE INDEX idx_visits_child_time ON place_visits(child_id, arrived_at);
