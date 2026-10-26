# EmoLens

**Understand the patterns behind the hard moments.**

EmoLens is an AI-powered, privacy-first pattern tracker for families of autistic children. Caregivers log meltdowns, shutdowns, and other hard moments in one tap. EmoLens automatically combines those logs with sleep, medications, meals, places, schedule changes, weather, sound levels, and optional wearable/room-sensor data. A personalized Bayesian model then learns *this specific child's* patterns, forecasts higher-risk times of day, explains its reasons, and grows more confident with every day of data and every confirmed prediction.

> EmoLens is built to support autistic children and the people who love them, not to change who they are. EmoLens is **not** a medical device and does not diagnose, treat, or prevent any condition.

---

## Table of Contents

0. [Instructions for the Implementing Agent](#0-instructions-for-the-implementing-agent)
1. [Product Principles and Language Rules](#1-product-principles-and-language-rules)
2. [Human Prerequisites (Accounts, Keys, Hardware)](#2-human-prerequisites-accounts-keys-hardware)
3. [Tech Stack](#3-tech-stack)
4. [Repository Structure](#4-repository-structure)
5. [Environment Variables and Configuration](#5-environment-variables-and-configuration)
6. [Local Data Model (On-Device SQLite)](#6-local-data-model-on-device-sqlite)
7. [Cloud Data Model (Supabase), Roles and Row-Level Security](#7-cloud-data-model-supabase-roles-and-row-level-security)
8. [Onboarding Flow](#8-onboarding-flow)
9. [App Navigation and Screens](#9-app-navigation-and-screens)
10. [Manual Logging Features](#10-manual-logging-features)
11. [Automatic Data Sources](#11-automatic-data-sources)
12. [Time Blocks, Labels, and Feature Engineering](#12-time-blocks-labels-and-feature-engineering)
13. [Forecast Engine (Bayesian Model): Full Math](#13-forecast-engine-bayesian-model-full-math)
14. [Trigger Insights and Confidence Meters](#14-trigger-insights-and-confidence-meters)
15. [Alerts and the Prediction-Confirmation Loop](#15-alerts-and-the-prediction-confirmation-loop)
16. [End-of-Day Check](#16-end-of-day-check)
17. [Strategy Effectiveness Model](#17-strategy-effectiveness-model)
18. [Model Health and Calibration](#18-model-health-and-calibration)
19. [Ask EmoLens (Agentic AI Chat)](#19-ask-emolens-agentic-ai-chat)
20. [Voice Notes and Document Import](#20-voice-notes-and-document-import)
21. [Weekly Digest](#21-weekly-digest)
22. [Reports and Exports (PDF, ABC CSV, FHIR R4, Full Data Export)](#22-reports-and-exports-pdf-abc-csv-fhir-r4-full-data-export)
23. [Care Team and Sync](#23-care-team-and-sync)
24. [Clinician Portal and Share Links](#24-clinician-portal-and-share-links)
25. [EmoLens Room Sensor (Hardware + Firmware + BLE Protocol)](#25-emolens-room-sensor-hardware--firmware--ble-protocol)
26. [Simulator and Validation Study](#26-simulator-and-validation-study)
27. [Privacy, Security, and Consent](#27-privacy-security-and-consent)
28. [Design System, Accessibility, and Localization](#28-design-system-accessibility-and-localization)
29. [Error Handling and Offline Behavior](#29-error-handling-and-offline-behavior)
30. [Testing Plan](#30-testing-plan)
31. [Build, Run, and Deploy](#31-build-run-and-deploy)
32. [Implementation Phases and Definition of Done](#32-implementation-phases-and-definition-of-done)
33. [Appendix A: LLM Prompts and Tool Schemas](#33-appendix-a-llm-prompts-and-tool-schemas)
34. [Appendix B: Default Content (Strategies, Tags, Copy)](#34-appendix-b-default-content-strategies-tags-copy)
35. [Appendix C: Research Background](#35-appendix-c-research-background)

---

## 0. Instructions for the Implementing Agent

Read this entire document before writing code. It is the single source of truth.

**Execution rules**

1. Build in the phase order in [Section 32](#32-implementation-phases-and-definition-of-done). Do not start a phase until the previous phase's acceptance checks pass.
2. The forecast engine (`packages/engine`) is the heart of the product. It must be pure TypeScript with zero runtime dependencies, fully deterministic, and covered by the unit tests in [Section 30](#30-testing-plan). The mobile app, the clinician portal, and the simulator all import the same engine package. Never re-implement engine logic elsewhere.
3. Library APIs change. Before using any third-party library, install it with `npx expo install <pkg>` (mobile) or `pnpm add <pkg>` (other packages), then read that library's current README for the installed version. If an API in this document no longer exists, use the current equivalent and record the substitution in `docs/DECISIONS.md`.
4. When this document says **MUST**, it is a hard requirement. **SHOULD** is strongly recommended. **MAY** is optional.
5. Never fabricate results. The simulator ([Section 26](#26-simulator-and-validation-study)) produces real numbers. If acceptance targets are missed, tune only the documented tunable parameters, rerun, and report actual numbers honestly in `docs/VALIDATION.md`.
6. Where something requires a human (Apple Developer account, API keys, physical devices, soldering), stop and write clear instructions in `docs/HUMAN_TODO.md` instead of guessing.
7. TypeScript `strict: true` everywhere. No `any` except at clearly commented library boundaries.
8. **AI use disclosure (MUST).** Maintain one accurate, current description of the developer's use
   of AI tools and the AI features within the app in `AIDisclosure.md` at the repository root.
   Do not insert boilerplate AI-authorship comments into individual files.
   - Write `docs/ARCHITECTURE_EXPLAINED.md`: a plain-English walkthrough of how each subsystem works, written so a high-school student can study it and explain it to judges.

---

## 1. Product Principles and Language Rules

**Principles**

1. **Local-first and private by default.** All data lives on the device, encrypted. Cloud sync happens only when the owner turns on Care Team. Cloud AI features are opt-in.
2. **Honest uncertainty.** Every prediction and every pattern shows how confident the model is. The app never presents a pattern until evidence thresholds are met ([Section 14](#14-trigger-insights-and-confidence-meters)).
3. **One tap on the worst day.** Logging an episode MUST be possible in at most two taps from the home screen, with details addable later.
4. **Explain everything.** Every risk level shows its top reasons. Every insight has a "How we know this" panel.
5. **Neurodiversity-affirming.** The goal is understanding and reducing the child's distress, not controlling behavior.

**Language rules (MUST be applied to all UI copy, notifications, reports, and LLM prompts)**

| Use | Never use |
|---|---|
| hard moment, meltdown, shutdown, distress, overwhelm | tantrum, outburst, bad behavior, acting out, naughty, aggressive episode (in UI) |
| what helped, calming strategy, support | punishment, consequence (except in the ABC-chart export, where "Consequence" is the standard clinical column name) |
| pattern, possible link, likely link | cause, proves, guaranteed |
| higher chance, forecast | will happen |
| your child / the child's nickname | patient, subject (except in FHIR export) |

- The app refers to the child by the nickname entered in onboarding.
- The app never suggests diagnoses, medication changes, or dosing. When medication patterns appear, copy MUST say "Consider discussing this with your child's prescriber."
- Safety: when an episode is logged with the safety-concern flag, show the Safety Card ([Section 10.1](#101-log-a-hard-moment-episode)).

---

## 2. Human Prerequisites (Accounts, Keys, Hardware)

The agent cannot create these. List them in `docs/HUMAN_TODO.md` with step-by-step instructions.

| Item | Why | Cost |
|---|---|---|
| Mac with Xcode (latest stable) | iOS builds, HealthKit | Existing |
| Apple Developer Program membership | HealthKit entitlement, installing on a physical iPhone, background modes, TestFlight | $99/yr |
| Android Studio + a physical Android phone (optional but recommended) | Health Connect, Android testing | Free |
| Supabase project (free tier OK) | Auth, Postgres, Edge Functions for Care Team, portal, AI proxy | Free tier |
| Anthropic API key | Ask EmoLens, voice-note structuring, digest narrative, session-prep drafts | Pay per use |
| USDA FoodData Central API key | Food search | Free (https://fdc.nal.usda.gov/api-key-signup) |
| Fitbit developer app registration (optional) | Child Fitbit data | Free |
| Vercel account | Host the clinician portal | Free tier |
| Room sensor parts ([Section 25](#25-emolens-room-sensor-hardware--firmware--ble-protocol)) | Optional hardware | About $25 to $40 |
| Expo account + EAS CLI | Development builds | Free tier |

---

## 3. Tech Stack

### 3.1 Mobile app (`apps/mobile`)

- **React Native with Expo** (latest stable SDK), TypeScript, **development builds only** (`expo-dev-client`). Expo Go is NOT supported because HealthKit, Health Connect, BLE, SQLCipher, ML Kit, and whisper.rn need native code.
- Navigation: `expo-router` (file-based routing).
- State: `zustand` for UI state; the local database is the source of truth for data.
- Local database: `@op-engineering/op-sqlite` with **SQLCipher enabled** (encrypted at rest). Encryption key: 32 random bytes generated at first launch, stored with `expo-secure-store` (Keychain/Keystore), never leaves the device.
- IDs: UUIDv7 (`uuidv7` package) for every row.
- Dates: `date-fns` + `date-fns-tz`. Store all instants as UTC ISO-8601 strings; store the child's home IANA time zone in settings.
- Charts: `victory-native` (Skia-based) with `@shopify/react-native-skia`.
- Notifications: `expo-notifications` (local notifications with action categories).
- Background work: `expo-background-task` (or `expo-background-fetch` + `expo-task-manager` if the SDK in use predates it).
- Location: `expo-location` + `expo-task-manager` (geofencing).
- Calendar: `expo-calendar`.
- Health (iOS): `@kingstinct/react-native-healthkit` (has an Expo config plugin, supports observer queries/background delivery).
- Health (Android): `react-native-health-connect` + `expo-health-connect` config plugin.
- BLE: `react-native-ble-plx` + its Expo config plugin.
- Audio recording/metering: `expo-audio` (fallback `expo-av` on older SDKs).
- On-device speech-to-text: `whisper.rn` with a downloaded `ggml-tiny.en` model (optional `ggml-base.en`).
- On-device OCR: `@react-native-ml-kit/text-recognition`.
- Barcode scanning: `expo-camera` (barcode scanner).
- PDF: `expo-print`; sharing: `expo-sharing`; files: `expo-file-system`.
- Biometric lock: `expo-local-authentication`.
- OAuth (Fitbit): `expo-auth-session` (PKCE).
- Cloud: `@supabase/supabase-js` (only used when Care Team or cloud AI is enabled).
- i18n: `i18next` + `react-i18next` + `expo-localization`. Ship **English and Spanish** at launch.
- Testing: `jest`, `@testing-library/react-native`.

### 3.2 Engine (`packages/engine`)

Pure TypeScript, zero runtime dependencies. Contains: linear algebra (Cholesky), Bayesian logistic regression (MAP + Laplace), empirical-Bayes shrinkage, predictions, reason generation, trigger insight classification, beta-binomial models, calibration metrics, seeded RNG, normal CDF. Used by mobile, portal, and simulator.

### 3.3 Shared (`packages/shared`)

Types, zod schemas for every table and API payload, feature definitions registry, i18n string keys, constants.

### 3.4 Cloud (`supabase/`)

Supabase Postgres (with Row-Level Security), Supabase Auth (email magic link + email OTP), Supabase Edge Functions (Deno, TypeScript).

### 3.5 Clinician portal (`apps/portal`)

Next.js (App Router, latest stable), TypeScript, Tailwind CSS, `@supabase/ssr`, `recharts`. Deployed to Vercel.

### 3.6 Simulator (`packages/simulator`) and analysis (`analysis/`)

TypeScript (Node, run with `tsx`) using `packages/engine`. Python 3.11+ with `pandas` + `matplotlib` for figures only.

### 3.7 Firmware (`firmware/`)

ESP32-S3, PlatformIO, Arduino framework, `NimBLE-Arduino`, `Adafruit BME280`, `BH1750` libraries.

---

## 4. Repository Structure

```
emolens/
├── README.md                     # this file
├── AIDisclosure.md
├── LICENSE                       # MIT
├── package.json                  # pnpm workspaces root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .github/workflows/ci.yml
├── apps/
│   ├── mobile/
│   │   ├── app/                  # expo-router routes (see Section 9)
│   │   ├── src/
│   │   │   ├── db/               # op-sqlite setup, migrations, repositories
│   │   │   ├── features/         # loads SQLite rows into ChildDataset, calls engine builders
│   │   │   ├── forecast/         # orchestration: fit, predict, schedule alerts
│   │   │   ├── notifications/
│   │   │   ├── integrations/     # healthkit, healthconnect, fitbit, calendar,
│   │   │   │                     # weather, food, rxnorm, location, ble, audio
│   │   │   ├── ai/               # ask-emolens loop, tool executors, redaction
│   │   │   ├── voice/            # whisper + structuring
│   │   │   ├── reports/          # pdf html templates, abc csv, fhir
│   │   │   ├── sync/             # outbox, push/pull
│   │   │   ├── ui/               # design system components
│   │   │   ├── i18n/             # en.json, es.json
│   │   │   └── store/            # zustand stores
│   │   ├── app.config.ts
│   │   └── eas.json
│   └── portal/
│       ├── app/
│       └── src/
├── packages/
│   ├── engine/
│   │   ├── src/
│   │   │   ├── linalg.ts
│   │   │   ├── stats.ts          # normal cdf, sigmoid, logit, rng
│   │   │   ├── logistic.ts       # MAP fit, Laplace
│   │   │   ├── shrinkage.ts      # empirical Bayes tau selection
│   │   │   ├── predict.ts
│   │   │   ├── reasons.ts
│   │   │   ├── insights.ts
│   │   │   ├── betabinomial.ts
│   │   │   ├── calibration.ts
│   │   │   ├── features/         # pure feature + label builders over ChildDataset
│   │   │   ├── alerts.ts         # pure alert-scheduling decision logic
│   │   │   └── index.ts
│   │   └── test/
│   ├── shared/
│   │   └── src/
│   │       ├── features.ts       # FEATURE_REGISTRY (Section 12.4)
│   │       ├── schemas.ts        # zod
│   │       └── types.ts
│   └── simulator/
│       ├── src/
│       └── scenarios/
├── analysis/
│   ├── requirements.txt
│   └── plots.py
├── supabase/
│   ├── migrations/
│   └── functions/
│       ├── _shared/
│       ├── ai-ask/
│       ├── ai-structure/
│       ├── ai-digest/
│       ├── ai-session-prep/
│       ├── invite-create/
│       ├── invite-accept/
│       ├── share-create/
│       ├── share-view/
│       └── account-delete/
├── firmware/
│   ├── platformio.ini
│   ├── src/main.cpp
│   ├── tools/aweight.py
│   └── enclosure/README.md
└── docs/
    ├── ARCHITECTURE_EXPLAINED.md
    ├── DECISIONS.md
    ├── HUMAN_TODO.md
    ├── VALIDATION.md
    ├── PRIVACY_POLICY.md
    ├── CONSENT_TEMPLATE.md
    ├── QA_CHECKLIST.md
    └── figures/
```

---

## 5. Environment Variables and Configuration

**Mobile (`apps/mobile/.env`, loaded via `app.config.ts` into `expo-constants` extra; only `EXPO_PUBLIC_*` values are readable in JS):**

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_USDA_FDC_API_KEY=
EXPO_PUBLIC_FITBIT_CLIENT_ID=
EXPO_PUBLIC_PORTAL_URL=https://<your-portal>.vercel.app
```

**Supabase Edge Function secrets (`supabase secrets set ...`), NEVER shipped to clients:**

```
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5-5     # verify current model names at https://docs.claude.com/en/docs/about-claude/models
AI_DAILY_REQUEST_LIMIT=60             # per user per day
PORTAL_URL=https://<your-portal>.vercel.app
```

**Portal (`apps/portal/.env.local`):**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

**`app.config.ts` MUST declare:**

- iOS: `NSHealthShareUsageDescription`, `NSLocationWhenInUseUsageDescription`, `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSCalendarsFullAccessUsageDescription` (and legacy `NSCalendarsUsageDescription`), `NSMicrophoneUsageDescription`, `NSCameraUsageDescription`, `NSBluetoothAlwaysUsageDescription`, `NSFaceIDUsageDescription`, `NSSpeechRecognitionUsageDescription` is NOT needed (whisper runs locally).
- iOS `UIBackgroundModes`: `location`, `bluetooth-central`, `fetch`, `processing`.
- iOS entitlement: HealthKit (+ background delivery).
- Android permissions: `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `READ_CALENDAR`, `RECORD_AUDIO`, `CAMERA`, `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM` (request only if needed), Health Connect read permissions for `SleepSession`, `HeartRate`, `RestingHeartRate`, `HeartRateVariabilityRmssd`, `Steps`.
- Usage-description strings (English), e.g. microphone: "EmoLens measures how loud a room is (never records or stores sound) and transcribes voice notes on your phone."

**Engine tunables (in `packages/shared/src/constants.ts`, all documented):**

```ts
export const BLOCK_HOURS = 2;
export const LEARNING_PERIOD_DAYS = 14;         // no alerts before this (unless enabled)
export const RECENCY_HALF_LIFE_DAYS = 90;
export const TAU_GRID = [0.5, 0.75, 1.0, 1.5];
export const MAX_NEWTON_ITERS = 50;
export const NEWTON_TOL = 1e-6;
export const REASON_MIN_CONTRIBUTION = 0.1;     // logit units
export const MAX_ALERTS_PER_DAY_DEFAULT = 3;
export const ALERT_COOLDOWN_MIN = 180;
export const ALERT_LEAD_MIN = 30;
export const CONFIRM_DELAY_MIN = 30;
export const Z80 = 1.2815515655446004;
export const FEATURE_VERSION = 1;
```

---

## 6. Local Data Model (On-Device SQLite)

### 6.1 Conventions

- Database file: `emolens.db`, opened with SQLCipher key from secure store.
- `PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;`
- Migrations: numbered SQL files in `apps/mobile/src/db/migrations/NNN_name.sql`, applied in order inside a transaction, tracked in `schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT)`.
- **Syncable tables** (marked 🔄) include these standard columns, omitted from each listing below for brevity:

```sql
id          TEXT PRIMARY KEY,     -- uuidv7
created_at  TEXT NOT NULL,        -- UTC ISO-8601
updated_at  TEXT NOT NULL,
deleted_at  TEXT,                 -- soft delete
created_by  TEXT NOT NULL,        -- user id, or 'local' in local-only mode
device_id   TEXT NOT NULL
```

- Every write to a syncable table goes through a repository function that (a) sets `updated_at`, (b) appends to `outbox` when Care Team is enabled, (c) marks affected time blocks dirty ([Section 12.6](#126-dirty-tracking-and-recompute)).
- All timestamps are UTC ISO strings with milliseconds (`2026-09-28T19:05:00.000Z`).

### 6.2 Tables

```sql
-- key/value app settings (non-sensitive UI prefs and engine settings)
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- 🔄 the child profile (one child per install in v1; schema supports many)
CREATE TABLE children (
  -- standard columns
  nickname TEXT NOT NULL,
  birth_year INTEGER,                        -- optional; never full birth date
  home_tz TEXT NOT NULL,                     -- IANA zone e.g. 'America/Chicago'
  communication TEXT CHECK (communication IN ('speaking','some_words','minimally_speaking','aac','prefer_not')),
  wake_start TEXT NOT NULL DEFAULT '06:00',  -- local HH:MM, start of modeled day
  wake_end   TEXT NOT NULL DEFAULT '22:00',
  typical_sleep_hours REAL,                  -- from onboarding
  episodes_per_week_estimate REAL NOT NULL,  -- from onboarding (Section 8)
  modeled_episode_types TEXT NOT NULL DEFAULT '["meltdown","shutdown","other"]', -- JSON array
  min_modeled_intensity INTEGER NOT NULL DEFAULT 1,
  school_days TEXT NOT NULL DEFAULT '[1,2,3,4,5]'  -- JSON ISO weekdays (1=Mon)
);

-- 🔄 hard moments
CREATE TABLE episodes (
  child_id TEXT NOT NULL REFERENCES children(id),
  started_at TEXT NOT NULL,
  duration_min INTEGER,                      -- nullable when "add details later"
  type TEXT NOT NULL CHECK (type IN ('meltdown','shutdown','other')),
  intensity INTEGER CHECK (intensity BETWEEN 1 AND 5),
  place_id TEXT,                             -- references places.id (may be null)
  place_type TEXT,                           -- copy of place type at time of log
  antecedent_tags TEXT NOT NULL DEFAULT '[]',-- JSON array of tag keys (Appendix B)
  antecedent_note TEXT,
  behavior_tags TEXT NOT NULL DEFAULT '[]',  -- JSON array (Appendix B)
  safety_concern INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  details_complete INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL CHECK (source IN ('manual','voice','alert_confirm','end_of_day','document','import'))
);
CREATE INDEX idx_episodes_child_time ON episodes(child_id, started_at);

-- 🔄 calming strategies (defaults seeded from Appendix B + custom)
CREATE TABLE strategies (
  child_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('sensory','environment','connection','routine','movement','body_needs','preferred_activity','other')),
  is_default INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  onboarding_favorite INTEGER NOT NULL DEFAULT 0
);

-- 🔄 each use of a strategy
CREATE TABLE strategy_uses (
  child_id TEXT NOT NULL,
  strategy_id TEXT NOT NULL,
  context TEXT NOT NULL CHECK (context IN ('proactive','during')),
  episode_id TEXT,                           -- when context='during'
  alert_id TEXT,                             -- when proactive after an alert
  outcome TEXT NOT NULL CHECK (outcome IN ('helped','not_helped','unsure','averted','not_averted','pending')),
  used_at TEXT NOT NULL
);

-- 🔄 medications
CREATE TABLE medications (
  child_id TEXT NOT NULL,
  name TEXT NOT NULL,                        -- display name chosen from RxNorm or custom
  rxcui TEXT,                                -- RxNorm concept id if selected from search
  strength TEXT,                             -- free text e.g. '5 mg'
  form TEXT,                                 -- tablet, liquid, ...
  schedule TEXT NOT NULL DEFAULT '{"times":[],"days":[1,2,3,4,5,6,7]}', -- JSON local HH:MM
  as_needed INTEGER NOT NULL DEFAULT 0,
  reminders_enabled INTEGER NOT NULL DEFAULT 1,
  active_from TEXT NOT NULL,                 -- local date YYYY-MM-DD
  active_to TEXT,                            -- null = ongoing
  notes TEXT
);

-- 🔄 medication history for change detection
CREATE TABLE medication_changes (
  medication_id TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('start','stop','dose_change','time_change')),
  old_value TEXT,
  new_value TEXT
);

-- 🔄 doses (scheduled rows are generated daily; as-needed rows created on log)
CREATE TABLE med_doses (
  medication_id TEXT NOT NULL,
  scheduled_for TEXT,                        -- null for as-needed
  taken_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','taken','late','missed','skipped')),
  dose_text TEXT
);
CREATE INDEX idx_doses_sched ON med_doses(medication_id, scheduled_for);

-- 🔄 meals, snacks, drinks
CREATE TABLE meals (
  child_id TEXT NOT NULL,
  eaten_at TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack','drink')),
  items TEXT NOT NULL DEFAULT '[]',          -- JSON [{name, source:'off'|'usda'|'custom', code, tags:[...]}]
  amount TEXT CHECK (amount IN ('little','some','most','all')),
  notes TEXT
);

-- 🔄 sleep
CREATE TABLE sleep_entries (
  child_id TEXT NOT NULL,
  sleep_start TEXT NOT NULL,
  sleep_end TEXT NOT NULL,
  duration_min INTEGER NOT NULL,             -- asleep minutes (not time in bed when available)
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

-- 🔄 illness / physical discomfort
CREATE TABLE illness_logs (
  child_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('cold','fever','stomach','pain','constipation','allergy','dental','ear','injury','other')),
  severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 3),
  notes TEXT
);

-- 🔄 manual "unusual day" / routine change
CREATE TABLE routine_changes (
  child_id TEXT NOT NULL,
  local_date TEXT NOT NULL,                  -- YYYY-MM-DD
  start_at TEXT,                             -- optional specific time
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

-- 🔄 place visits (synced with place_type + place label only)
CREATE TABLE place_visits (
  child_id TEXT NOT NULL,
  place_id TEXT,                             -- null for 'away_untagged'
  place_type TEXT NOT NULL,                  -- place type or 'away_untagged'
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
  tags TEXT NOT NULL DEFAULT '[]',           -- JSON: transition|unusual|appointment|school_event|travel|social|no_school
  ignored INTEGER NOT NULL DEFAULT 0,
  UNIQUE(external_id, start_at)
);

-- weather + air quality (hourly, for the home location)
CREATE TABLE weather_hourly (
  time TEXT PRIMARY KEY,                     -- UTC hour
  temperature_c REAL, pressure_hpa REAL, humidity REAL, precipitation_mm REAL,
  us_aqi REAL, pm2_5 REAL, pollen_index REAL,-- pollen_index nullable (region-limited)
  is_forecast INTEGER NOT NULL,
  fetched_at TEXT NOT NULL
);

-- phone "sound check" readings (relative loudness)
CREATE TABLE sound_samples (
  id TEXT PRIMARY KEY,
  measured_at TEXT NOT NULL,
  level_db REAL NOT NULL,                    -- calibrated estimate (see 11.6)
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
  place_id TEXT,                             -- which tagged place it's in
  dba_offset REAL NOT NULL DEFAULT 0,
  last_seen_at TEXT,
  last_history_minute INTEGER               -- last synced minute epoch
);
CREATE TABLE sensor_readings (
  device_id TEXT NOT NULL,
  minute_epoch INTEGER NOT NULL,             -- unix seconds / 60
  dba_avg REAL, dba_max REAL, temp_c REAL, humidity REAL, lux REAL,
  PRIMARY KEY (device_id, minute_epoch)
);

-- 🔄 free notes (voice, typed, document)
CREATE TABLE notes (
  child_id TEXT NOT NULL,
  noted_at TEXT NOT NULL,
  text TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual','voice','document')),
  audio_path TEXT,                           -- local only; null after deletion
  structured_status TEXT CHECK (structured_status IN ('none','pending','accepted','rejected'))
);

-- modeling tables (local; recomputable)
CREATE TABLE blocks (
  child_id TEXT NOT NULL,
  block_start TEXT NOT NULL,                 -- UTC ISO of local block start
  block_end TEXT NOT NULL,
  local_date TEXT NOT NULL,
  block_index INTEGER NOT NULL,              -- 0..11 (local 2h index)
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
  values_json TEXT NOT NULL,                 -- {featureKey: number}
  estimated_json TEXT NOT NULL DEFAULT '[]', -- keys whose values are estimated
  computed_at TEXT NOT NULL,
  PRIMARY KEY (child_id, block_start, mode)
);
CREATE TABLE model_fits (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  fitted_at TEXT NOT NULL,
  feature_keys TEXT NOT NULL,                -- JSON array (order = vector order)
  prior_mean TEXT NOT NULL, prior_sd TEXT NOT NULL,
  beta TEXT NOT NULL,                        -- JSON array
  cov TEXT NOT NULL,                         -- JSON array of arrays
  feature_means TEXT NOT NULL,               -- JSON: weighted training means per feature
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
  p_baseline REAL NOT NULL,                  -- time-of-day-only model probability
  level TEXT NOT NULL CHECK (level IN ('learning','low','moderate','high')),
  reasons_json TEXT NOT NULL,
  model_fit_id TEXT NOT NULL
);
CREATE INDEX idx_pred_block ON predictions(child_id, block_start, kind);

-- 🔄 alerts and responses
CREATE TABLE alerts (
  child_id TEXT NOT NULL,
  block_start TEXT NOT NULL,
  prediction_id TEXT,
  scheduled_for TEXT NOT NULL,
  notification_id TEXT,
  confirm_notification_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('scheduled','delivered','cancelled','suppressed'))
);
CREATE TABLE alert_responses (
  alert_id TEXT NOT NULL,
  response TEXT NOT NULL CHECK (response IN ('happened','stepped_in','calm')),
  responded_at TEXT NOT NULL
);

-- 🔄 end-of-day closures
CREATE TABLE day_closures (
  child_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  all_logged INTEGER NOT NULL,               -- 1 = "nothing else happened today"
  UNIQUE(child_id, local_date)
);

CREATE TABLE app_errors (
  id TEXT PRIMARY KEY, at TEXT NOT NULL, area TEXT NOT NULL, message TEXT NOT NULL  -- never personal data
);

-- local mirror of cloud block_physio (populated by pulls from a Child Device, or computed locally on a child device)
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
```

### 6.3 Settings keys (in `settings`)

| Key | Type | Default |
|---|---|---|
| `mode` | `local_only` \| `account` | `local_only` |
| `device_role` | `caregiver_device` \| `child_device` | `caregiver_device` |
| `alert_sensitivity` | `fewer` \| `balanced` \| `more` | `balanced` |
| `max_alerts_per_day` | int | 3 |
| `quiet_hours` | `{"start":"21:00","end":"07:00"}` | as shown |
| `early_alerts_enabled` | bool (alerts during learning period) | false |
| `end_of_day_time` | `HH:MM` | `20:30` |
| `digest_day_time` | `{"weekday":7,"time":"18:00"}` | Sunday 18:00 |
| `cloud_ai_enabled` | bool | false |
| `ai_share_event_titles` | bool | false |
| `recency_half_life_days` | int | 90 |
| `app_lock` | bool | false |
| `with_child_default` | bool (parent phone location counts as child's) | true |
| `primary_forecaster` | bool: this device creates synced alerts and uploads insight snapshots | true on the owner's first device, false on others |
| `receive_alerts` | bool: schedule notifications for alerts on this device | true for owner, false for others |
| `noise_threshold_db` | number | 70 |
| `morning_outlook` | bool | true |
| `units` | `imperial` \| `metric` | from locale |
| `language` | `en` \| `es` | from locale |
| `weather_lat`,`weather_lon` | rounded to 2 decimals from home place | null |

---

## 7. Cloud Data Model (Supabase), Roles and Row-Level Security

Cloud is used only when the owner creates an account and enables Care Team, or enables cloud AI (which requires an account for abuse prevention).

### 7.1 Roles

| Role | Can log | Can view | Cannot |
|---|---|---|---|
| `owner` (parent/guardian who created the child) | Everything | Everything | n/a |
| `caregiver` (other parent, grandparent, sitter) | Episodes, meds taken, meals, sleep, places, notes, strategies, illness, routine changes, alert responses | Everything except team management | Invite/remove members, delete child, change sharing |
| `teacher` | Episodes, strategy uses, notes, meals (at school) | Today's forecast (school hours), strategies & stats, own logs, episodes logged at school | Medications, sleep, health, home place visits, reports |
| `clinician` (therapist, BCBA, pediatrician) | Clinician notes only | Everything synced, insights, reports | Edit family data |

### 7.2 Postgres schema (`supabase/migrations/0001_init.sql`)

- `profiles(user_id uuid pk references auth.users, display_name text, created_at timestamptz)`
- `children(id uuid pk, owner_id uuid references auth.users, nickname text, birth_year int, home_tz text, communication text, wake_start text, wake_end text, typical_sleep_hours real, episodes_per_week_estimate real, modeled_episode_types jsonb, min_modeled_intensity int, school_days jsonb, created_at, updated_at, deleted_at)`
- `memberships(child_id uuid, user_id uuid, role text check in ('owner','caregiver','teacher','clinician'), status text check in ('active','removed'), created_at, primary key(child_id,user_id))`
- `invites(id uuid pk, child_id uuid, role text, code_hash text, expires_at timestamptz, created_by uuid, accepted_by uuid, accepted_at timestamptz)`
- Mirror tables for every 🔄 local table with identical column names and types (`text` → `text`, JSON text → `jsonb`, timestamps → `timestamptz`, integers → `int`, booleans stored as `int` 0/1 → use `boolean` in Postgres and convert in the sync layer). **Exclusions:** `places` is synced as `places_public(id, child_id, label, type, created_at, updated_at, deleted_at)` with NO coordinates; `calendar_events` is never synced (calendar-based schedule features are computed only on devices with calendar access, normally the primary forecasting device, whose results reach others through `insight_snapshots` and synced `alerts`); `health_samples`, `sound_samples`, `sensor_readings`, `blocks`, `block_features`, `model_fits`, `predictions` are never synced.
- `block_physio(child_id uuid, block_start timestamptz, mean_hr real, hr_pre60_mean real, resting_hr real, hrv real, hrv_kind text check in ('sdnn','rmssd'), steps_day_prior int, created_by uuid, updated_at timestamptz, server_received_at timestamptz default now(), primary key(child_id, block_start))`: per-block physiology summaries uploaded by a Child Device (select: owner, caregiver, clinician; insert/update: owner, caregiver). Mirror locally as table `block_physio` with the same columns (text timestamps); the feature builder uses it when present, otherwise local `health_samples`.
- `insight_snapshots(child_id uuid, computed_at timestamptz, fit_summary jsonb, insights jsonb, worth_watching jsonb, strategies jsonb, model_health jsonb, time_of_day jsonb, primary key(child_id, computed_at))`: uploaded by the child's **primary forecasting device** after each daily fit so the clinician portal can display insights without recomputing (portal lacks local-only data such as weather and sensor readings). Select: owner, caregiver, clinician; insert: owner, caregiver. Keep the latest 60 per child (delete older in the upload function).
- `clinician_notes(id uuid pk, child_id, author_id, body text, kind text check in ('note','session_prep_draft','session_prep_final'), created_at, updated_at, deleted_at)`
- `share_links(id uuid pk, child_id, created_by, token_hash text unique, snapshot jsonb, expires_at timestamptz, revoked_at timestamptz, created_at)`
- `ai_usage(user_id uuid, day date, count int, primary key(user_id, day))`
- Every mirror table: `updated_at` trigger that sets `now()` server-side is NOT used; client `updated_at` is authoritative for last-write-wins, but a `server_received_at timestamptz default now()` column is added and indexed for pull cursors.

### 7.3 Row-Level Security

Enable RLS on every table. Helper SQL functions (security definer, stable):

```sql
create function is_member(c uuid, roles text[]) returns boolean
language sql stable security definer as $$
  select exists (select 1 from memberships m
    where m.child_id = c and m.user_id = auth.uid()
      and m.status = 'active' and m.role = any(roles));
$$;
```

Policies (write one `select`, one `insert`, one `update` policy per table; no client `delete`, deletions are soft via `deleted_at`):

| Table | select | insert/update |
|---|---|---|
| `children` | `is_member(id, '{owner,caregiver,teacher,clinician}')` | owner only |
| `memberships` | members of the child | via edge functions only (service role) |
| `episodes`, `strategy_uses`, `notes` | all four roles; teacher additionally restricted with `and (not is_member(child_id,'{teacher}') or place_type = 'school' or created_by = auth.uid())` | owner, caregiver, teacher |
| `strategies` | all four roles | owner, caregiver |
| `medications`, `medication_changes`, `med_doses`, `sleep_entries`, `illness_logs` | owner, caregiver, clinician | owner, caregiver |
| `meals` | owner, caregiver, clinician; teacher only rows they created | owner, caregiver, teacher |
| `places_public`, `place_visits`, `routine_changes` | owner, caregiver, clinician | owner, caregiver |
| `alerts`, `alert_responses`, `day_closures` | owner, caregiver, clinician | owner, caregiver |
| `clinician_notes` | owner, caregiver, clinician | clinician (author_id = auth.uid()) |
| `share_links` | owner | via edge function |

Write pgTAP or SQL tests (`supabase/tests/rls.sql`) proving a teacher cannot read `medications` and a non-member cannot read anything.

### 7.4 Edge Functions (Deno/TypeScript)

All functions: verify the Supabase JWT (except `share-view`), return JSON, CORS enabled for the portal origin, never log request bodies.

| Function | Purpose |
|---|---|
| `invite-create` | Owner creates invite `{child_id, role}` → returns 8-char code (A–Z, 2–9, no ambiguous chars), stores SHA-256 hash, expires in 7 days |
| `invite-accept` | `{code}` → validates, creates membership, marks invite accepted |
| `ai-ask` | Proxies one Anthropic Messages API call for Ask EmoLens ([Section 19](#19-ask-emolens-agentic-ai-chat)) |
| `ai-structure` | Voice note / document text → structured log JSON ([Section 20](#20-voice-notes-and-document-import)) |
| `ai-digest` | Weekly stats JSON → narrative ([Section 21](#21-weekly-digest)) |
| `ai-session-prep` | Clinician-only: summary JSON → session-prep draft ([Section 24](#24-clinician-portal-and-share-links)) |
| `share-create` | Owner: `{child_id, snapshot, expires_in_days: 7|30}` → token (32 random bytes, base64url); stores SHA-256 hash + snapshot |
| `share-view` | Public: `{token}` → snapshot if not expired/revoked |
| `account-delete` | Deletes all rows owned by user (cascades children they own), removes memberships, deletes auth user |

**AI rate limiting:** every `ai-*` function increments `ai_usage` for `(auth.uid(), current_date)` and returns HTTP 429 with `{error:"daily_limit"}` above `AI_DAILY_REQUEST_LIMIT`.

**Anthropic call (shared helper `_shared/anthropic.ts`):**

```ts
const res = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
  },
  body: JSON.stringify({ model: Deno.env.get("ANTHROPIC_MODEL"), max_tokens, system, messages, tools }),
});
```

Handle non-200 responses by returning `{error:"ai_unavailable"}` with status 502; the client shows a friendly retry message. Verify request/response format against the current API docs at https://docs.claude.com/en/api/overview before implementing.

---

## 8. Onboarding Flow

Implemented under `app/(onboarding)/`. Progress indicator at top. Every step after step 3 has "Skip for now" (settable later in More). Target: under 6 minutes.

1. **Welcome.** App name, tagline, three short value cards (Forecast, Understand, Share with your team), "Get started." Language picker (English/Español).
2. **Who's using EmoLens.** Age gate: "I am 18 or older and a parent, guardian, or caregiver" checkbox (required). Explain EmoLens is used by adults about a child; the child doesn't use the app.
3. **Mode choice.** "Keep everything on this phone" (local-only) or "Create an account" (enables Care Team, clinician sharing, and cloud AI later). Account: email → 6-digit OTP (Supabase Auth). Either way, continue.
4. **About your child.** Nickname (required), birth year (optional), communication style (options per schema), home time zone (auto-detected, editable), usual wake time and bedtime (sets `wake_start`/`wake_end`), typical sleep hours (slider 6–13, default 10).
5. **How often do hard moments happen?** Single choice: "Several times a day" (14/wk), "About once a day" (7/wk), "A few times a week" (3/wk), "About once a week" (1/wk), "Less than once a week" (0.5/wk). Stored as `episodes_per_week_estimate`; sets the intercept prior ([Section 13.3](#133-priors)).
6. **What kinds of hard moments do you want to track?** Multi-select Meltdowns / Shutdowns / Other distress, with one-line plain descriptions. Sets `modeled_episode_types`.
7. **What do you think sets things off?** Multi-select from Appendix B "suspected trigger" list (maps to feature keys). Each selection nudges that feature's prior mean upward ([Section 13.3](#133-priors)). Copy: "EmoLens will check these against real data. It's fine to guess."
8. **What helps?** Multi-select default strategies + add custom. Marks `onboarding_favorite`.
9. **Medications (optional).** Search RxNorm ([Section 10.3](#103-medications)), set schedule times, reminders toggle.
10. **Places.** "Tag the places your child spends time." Home is required if location is allowed: use current location or search address (geocode with `expo-location` `geocodeAsync`). Suggest School, Therapy, Grandparents. Explain coordinates never leave the phone. Then ask: "Whose phone tracks where your child is?" options: "My phone (I'm usually with them)" → `with_child_default=true`; "A phone/tablet my child carries" → instructions to install EmoLens on that device in **Child Device mode** ([Section 11.4](#114-location-and-places)); "I'll set places manually."
11. **Connect data (each optional, each with a clear explanation screen before the OS prompt):** Apple Health / Health Connect, Fitbit, Calendar (choose which calendars), Notifications, Location ("Always" explained; "While Using" accepted with reduced features), Microphone (sound checks), Room Sensor (link to pairing).
12. **Alerts.** Sensitivity (fewer / balanced / more) with examples, max alerts/day, quiet hours, end-of-day check time.
13. **Your starting profile (the "reveal").** An animated summary card: the child's nickname, tracked episode types, suspected triggers "to be tested," favorite strategies, connected data sources, and a timeline graphic: "Days 1–14: learning. Around day 14: first possible patterns. Around day 30+: forecasts get sharper." Button: "Go to Today."

---

## 9. App Navigation and Screens

### 9.1 Route map (`apps/mobile/app/`)

```
(onboarding)/...                 steps from Section 8
(tabs)/_layout.tsx               bottom tabs: Today, Timeline, Insights, Team, More
(tabs)/index.tsx                 Today
(tabs)/timeline.tsx              Timeline
(tabs)/insights/index.tsx        Insights hub
(tabs)/insights/trigger/[key].tsx
(tabs)/insights/watch/[id].tsx   "Worth watching" item detail
(tabs)/insights/strategies.tsx
(tabs)/insights/model-health.tsx
(tabs)/team/index.tsx
(tabs)/more/index.tsx
log/episode.tsx                  modal sheet
log/meal.tsx, log/med.tsx, log/sleep.tsx, log/place.tsx, log/illness.tsx,
log/routine.tsx, log/note.tsx, log/voice.tsx, log/document.tsx, log/strategy.tsx
confirm/[alertId].tsx            prediction confirmation
end-of-day/[date].tsx
ask/index.tsx                    Ask EmoLens chat
digest/[weekStart].tsx
reports/index.tsx
settings/*                       child, medications, places, data-sources, sensor,
                                 alerts, privacy, ai, language, about, disclosures
```

When `device_role = child_device`, the app shows ONLY a status screen (connected care team, last sync, location + health permissions status, battery tip) and runs background collection. No logs, no insights.

### 9.2 Today (`(tabs)/index.tsx`)

Top to bottom:

1. **Header:** "Good afternoon" + child nickname + date. App-lock icon if enabled.
2. **Learning banner** (only during the learning period): "EmoLens is learning [Nickname]'s patterns: day 6 of about 14" with progress bar.
3. **Day risk strip:** one segment per awake block (e.g. 6–8, 8–10, …, 20–22). Each segment shows the level (Low/Moderate/High/Learning) with color + icon + text label (never color alone). Past blocks show outcome icons (episode ⚡, stepped in 🤝, calm ✓, unknown ·). Tap a segment → block detail sheet.
4. **Now card:** current block's risk percentage (e.g. "18% chance"), 80% range ("likely between 11% and 27%"), level badge, comparison to typical ("about 2× this child's usual for this time"), top reasons (max 3, from [Section 13.8](#138-reasons)), "expected" tag on estimated inputs, and "Ideas that have helped" (top 2 strategies, [Section 17](#17-strategy-effectiveness-model)) with a "We're trying this" button that logs a proactive strategy use.
5. **Pending confirmations** card(s): "How did 2–4 pm go?" with three buttons ([Section 15.4](#154-confirmation)).
6. **Quick add row:** Meal, Med, Sleep, Place, Note, Voice, Sound check, Illness, Routine change.
7. **Medication due** card when a scheduled dose is pending within ±60 min: "Mark taken" / "Skip".
8. **Data sources status** chips (Health ✓, Calendar ✓, Weather ✓, Sensor ⚠ "not seen for 3 h").
9. **Floating action button (FAB):** large "Log hard moment" button, always visible, bottom-right above tabs.

### 9.3 Timeline (`(tabs)/timeline.tsx`)

- Day picker (swipe between days, calendar button). Vertical chronological list of all entries for the day: episodes, strategy uses, med doses, meals, sleep, place visits, calendar transitions (titles shown only locally), illness, routine changes, notes, alert/response, sensor summary per block ("Living room: loud for 40 min").
- Filter chips by type. Every entry tappable → edit screen; swipe to delete (soft delete, undo toast 5 s).
- Search bar (full-text over notes, antecedent notes, meal items, medication names).

### 9.4 Insights hub (`(tabs)/insights/index.tsx`)

Sections:

1. **Ask EmoLens** entry bar ("Ask about [Nickname]'s patterns…"). Hidden if cloud AI disabled; shows "Turn on AI features" instead.
2. **Patterns** list: every trigger feature with a status other than hidden ([Section 14](#14-trigger-insights-and-confidence-meters)), sorted Strong → Likely → Possible → Seems protective → No clear link → Not enough data. Each row: plain-language title ("Shorter sleep"), status badge, confidence meter (0–100 bar), effect sentence ("About 2.1× the usual chance after 2 fewer hours of sleep").
3. **Worth watching:** specific foods, medications, places, and calendar-tag categories from the item-level model ([Section 14.5](#145-item-level-worth-watching-analysis)).
4. **Time-of-day pattern:** bar chart of observed episode rate per block index with posterior interval whiskers.
5. **What helps:** link to Strategies screen.
6. **Model health:** link, showing the current skill score as a headline.

### 9.5 Trigger detail (`insights/trigger/[key].tsx`)

- Title, status, confidence meter with explanation "How sure is EmoLens?"
- Effect statement with 80% range.
- Chart 1: episode rate in blocks with vs without the factor (bar pair with interval whiskers from beta posteriors).
- Chart 2: how the estimate changed over time (effect odds ratio and 80% band per weekly refit, from `model_fits` history).
- Evidence counts: "Seen in 46 time blocks; hard moments in 11 of them. Compared with 212 blocks without it; hard moments in 19."
- "How we know this" expandable text (template in Appendix B) explaining the Bayesian updating in plain language.
- If medication-related: "Consider discussing this with your child's prescriber."

### 9.6 Strategies (`insights/strategies.tsx`)

Two tabs: "Before a hard moment" (proactive) and "During a hard moment." Each strategy row: name, "Helped 6 of 7 times," posterior mean bar with 80% interval, last used. Toggle "Help me discover what works" (enables Thompson sampling suggestions, [Section 17](#17-strategy-effectiveness-model)). Add/edit/archive strategies.

### 9.7 Model health (`insights/model-health.tsx`)

See [Section 18](#18-model-health-and-calibration): skill score, Brier score, reliability diagram, alert outcome breakdown, days of labeled data, last fit time, "Refit now" button.

### 9.8 Team (`(tabs)/team/index.tsx`)

- Local-only mode: explanation + "Create account to invite your team."
- Account mode: member list with role badges; "Invite" (choose role → shows code + share sheet with message template and portal link for clinicians); remove member (owner); activity feed (last 50 synced entries by others: "Ms. Lopez logged a hard moment at school, 11:20"); sync status + "Sync now."
- Share links manager (owner): create read-only report link (choose date range + expiry 7/30 days), list, revoke.

### 9.9 More (`(tabs)/more/index.tsx`)

Rows: Child profile · Medications · Places · Data sources · Room sensor · Alerts & quiet hours · End-of-day check · Weekly digests · Reports & export · AI features · Privacy & security (app lock, export all data, delete all data) · Language · Device role · About & disclaimers · AI disclosure (renders `AIDisclosure.md`).

### 9.10 Demo mode

More → "Demo mode" opens a separate, clearly bannered profile ("DEMO DATA: not a real child") stored in a separate database file `emolens-demo.db`. It is populated by running the simulator's default scenario for one synthetic family (120 days, fixed seed) through the same engine, so every screen (patterns, forecasts, model health, digest, reports) can be demonstrated immediately (for the competition video and judges) without waiting weeks for real data. Exiting demo mode returns to the real profile untouched. Demo data never syncs and cloud AI calls from demo mode are allowed (they use only synthetic data).

---

## 10. Manual Logging Features

All log sheets are bottom-sheet modals with a sticky "Save" button, default values prefilled, and time pickers defaulting to "now" (editable, including past times up to 7 days). Saving triggers: repository write → dirty-block marking → background recompute (debounced 2 s) of features, labels, and in-block prediction.

### 10.1 Log a hard moment (episode)

**Fast path (MUST, at most 2 taps):** Tap FAB → sheet opens with type preselected to the most-used type and time = now → tap "Save now, add details later." Saves with `details_complete = 0` and schedules a local notification 45 minutes later: "When things are calm, add a few details about the hard moment at 3:10 pm?" (deep link to edit).

**Full form fields:**

| Field | UI | Required |
|---|---|---|
| Type | Segmented: Meltdown / Shutdown / Other distress | Yes |
| Started | Time picker, default now | Yes |
| Duration | Chips 5 / 15 / 30 / 60 min / Custom | No |
| Intensity | 1–5 scale with labels: 1 Mild, 2 Noticeable, 3 Strong, 4 Very strong, 5 Most intense | No (default 3 when details added) |
| Where | Auto-filled from current place visit; picker of tagged places + "Somewhere else" | No |
| What was happening before | Antecedent tag chips (Appendix B) + free text | No |
| What it looked like | Behavior tag chips (Appendix B) | No |
| What helped | Strategy chips; each selected gets Helped / Didn't help / Not sure | No |
| Safety concern | Toggle "Someone was hurt or at risk" | No |
| Notes | Multiline text | No |

- **Safety Card:** if safety concern is on, after saving show a card: "If anyone is in immediate danger, call 911. For ongoing safety concerns, contact your child's care team." Plus a "Log follow-up note" button. No other interruption.
- Photos of the child are NOT allowed anywhere in the app.
- If an alert exists for the block containing `started_at` with no response, set its response to `happened` automatically (still editable).
- Strategy uses created with `context='during'`.

### 10.2 Strategies (standalone proactive use)

"We're trying this" button (Today card) or Log → Strategy: pick strategy, time. Creates `strategy_uses` with `context='proactive'`, `outcome='pending'`. Outcome resolved automatically at block end: if an episode starts within 90 minutes after `used_at` → `not_averted`, otherwise `averted` (if the block is labeled; if the block stays `unknown`, outcome stays `pending` and is excluded).

### 10.3 Medications

- **Search:** RxNorm REST API (no key): `GET https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term={q}&maxEntries=10` → rxcui candidates; resolve names via `GET https://rxnav.nlm.nih.gov/REST/rxcui/{rxcui}/properties.json`. Debounce 300 ms, cache results locally. "Can't find it? Add custom name."
- **Add/edit medication:** name, strength (free text), form, schedule times (0–6 times/day) and days, as-needed toggle, reminders toggle, start date, notes. Every add/stop/dose-change/time-change writes `medication_changes`.
- **Dose rows:** at local midnight (and on app open for any missing days), create `med_doses` rows with `status='pending'` for each scheduled time today.
- **Status rules:** taken within ±60 min of scheduled → `taken`; taken 60–240 min late → `late`; not marked by +240 min → `missed` (auto-set by the recompute job); user can mark `skipped` (intentional).
- **Reminders:** local notification at each scheduled time with actions "Taken" / "Skip" (category `MED_DOSE`). As-needed doses logged via Log → Med.

### 10.4 Meals and drinks

- Meal type chips, time, amount eaten (little/some/most/all), items.
- **Barcode scan:** `expo-camera` → Open Food Facts `GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json?fields=product_name,brands,categories_tags,nutriments,additives_tags`. Set a descriptive `User-Agent` header per Open Food Facts API terms: `EmoLens/1.0 (contact email from settings)`.
- **Text search:** USDA FoodData Central `GET https://api.nal.usda.gov/fdc/v1/foods/search?query={q}&pageSize=15&api_key={key}`.
- **Recent & favorites:** the 12 most-logged items appear as one-tap chips.
- **Automatic item tags** (stored in `items[].tags`), computed from available data: `high_sugar` (sugars ≥ 15 g per serving or ≥ 22.5 g/100 g), `caffeine` (name/category/ingredients contains caffeine, coffee, cola, energy drink, tea), `artificial_color` (OFF additives E100–E199 artificial colors or names like "Red 40," "Yellow 5," "Yellow 6," "Blue 1"), `new_food` (item never logged before), plus user-assignable tags.

### 10.5 Sleep (manual)

Bedtime, wake time, night wakings count, quality 1–5. Shown only if no automatic sleep source, or as an override. The end-of-day check asks for bedtime if no source exists, and the morning Today screen shows "How did [Nickname] sleep?" card until sleep for last night exists.

### 10.6 Places (manual check-in)

One-tap buttons for each tagged place + "Away / somewhere else." Creates `place_visits` with `source='manual'`, closing any open visit.

### 10.7 Illness and discomfort

Kind chips (cold, fever, stomach, pain, constipation, allergy, dental, ear, injury, other), severity 1–3, start (default now), "still ongoing" toggle. Ongoing illnesses show on Today with "Mark better" button.

### 10.8 Routine change

"Something's different today" → description (optional), severity 1–3, optional time. Examples shown: substitute teacher, visitors, travel, schedule change, new place.

### 10.9 Notes

Free text with timestamp. Searchable. Voice notes and document import are in [Section 20](#20-voice-notes-and-document-import).

---

## 11. Automatic Data Sources

Each integration is a module in `src/integrations/` exposing `isAvailable()`, `requestPermission()`, `sync(since: Date)`, `status()`. A **Data sources** settings screen lists all modules with status, last sync time, and enable/disable toggles. All syncs are idempotent (upsert by `external_id`).

### 11.1 Apple Health (iOS) and Health Connect (Android)

**Whose data?** Health data belongs to the device where EmoLens is installed. Supported setups, explained in-app:
(a) the child has their own phone/tablet/watch paired to a device running EmoLens in Child Device mode;
(b) a child's Fitbit via [Section 11.2](#112-fitbit-optional);
(c) manual sleep entry.

**Read types:**

| Concept | HealthKit | Health Connect |
|---|---|---|
| Sleep | `HKCategoryTypeIdentifierSleepAnalysis` (sum asleep stages; exclude in-bed/awake) | `SleepSession` (sum non-awake stages) |
| Heart rate | `HKQuantityTypeIdentifierHeartRate` | `HeartRate` |
| Resting HR | `HKQuantityTypeIdentifierRestingHeartRate` | `RestingHeartRate` |
| HRV | `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` (→ `hrv_sdnn`) | `HeartRateVariabilityRmssd` (→ `hrv_rmssd`) |
| Steps | `HKQuantityTypeIdentifierStepCount` | `Steps` |

**Sync:** on app open, on background task, and via HealthKit observer queries with background delivery for heart rate and sleep (where supported by the library). Initial sync pulls 60 days. Sleep sessions become `sleep_entries` (a night = sessions ending between 03:00 and 13:00 local, merged if gaps < 90 min).

### 11.2 Fitbit (optional)

- OAuth 2.0 Authorization Code with PKCE via `expo-auth-session`, scopes `sleep heartrate activity`. Tokens stored in `expo-secure-store`; refresh when expired.
- Endpoints (verify current availability; Fitbit's Web API may be migrating, record any change in `docs/DECISIONS.md`): sleep `GET /1.2/user/-/sleep/date/{yyyy-MM-dd}.json`; resting heart rate `GET /1/user/-/activities/heart/date/{date}/1d.json`; HRV `GET /1/user/-/hrv/date/{date}.json`; steps `GET /1/user/-/activities/steps/date/{date}/1d.json`.
- Note in UI and `docs/HUMAN_TODO.md`: child (Fitbit Ace / family) accounts may restrict third-party API access; verify with a real account.

### 11.3 Calendar

- `expo-calendar`: user selects which calendars to read. Sync events from 30 days ago to 14 days ahead, every app open and background task.
- **Auto-tagging rules** (case-insensitive keyword match on title; user can re-tag or ignore any event, and can add their own keywords):
  - `appointment`: doctor, dentist, therapy, OT, speech, ABA, appointment, checkup, vaccine, haircut
  - `unusual`: party, trip, travel, visit, guests, sub, substitute, field trip, assembly, picture day, test, recital, game
  - `no_school`: no school, holiday, break, day off, teacher institute, snow day
  - `travel`: flight, airport, road trip, hotel
  - `social`: birthday, playdate, party, sleepover
  - `school_event`: school, class, conference, IEP
  - Every non-all-day event is also tagged `transition` unless ignored.
- Titles stay on-device. Only tags feed the model and AI (unless `ai_share_event_titles`).

### 11.4 Location and places

- **Geofencing:** `Location.startGeofencingAsync(TASK_NAME, regions)` with one region per tagged place (`radius_m`, max 20 regions). The background task writes `place_visits` on enter (open visit) and exit (close visit; if no other region contains the device, open an `away_untagged` visit).
- **Source priority for the child's location** (used by feature builder): `geofence_child_device` > `manual` > `episode` place > `geofence_parent` (only if `with_child_default` is true, or a "With [Nickname]" toggle on Today is on) > `schedule_default` (most common place type for that weekday/block over the last 4 weeks).
- **Child Device mode:** EmoLens installed on the child's device, joined to the Care Team with role `caregiver` but `device_role = child_device`. It collects geofence visits and health samples and syncs derived `place_visits` and `sleep_entries`. Raw health samples never sync; instead the child device computes per-block physiology summaries and syncs them to the cloud table `block_physio` ([Section 7.2](#72-postgres-schema-supabasemigrations0001_initsql)), which caregiver devices pull and use as their physiology source.
- Weather coordinates = home place rounded to 2 decimals.
- If the user grants only "While Using" permission, geofencing is disabled and the app relies on manual check-ins; show a one-time explanation.

### 11.5 Weather, air quality, pollen

- **Weather:** Open-Meteo (free, no key) `GET https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&hourly=temperature_2m,surface_pressure,relative_humidity_2m,precipitation&past_days=3&forecast_days=3&timezone=UTC`.
- **Air quality + pollen:** `GET https://air-quality-api.open-meteo.com/v1/air-quality?latitude={lat}&longitude={lon}&hourly=us_aqi,pm2_5,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&past_days=3&forecast_days=3&timezone=UTC`. Pollen values are only available in some regions (e.g. Europe); if all pollen values are null, set `pollen_index = null` and mark the pollen feature "not available in your area."
- `pollen_index` = max of available pollen values normalized: 0 none, 1 low (<20), 2 moderate (20–100), 3 high (>100) grains/m³.
- Refresh every 3 h when the app runs, and in background tasks. Keep 120 days of history.

### 11.6 Phone sound check

- Foreground only (iOS does not allow continuous background microphone use for this purpose). Triggered by: "Sound check" quick-add (records 30 s of metering), and automatically for 60 s when the episode log sheet is opened (if mic permission granted and setting enabled).
- Implementation: start a recording with metering enabled, sample metering every 250 ms, **discard the audio file immediately**; store only the average level.
- Metering is dBFS (≤ 0). Store `level_db = dBFS + phone_offset`, where `phone_offset` defaults to 90 (rough estimate) and is calibrated automatically if a room sensor is present in the same place (offset = median(sensor dBA − phone dBFS) over ≥ 3 simultaneous checks). UI labels phone readings "estimated loudness."

### 11.7 Room sensor

See [Section 25](#25-emolens-room-sensor-hardware--firmware--ble-protocol). The BLE module connects on app launch and whenever iOS/Android wakes the app for BLE, sets device time, reads history since `last_history_minute`, and subscribes to live readings while connected.

### 11.8 Background execution

- Register one background task `emolens-refresh` (minimum interval 30 min, OS decides actual timing). It runs, within a 25-second budget, in this order: weather refresh (if stale), health sync, calendar sync, missed-dose status update, feature recompute for dirty blocks, model refit if due, forecast + alert scheduling.
- Because background timing is not guaranteed, alerts are **pre-scheduled local notifications** ([Section 15](#15-alerts-and-the-prediction-confirmation-loop)), recomputed every time the app gets any execution time.

---

## 12. Time Blocks, Labels, and Feature Engineering

**Where this code lives:** block construction, labeling, feature building, forecast-mode estimation, and alert-decision logic are implemented as **pure functions in `packages/engine/src/features/` and `packages/engine/src/alerts.ts`**, operating on a plain `ChildDataset` object (arrays of episodes, doses, meals, sleep, visits, calendar tags, weather, sensor minutes, physiology, settings). The mobile app queries SQLite into a `ChildDataset`; the simulator generates one directly. This guarantees the simulator validates the exact code the app runs.

### 12.1 Time blocks

- Each local calendar day is divided into 12 blocks of 2 hours: block index `k` covers local wall-clock `[2k:00, 2k+2:00)`.
- **Awake blocks** are blocks overlapping the child's wake window `[wake_start, wake_end)` by at least 60 minutes. Only awake blocks are modeled, forecast, and shown on Today.
- Convert local block boundaries to UTC with `date-fns-tz` (`fromZonedTime`) in the child's `home_tz`. On DST transition days a block may be 1 or 3 hours long; features that count minutes are normalized per 2 hours (`value × 120 / block_minutes`).
- Blocks rows are created lazily for every local date from the first log date through tomorrow.

### 12.2 Labels (outcome for each block)

Evaluated in priority order for each awake block:

1. **`positive`**: at least one non-deleted episode with `started_at ∈ [block_start, block_end)`, `type ∈ modeled_episode_types`, and (`intensity` is null OR `intensity ≥ min_modeled_intensity`).
2. **`intervened`**: an alert for this block has response `stepped_in` (and rule 1 did not fire).
3. **`negative_confirmed`**: an alert for this block has response `calm`, OR a `day_closures` row exists for the block's local date with `all_logged = 1` and the closure time is after `block_end`.
4. **`unknown`**: otherwise.

**Training weights:** `positive` and `negative_confirmed` blocks get weight `w_i = 0.5^(age_days_i / H)` where `age_days_i` = days between block start and now and `H = recency_half_life_days`. **`intervened` and `unknown` blocks get weight 0** (excluded).

> **Why "intervened" is excluded (the intervention trap):** if EmoLens warns a parent and the parent successfully steps in, no episode happens. Counting that block as a negative would teach the model its warnings were wrong, so the more useful the app became, the worse its forecasts would get. Excluding these blocks from the risk model, and instead crediting them to the strategy model ([Section 17](#17-strategy-effectiveness-model)), avoids this bias. The simulator demonstrates the effect ([Section 26](#26-simulator-and-validation-study)).

### 12.3 Leakage rule

A meltdown can itself change the data (a loud room, a sudden trip home, a racing heart). To avoid "predicting" an episode from its own effects, **every feature uses only information from before `block_start`**, with one exception: *planned* schedule information about the block (calendar events, which are known in advance). Sensor and physiology features use the 90 minutes (sound/temperature) or 60 minutes (heart rate) *before* the block. Document this rule in `ARCHITECTURE_EXPLAINED.md`.

### 12.4 Feature registry (`packages/shared/src/features.ts`)

```ts
export interface FeatureDef {
  key: string;
  group: 'baseline' | 'sleep' | 'food' | 'medication' | 'schedule' | 'place' | 'sensory' | 'weather' | 'health' | 'physiology' | 'missingness';
  isTrigger: boolean;          // appears in Insights "Patterns"
  unit: number;                // "meaningful change" u used in effect statements
  priorMean: number;           // logit units per 1 feature unit
  priorSd: number;
  requires: DataRequirement;   // see 12.5
  labelKey: string;            // i18n key for display name
  phraseKey: string;           // i18n key for effect phrase, e.g. "after {u} fewer hours of sleep"
}
```

**Baseline and missingness features (`isTrigger = false`):**

| Key | Definition | Prior mean | Prior sd |
|---|---|---|---|
| `intercept` | Always 1 | `logit(p0)`, `p0 = clamp(episodes_per_week_estimate / (7 × n_awake_blocks_per_day), 0.005, 0.5)` | 1.0 |
| `tod_midday` | 1 if local block start hour ∈ [10, 14) | 0 | 0.5 |
| `tod_afternoon` | 1 if hour ∈ [14, 18) | 0 | 0.5 |
| `tod_evening` | 1 if hour ∈ [18, 24) | 0 | 0.5 |
| `weekend` | 1 if local weekday is Sat/Sun | 0 | 0.4 |
| `school_day` | 1 if weekday ∈ `school_days` and no `no_school` calendar tag that day | 0 | 0.4 |
| `recent_episode` | 1 if a positive-qualifying episode started in the 4 h before `block_start` | 0.4 | 0.4 |
| `sleep_missing` | 1 if no sleep entry for last night | 0 | 0.5 |
| `meal_missing` | 1 if meals feature enabled but nothing logged in the 12 h before `block_start` | 0 | 0.5 |
| `noise_missing` | 1 if sensory features enabled but no sound data in the 90-min window | 0 | 0.3 |
| `physio_missing` | 1 if physiology features enabled but no HR data in the 60-min window | 0 | 0.3 |

(Morning, i.e. hours < 10, is the reference time-of-day category.)

**Trigger features (`isTrigger = true`).** `clamp(v, a, b)` limits to `[a, b]`. All windows end at `block_start` unless stated.

| Key | Group | Definition | u | Prior mean | Prior sd |
|---|---|---|---|---|---|
| `sleep_deficit` | sleep | `clamp(sleepRef − lastNightHours, 0, 4)`; `sleepRef` = median asleep hours of last 28 nights (needs ≥ 7 nights, else `typical_sleep_hours`); last night = sleep entry whose end falls on this local date. Missing → 0 and `sleep_missing = 1` | 2 | 0.25 | 0.25 |
| `night_wakings` | sleep | `clamp(night_wakings, 0, 4)` for last night; missing → 0 | 2 | 0.10 | 0.20 |
| `hunger_gap` | food | `clamp(hoursSinceLastMealOrSnack − 3, 0, 3)` (drinks excluded unless tagged as food) | 2 | 0.15 | 0.25 |
| `high_sugar_recent` | food | 1 if an item tagged `high_sugar` eaten in previous 3 h | 1 | 0.0 | 0.30 |
| `caffeine_recent` | food | 1 if an item tagged `caffeine` in previous 6 h | 1 | 0.10 | 0.30 |
| `missed_dose` | medication | `clamp(count of doses with status missed and scheduled_for in previous 24 h, 0, 2)` | 1 | 0.30 | 0.35 |
| `late_dose` | medication | 1 if any dose with status late scheduled in previous 12 h | 1 | 0.10 | 0.30 |
| `med_change_recent` | medication | `clamp(Σ exp(−daysSince/7))` over `medication_changes` in the previous 21 days, clamped to [0, 2] | 1 | 0.20 | 0.35 |
| `planned_transitions` | schedule | `clamp(count of non-ignored calendar events tagged transition starting in [block_start − 30 min, block_end), 0, 3)` | 1 | 0.20 | 0.25 |
| `arrival_recent` | place | 1 if a place visit began in [block_start − 60 min, block_start) | 1 | 0.15 | 0.25 |
| `unusual_day` | schedule | 1 if a `routine_changes` row for this local date, or a calendar event tagged unusual/travel/social that day, or `no_school` on a school-days weekday | 1 | 0.30 | 0.35 |
| `appointment_near` | schedule | 1 if an `appointment`-tagged event overlaps [block_start − 2 h, block_end + 2 h) | 1 | 0.25 | 0.35 |
| `new_place` | place | 1 if the child's place at `block_start` is `away_untagged` or a place with < 3 prior visits | 1 | 0.25 | 0.35 |
| `place_school` | place | 1 if place type at `block_start` = school | 1 | 0 | 0.5 |
| `place_therapy_medical` | place | 1 if therapy or medical | 1 | 0 | 0.5 |
| `place_store_public` | place | 1 if store_public or park_outdoor | 1 | 0 | 0.5 |
| `place_other` | place | 1 if relative or other | 1 | 0 | 0.5 |
| `noise_high` | sensory | minutes in [block_start − 90 min, block_start) with sound ≥ `noise_threshold_db` (setting, default 70) at the child's current place (sensor preferred, phone samples otherwise), `/30`, clamped [0, 3] | 1 | 0.15 | 0.25 |
| `temp_uncomfortable` | sensory | mean indoor sensor temp over same window: `clamp((|t − 21.5| − 2)/2, 0, 2)`; missing → 0 | 1 | 0.05 | 0.25 |
| `pressure_change` | weather | `clamp(|P(block_start) − P(block_start − 6 h)| / 3, 0, 3)` hPa | 1 | 0.05 | 0.20 |
| `heat_or_cold` | weather | outdoor T at block start: `clamp(max(0,(T−30)/5) + max(0,(−5−T)/5), 0, 2)` °C | 1 | 0.05 | 0.25 |
| `poor_air` | weather | `clamp(max(0,(us_aqi − 100)/50), 0, 3)` | 1 | 0.05 | 0.25 |
| `pollen_high` | weather | 1 if `pollen_index ≥ 2`; feature disabled if pollen unavailable | 1 | 0.05 | 0.25 |
| `illness` | health | max severity/3 of illness active at `block_start` or ended within previous 24 h | 1 | 0.50 | 0.40 |
| `low_activity_yesterday` | health | 1 if yesterday's steps < 50 % of 14-day median steps | 1 | 0.10 | 0.25 |
| `resting_hr_up` | physiology | `clamp((restingHR_today − median14d)/5, −2, 3)` | 1 | 0.10 | 0.20 |
| `hrv_down` | physiology | `clamp((median14d − latestHRV)/(0.15 × median14d), −2, 3)` | 1 | 0.10 | 0.20 |
| `hr_elevated_pre` | physiology | `clamp((meanHR in previous 60 min − median HR for this block index over 14 days)/10, −2, 3)` | 1 | 0.15 | 0.20 |

**Parent-suspected triggers:** for each feature the parent selected in onboarding step 7, `priorMean += 0.15`. (Mapping from Appendix B suspected-trigger options to feature keys.)

### 12.5 Feature enabling (data requirements)

A feature is included in a fit only if its data source is actually in use. Otherwise it is excluded from the vector (not zero-filled) and shown in Insights as "Not tracked" with a link to enable the source.

| Group | Enabled when |
|---|---|
| sleep | ≥ 7 nights with sleep entries in last 28 days |
| food | meals logged on ≥ 50 % of the last 14 days |
| medication | ≥ 1 medication with schedule |
| schedule (calendar parts) | calendar connected (routine_changes always counts toward `unusual_day`) |
| place | ≥ 1 tagged place and place visits exist on ≥ 50 % of last 14 days |
| sensory | sound data on ≥ 7 of last 28 days |
| weather | home coordinates set |
| health `low_activity_yesterday` | steps data ≥ 14 days |
| physiology | HR data (or `block_physio`) on ≥ 7 of last 14 days |
| missingness indicators | enabled iff their parent group is enabled |

### 12.6 Dirty tracking and recompute

- Any change to source data with timestamp `t` marks blocks with `block_start ∈ [t − 24 h, t + 24 h]` dirty. `medication_changes` marks `[t, t + 21 d]`. Settings changes affecting features (wake window, school days, noise threshold, modeled types) mark everything dirty.
- The recompute job processes dirty blocks (oldest first, cap 3000 per run), computes `actual` features and labels, clears `dirty`.
- `FEATURE_VERSION` change → mark all blocks dirty.

### 12.7 Forecast-mode features (day-ahead and upcoming blocks)

For future blocks, unknown inputs are estimated and the keys added to `estimated_json`:

| Input | Estimate |
|---|---|
| Last night's sleep | Actual if available; else `sleepRef` (deficit 0) |
| Meals | Typical time per meal type = median local time over last 14 days (needs ≥ 5 samples) |
| Doses | Pending scheduled doses assumed taken on time |
| Place at block start | Planned: calendar-implied place if any; else the most common place type at that (weekday, block index) over the last 4 matching weekdays; else home |
| Arrival | 1 if expected place differs from the expected place in the previous block |
| Sound, indoor temperature | Median for this block index over last 14 days |
| Weather, air, pollen | Open-Meteo forecast values |
| Resting HR, HRV | Latest known values |
| `hr_elevated_pre` | 0 |
| `recent_episode` | Actual for blocks starting within 4 h of now; else 0 |
| Illness | Current active illness state |

When the app has execution time during a block, the **in-block** prediction for the *next* block uses actual data up to now.

---

## 13. Forecast Engine (Bayesian Model): Full Math

Implement in `packages/engine`. All functions pure and deterministic.

### 13.1 Notation

- `d` features (including intercept), `n` training blocks.
- `x_i ∈ ℝ^d`: feature vector, `y_i ∈ {0, 1}`: label, `w_i ≥ 0`: weight (Section 12.2).
- `σ(z) = 1/(1 + e^{−z})`, `Φ` = standard normal CDF.
- Prior `β_j ~ Normal(m_j, s_j²)`.

### 13.2 Model

`P(y_i = 1 | x_i, β) = σ(x_iᵀβ)` (Bayesian logistic regression, one model per child).

### 13.3 Priors

- `m_j`, base `s_j` from the registry (Section 12.4), with parent nudges applied.
- **Global shrinkage `τ`**: for trigger features, effective prior sd = `τ · s_j`; baseline and missingness features are not scaled. `τ` is selected by empirical Bayes (13.6). Until 30 labeled days exist, `τ = 1`.
- Prior precision matrix `Λ = diag(1/s_eff,j²)`.

### 13.4 MAP estimate (Newton–Raphson with backtracking)

Maximize the log posterior (up to a constant):

```
L(β) = Σ_i w_i [ y_i log p_i + (1 − y_i) log(1 − p_i) ] − ½ (β − m)ᵀ Λ (β − m),   p_i = σ(x_iᵀβ)
```

Gradient and (negative) Hessian:

```
g(β) = Xᵀ W (y − p) − Λ (β − m)
A(β) = Xᵀ diag(w_i p_i (1 − p_i)) X + Λ          (positive definite)
```

Algorithm:

```
β ← m                                   # start at prior mean
for iter in 1..MAX_NEWTON_ITERS:
    compute p, g, A
    Δ ← solve(A, g)                      # via Cholesky of A
    t ← 1
    while L(β + tΔ) < L(β) − 1e-12 and t > 1e-4: t ← t/2
    β ← β + tΔ
    if max|tΔ| < NEWTON_TOL: converged; break
```

- Compute `log p_i` and `log(1 − p_i)` stably: `log σ(z) = −softplus(−z)`, `log(1 − σ(z)) = −softplus(z)`, `softplus(z) = max(z,0) + log1p(exp(−|z|))`.
- **Cholesky:** implement `cholesky(A)` returning lower-triangular `Lc`. If it fails (non-positive pivot), add jitter `ε I` with `ε = 1e-9, 1e-8, …, 1e-3`; if still failing, abort the fit and keep the previous fit (record error).
- If `n` has zero positive-weight blocks, the posterior equals the prior: `β̂ = m`, `Σ = Λ⁻¹`.

### 13.5 Laplace posterior covariance

`Σ = A(β̂)⁻¹`, computed from the Cholesky factor. Store `β̂`, `Σ`, and the weighted feature means `x̄_j = Σ w_i x_ij / Σ w_i` in `model_fits`.

### 13.6 Empirical-Bayes shrinkage (τ selection)

For each `τ ∈ TAU_GRID`, fit (13.4) and compute the Laplace approximation to the log marginal likelihood:

```
log Z(τ) ≈ ℓ(β̂) − ½ (β̂ − m)ᵀ Λ (β̂ − m) + ½ log|Λ| − ½ log|A(β̂)|
where ℓ(β̂) = Σ_i w_i [ y_i log p̂_i + (1 − y_i) log(1 − p̂_i) ]
```

(`log|A| = 2 Σ log diag(Lc)`.) Choose `τ* = argmax log Z(τ)`. Re-select τ at most once per 7 days, or when labeled blocks have grown by ≥ 20 % since the last selection; otherwise refit with the stored τ.

### 13.7 Predictive probability

For a block with features `x`:

```
μ_a = xᵀβ̂
v_a = xᵀ Σ x
p   = σ( μ_a / sqrt(1 + π v_a / 8) )              # probit approximation to the predictive mean
p_lo = σ(μ_a − Z80 · sqrt(v_a)),  p_hi = σ(μ_a + Z80 · sqrt(v_a))    # 80% credible range
```

### 13.8 Reasons

- Contribution of feature `j`: `c_j = β̂_j (x_j − x̄_j)` (how far this block's value pushes risk relative to the child's typical block, in logit units).
- Candidates: trigger features whose insight status is `possible`, `likely`, or `strong`, plus `recent_episode` and the time-of-day features.
- **Raising reasons:** top 3 with `c_j ≥ REASON_MIN_CONTRIBUTION`, sorted descending.
- **Protective reason:** the single most negative `c_j ≤ −0.2` among candidates (e.g. "Good sleep last night").
- Each reason: `{key, contribution, direction, estimated: boolean, textKey, params}`; rendered via i18n templates (Appendix B). If no candidates qualify (early days), show: "Based mostly on starting estimates. EmoLens is still learning."

### 13.9 Risk levels

- `p0_child` = mean of stored `day_ahead` predictions over awake blocks in the last 28 days (needs ≥ 7 days; else `p0` from 12.4).
- Thresholds:

| Sensitivity | High if | Moderate if |
|---|---|---|
| fewer | `p ≥ max(2.5 × p0_child, 0.15)` | `p ≥ max(1.4 × p0_child, 0.07)` |
| balanced | `p ≥ max(2.0 × p0_child, 0.12)` | `p ≥ max(1.3 × p0_child, 0.06)` |
| more | `p ≥ max(1.5 × p0_child, 0.10)` | `p ≥ max(1.2 × p0_child, 0.05)` |

- Otherwise `low`. During the **learning period** (labeled_days < 14 OR positive labeled blocks < 3), level = `learning` unless `early_alerts_enabled`.
- `labeled_days` = count of distinct local dates having ≥ 1 block labeled `positive` or `negative_confirmed`.
- Display the relative comparison `p / (baseline for this time-of-day group over last 28 days)`, rounded to one decimal, as "about N× usual" when ≥ 1.3.

### 13.10 Fit and forecast schedule

- Refit: after any label change (debounce 60 s), on app foreground if last fit > 6 h old, in background task if > 12 h old.
- Forecast: after every refit and every recompute, compute predictions for all remaining awake blocks today and all of tomorrow, and update the UI.
- **Calibration snapshot rule:** for each block, store exactly one `kind='day_ahead'` row: the first forecast computed for that block at or after 18:00 local on the previous day. It is never overwritten; it is what Model Health evaluates. For the next upcoming block, upsert the latest pre-block forecast as `kind='in_block'`.
- Every refit also fits a **baseline model** using only `intercept`, time-of-day, and `weekend` features (same engine, same priors for those features), and each stored prediction records its baseline probability in `p_baseline` for skill-score comparison ([Section 18](#18-model-health-and-calibration)).
- Performance budget: fit with n ≤ 3,000 and d ≤ 40 must complete in < 300 ms on a mid-range phone (τ grid: < 1.5 s). Run in a JS task off the render path (e.g. `InteractionManager.runAfterInteractions`).

### 13.11 Engine public API (TypeScript)

```ts
export interface TrainingRow { x: number[]; y: 0 | 1; w: number; }
export interface Prior { mean: number[]; sd: number[]; scaled: boolean[]; }
export interface Fit {
  beta: number[]; cov: number[][]; featureMeans: number[];
  tau: number; logMarginal: number; converged: boolean; iterations: number;
}
export function fitLogistic(rows: TrainingRow[], prior: Prior, tau: number): Fit;
export function selectTau(rows: TrainingRow[], prior: Prior, grid: number[]): Fit;   // returns best fit
export function predict(fit: Fit, x: number[]): { p: number; pLo: number; pHi: number; mu: number; v: number };
export function contributions(fit: Fit, x: number[]): number[];
export function effectSummary(fit: Fit, j: number, u: number, priorSdEff: number): {
  or: number; orLo: number; orHi: number; pHarm: number; confidence: number;
};
export function betaRatioProb(aE: number, bE: number, aU: number, bU: number, threshold: number, draws: number, seed: number): {
  pAbove: number; median: number; lo80: number; hi80: number;
};
export function brier(p: number[], y: number[]): number;
export function logLoss(p: number[], y: number[]): number;
export function auroc(p: number[], y: number[]): number | null;   // null if a class is missing
export function reliability(p: number[], y: number[], bins: number): { binLo: number; binHi: number; meanP: number; rate: number; n: number }[];
export function normalCdf(z: number): number;                     // accurate to 1e-7 (use erfc-based implementation)
export function mulberry32(seed: number): () => number;
export function sampleGamma(shape: number, rng: () => number): number;   // Marsaglia–Tsang (shape<1 via boost)
export function sampleBeta(a: number, b: number, rng: () => number): number;
```

---

## 14. Trigger Insights and Confidence Meters

Computed after each fit for every enabled trigger feature `j`.

### 14.1 Effect summary

```
sd_j     = sqrt(Σ_jj)
OR_u     = exp(β̂_j · u_j)                               # effect of a meaningful change
OR_lo/hi = exp((β̂_j ∓ Z80 · sd_j) · u_j)                # 80% credible range
P_harm   = Φ(β̂_j / sd_j)                                # posterior probability the factor raises risk
confidence = round(100 × clamp(1 − sd_j / (τ · s_j), 0, 1))   # share of prior uncertainty removed by data
```

The confidence meter is literally "how much of the starting uncertainty the child's own data has removed." Explain this in the "How sure is EmoLens?" help text.

### 14.2 Exposure counts

Over training blocks with weight > 0: `exposed` = blocks with `x_j > 0`; `exposed_pos` = exposed blocks labeled positive; `unexposed`, `unexposed_pos` likewise. (For signed physiology features use `x_j ≥ 1` as "exposed".)

### 14.3 Status rules (first match wins)

| Status | Rule | Display |
|---|---|---|
| `hidden` | feature not enabled | (in "Not tracked" list) |
| `not_enough_data` | labeled_days < 14, OR exposed < 10, OR unexposed < 10 | "Not enough data yet" |
| `strong` | labeled_days ≥ 21 AND exposed ≥ 30 AND exposed_pos ≥ 8 AND P_harm ≥ 0.975 AND OR_lo ≥ 1.2 | "Strong link" |
| `likely` | exposed ≥ 20 AND exposed_pos ≥ 5 AND P_harm ≥ 0.90 AND OR_u ≥ 1.3 | "Likely link" |
| `possible` | P_harm ≥ 0.80 AND OR_u ≥ 1.2 | "Possible link" |
| `protective` | exposed ≥ 20 AND P_harm ≤ 0.10 AND OR_u ≤ 1/1.3 | "Linked to calmer times" |
| `no_clear_link` | exposed ≥ 30 AND OR_lo ≥ 1/1.5 AND OR_hi ≤ 1.5 | "No clear link" |
| `checking` | otherwise | "Still checking" |

**Hysteresis:** a feature's status may only move to a *weaker* status after the weaker status is computed on 2 consecutive daily fits. Store per-feature status history in `settings` key `insight_status_history` (JSON).

**New-insight notification:** when a feature first reaches `likely` or `strong`, send one local notification ("EmoLens found a likely pattern: shorter sleep") and highlight it in the next digest.

### 14.4 Effect sentence

- If `OR_u ≥ 1`: "About {OR_u, 1 decimal}× the usual chance {phrase}" (e.g. "after 2 fewer hours of sleep").
- If `OR_u < 1`: "About {round((1 − OR_u) × 100)}% lower chance {phrase}."
- Include the 80% range in detail view: "(likely between 1.4× and 3.0×)".
- Help text notes these are odds ratios, which closely approximate "times the chance" when hard moments occur in a minority of time blocks.

### 14.5 Item-level "worth watching" analysis

For sparse, specific items that are too numerous for the main model:

| Item kind | Item | Exposure window |
|---|---|---|
| food | each normalized item name (lowercase, trimmed) with ≥ 8 logged occurrences on ≥ 5 distinct days | blocks starting within 3 h after eaten |
| medication | each medication's missed doses | blocks within 24 h after a missed dose |
| place | each tagged place | blocks where the child is at that place at block start |
| calendar tag | each tag category | blocks overlapping an event with that tag |

For each item: overall labeled positive rate `r̄`; prior `Beta(a0, b0)` with `a0 = 10 r̄`, `b0 = 10 (1 − r̄)`; exposed posterior `Beta(a0 + k_e, b0 + n_e − k_e)`; unexposed posterior `Beta(a0 + k_u, b0 + n_u − k_u)`. Draw 4,000 samples from each (seed = 32-bit hash of the item key) and compute the ratio distribution. **Show as "Worth watching"** if `P(ratio > 1.3) ≥ 0.90`, raised to `≥ 0.95` when more than 20 items are tested (multiple-comparison guard). Food items are never called "triggers." Display: "Hard moments were more common within 3 hours after {item} (about {median}×, based on {n_e} times)." with a note "Patterns aren't proof. Consider trying a change and watching what happens."

---

## 15. Alerts and the Prediction-Confirmation Loop

### 15.1 Notification categories (register at app start)

| Category | Actions |
|---|---|
| `RISK_ALERT` | `SEE_IDEAS` (opens app to block sheet), `ON_IT` (opens app to strategy picker, context proactive) |
| `CONFIRM` | `HAPPENED` (opens app → quick episode log), `STEPPED_IN` (background if possible), `CALM` (background if possible) |
| `MED_DOSE` | `TAKEN`, `SKIP` |
| `EOD` | none (tap opens end-of-day check) |
| `INFO` | none (digest, new insight, add-details reminder, morning outlook) |

Handle responses with `Notifications.addNotificationResponseReceivedListener` and on cold start with `Notifications.getLastNotificationResponseAsync()`. Background-action delivery varies by OS and library version; verify behavior on real devices. Every unanswered confirmation MUST also appear as a card on Today and in the end-of-day check, so no response is ever lost.

### 15.2 Scheduling algorithm (run after every forecast)

```
cancel all alerts with status 'scheduled' whose block's latest level is no longer 'high'  (status → 'cancelled')
for each upcoming awake block B (today + tomorrow), in time order, with latest level == 'high'
        and no existing non-cancelled alert for B:
    fire ← B.start − ALERT_LEAD_MIN
    if fire < now:
        if now < B.end − 30 min: fire ← now + 5 s else continue
    skip if fire is inside quiet hours
    skip if alerts (scheduled or delivered) on B's local date ≥ max_alerts_per_day
    skip if any other alert fires within ALERT_COOLDOWN_MIN of fire
    skip if an episode was logged within 60 min before fire (only checkable when fire ≈ now)
    skip if learning period and not early_alerts_enabled
    create alerts row (status 'scheduled'); schedule RISK_ALERT notification at fire
    schedule CONFIRM notification at B.end + CONFIRM_DELAY_MIN (store confirm_notification_id)
```

Mark alerts `delivered` when their fire time has passed (on next run). Record skipped ones with status `suppressed` for analytics.

**Alert copy:**
- Title: "Heads up for 2–4 pm"
- Body: "Higher chance of a hard moment for {Nickname}. Main reasons: short sleep, dentist visit. Tap for ideas that have helped."
- Never include medication names or place labels in notification text (lock-screen privacy). Use generic phrases ("a medication change," "a new place").

### 15.3 Morning outlook (optional, default on)

At `wake_start`, a single INFO notification: "Today's outlook for {Nickname}: mostly calm; higher chance 2–4 pm." Not counted toward the alert limit. Skip during the learning period.

### 15.4 Confirmation

After an alerted block ends, the CONFIRM notification and a Today card ask: **"How did 2–4 pm go?"**

| Answer | Effect |
|---|---|
| **A hard moment happened** | Opens quick episode log prefilled with the block's midpoint time (editable). If dismissed without saving, a fast-path episode (`source='alert_confirm'`, `details_complete=0`) is created at the midpoint. Block → `positive`. |
| **We stepped in early** | Stores response. Next app open shows an optional card "What did you try?" → strategy multi-select creates `strategy_uses` (`context='proactive'`, `alert_id`, outcome resolved per [Section 10.2](#102-strategies-standalone-proactive-use)). Block → `intervened` (excluded from risk training). |
| **All calm** | Block → `negative_confirmed`. |

Unanswered after 12 h → handled in the end-of-day check. Each answer is editable from the Timeline.

### 15.5 Alert metrics (for Model Health and digest)

Per week and all time: alerts delivered, responses (happened / stepped in / calm / no answer), **alert hit rate** = happened ÷ (happened + calm), stepped-in share.

---

## 16. End-of-Day Check

- Local notification (category `EOD`) at `end_of_day_time`: "Quick check: how was today for {Nickname}?"
- Screen shows today's awake blocks up to now with their current status icons, the list of logged episodes, and any unanswered confirmations (answer inline).
- Main question: **"Were there any other hard moments today that aren't logged?"**
  - "No, that's everything" → `day_closures(all_logged=1)`; every fully elapsed awake block without another label becomes `negative_confirmed`.
  - "Yes, let me add it" → quick episode log, then return to this screen.
  - "I'm not sure" → `day_closures(all_logged=0)`; unlabeled blocks stay `unknown`.
- Optional: "Anything else about today?" one-line note.
- Blocks after the check time: the next morning, a Today card asks "Anything happen after 8:30 pm last night?" (Yes → log; No → those blocks become `negative_confirmed`).
- If the check is skipped, a Today card "Finish yesterday's check" stays until 23:59 the next day.
- The check MUST take under 15 seconds on a calm day (one tap).

---

## 17. Strategy Effectiveness Model

- **Contexts:** `proactive` (outcomes `averted` = success, `not_averted` = failure) and `during` (outcomes `helped` = success, `not_helped` = failure; `unsure` and `pending` excluded).
- For each strategy and context: successes `s`, failures `f`; posterior `Beta(1 + s, 1 + f)`. Posterior mean `(1+s)/(2+s+f)`; 80% interval from 4,000 seeded draws.
- **Suggestions ("Ideas that have helped"):** among active strategies with ≥ 3 uses in the relevant context (proactive for Today/alerts), rank by posterior mean; show top 2. If fewer than 2 qualify, fill with onboarding favorites, labeled "You said this helps."
- **Discovery mode** (toggle, default off): Thompson sampling. Draw θ from each active strategy's posterior (untried = Beta(1, 1)), suggest the top 2 draws; untried strategies are labeled "Something new to try."
- Display: "Helped 6 of 7 times" + bar with interval. Caveat text: "Calm afterward doesn't prove the strategy caused it, but it's a good sign."

---

## 18. Model Health and Calibration

Evaluate stored `day_ahead` predictions for blocks labeled `positive` or `negative_confirmed` (exclude `intervened` and `unknown`). Compute for the last 28 days and all time:

| Metric | Definition | Shown as |
|---|---|---|
| Brier score | mean (p − y)² | number + plain text |
| Baseline Brier | same with `p_baseline` | number |
| **Skill score** | `1 − Brier_model / Brier_baseline` | Headline: "EmoLens forecasts are 23% better than a simple time-of-day guess" (or "not yet better; still learning" if ≤ 0) |
| Log loss | mean −[y log p + (1−y) log(1−p)] | advanced section |
| AUROC | rank-based; only if ≥ 5 positives and ≥ 5 negatives | "How well it ranks risky vs calm times" |
| Reliability | bins [0,5%), [5,10%), [10,20%), [20,35%), [35,100%]: mean predicted vs observed rate, n | reliability diagram + sentence "When EmoLens said about 15%, hard moments happened 13% of the time" |
| Alert metrics | Section 15.5 | bar |
| Data | labeled days, labeled blocks, positives, last fit time, τ, converged | small print |

Minimum 20 evaluable predictions before showing metrics; otherwise "Model health appears after about 3 weeks of logging."

---

## 19. Ask EmoLens (Agentic AI Chat)

### 19.1 Requirements and consent

- Available only in account mode with `cloud_ai_enabled = true`.
- Turning it on shows a consent screen listing exactly what may be sent to the AI provider through EmoLens's server: log entries, medication names, food items, place *labels* (never coordinates), strategy names, computed patterns and forecasts. Not sent: the child's nickname (replaced by `[CHILD]`), location coordinates, calendar event titles (unless the separate `ai_share_event_titles` toggle is on), audio, photos. The user must tap "I understand, turn on AI features."

### 19.2 Architecture (client-executed tools)

1. User types a question in `ask/index.tsx`.
2. Client sends `{conversation_id, messages}` (redacted) to edge function `ai-ask`.
3. `ai-ask` injects the fixed system prompt and the fixed tool definitions (Appendix A.1, A.2). **Tools are defined server-side only**; the client cannot add tools or change the system prompt. It calls the Messages API and returns `{content, stop_reason}`.
4. If `stop_reason == "tool_use"`, the client executes each `tool_use` block locally against SQLite (executors in `src/ai/tools/`), then appends the assistant `content` and a `user` message containing one `tool_result` block per tool call (`{type:"tool_result", tool_use_id, content: JSON.stringify(result)}`), and calls `ai-ask` again.
5. Loop until `stop_reason` is `end_turn` or 6 tool rounds (then send a final request instructing the model to answer with what it has).
6. Display the final text. Collect every `ref` value returned by tools during this turn and show "Based on N entries" (expandable list; tapping opens the entry).

**Tool result rules:** at most 200 rows per result (include `truncated: true` and totals when cut); timestamps converted to the child's local time with weekday; every row includes `ref` (e.g. `"E:0190a..."` for episodes, `"M:"` meds, `"F:"` meals, `"S:"` strategy uses, `"N:"` notes).

**Redaction:** replace the nickname (case-insensitive, whole word) with `[CHILD]` in all outgoing text, including tool results and user messages; restore it in displayed responses.

**UI:** chat bubbles, suggested questions as chips ("What usually happens before afternoon meltdowns?", "Did the new bedtime help?", "What helped most this month?", "Summarize last week for the teacher"), copy button, "Clear conversation," disclaimer footer: "AI answers can be wrong. They're based on your logs, not medical advice." Store messages in `chat_messages`.

---

## 20. Voice Notes and Document Import

### 20.1 Voice notes

1. Log → Voice: big record button, max 3 minutes, live timer, cancel.
2. Record 16 kHz mono audio in a format `whisper.rn` accepts (WAV PCM). If the recording library cannot produce WAV on a platform, use `whisper.rn`'s own audio-capture API instead. Verify against the installed `whisper.rn` docs.
3. First use: download `ggml-tiny.en.bin` from the official whisper.cpp model repository on Hugging Face (show size, progress, "Wi-Fi recommended"), verify its SHA-256 checksum against the published value, store under `FileSystem.documentDirectory/models/`. Settings allow switching to `ggml-base.en` for accuracy.
4. Transcribe on-device. Delete the audio file right after transcription unless "Keep audio for this note" was toggled (default off).
5. Save a `notes` row (`source='voice'`, `structured_status='pending'`).
6. **Structuring into logs:**
   - Cloud AI on → `ai-structure` edge function with the redacted transcript and context `{now_local, tz, medication_names, strategy_names, place_labels, food_recent_items}`; the model must call the tool `record_structured_log` (Appendix A.3), forced with `tool_choice: {type: "tool", name: "record_structured_log"}`.
   - Cloud AI off → on-device rule parser (`src/voice/ruleParser.ts`): episode keywords (Appendix B), time expressions ("at 3," "3:15," "around noon," "this morning" → 09:00, "after school" → 15:30, "at lunch" → 12:00), medication names fuzzy-matched to the user's list (Levenshtein ≤ 2), food words matched to recent items, strategy names matched to the user's list.
7. **Review screen (MUST):** each proposed entry appears as an editable card with a checkbox. Nothing is saved until the user taps "Save selected." Then `structured_status='accepted'` (or `rejected`).

### 20.2 Document import

Log → Document: take a photo or choose one (e.g. a school daily behavior sheet) → on-device OCR with ML Kit → show recognized text (editable) → same structuring pipeline with context `document_type: "school_report" | "other"` → review screen. The image is deleted immediately after OCR and never stored or uploaded.

---

## 21. Weekly Digest

Generated locally at `digest_day_time` (default Sunday 18:00) or on first app open after it. Notification: "{Nickname}'s weekly digest is ready."

**`stats_json` contents:**

- Week range; hard moments count (total, by type), average intensity, total duration; change vs previous week and vs 4-week average.
- Count by time-of-day group; busiest day.
- Logging: days with end-of-day check completed; logging streak (consecutive days with EoD done).
- Forecasts: alerts delivered, hit rate, stepped-in count, skill score (28 days).
- Insights: status changes this week (e.g. "Shorter sleep: possible → likely"), new worth-watching items.
- Strategies: most used, highest success this week.
- Medications: adherence % = (taken + late) ÷ scheduled; any changes this week.
- Sleep: average asleep hours vs `sleepRef`.

**Narrative:** cloud AI on → `ai-digest` receives only `stats_json` (redacted) and returns 120–180 words (prompt in Appendix A.4). Cloud AI off → template sentences (Appendix B). Digest screen: narrative on top, then charts (daily counts bar chart, time-of-day chart), insight changes, strategy highlights. "Share as PDF" button reuses the report renderer.

---

## 22. Reports and Exports (PDF, ABC CSV, FHIR R4, Full Data Export)

### 22.1 Report builder (`reports/index.tsx`)

- Date range presets: 2 weeks, 30 days, 90 days, custom.
- Audience presets toggle sections: **Clinician** (all sections), **School** (no medications, sleep, home places, or physiology), **Family** (all, simplified wording).
- Output: PDF (`expo-print` from HTML), then share sheet (`expo-sharing`).

### 22.2 PDF sections (HTML template in `src/reports/templates/report.ts`)

1. Cover: "EmoLens report for {Nickname}," date range, generated date, audience, disclaimer ("Caregiver-reported observations and statistical patterns. Not a diagnosis.").
2. Summary: counts, averages, trend vs previous equal-length period.
3. Calendar heatmap: hard moments per day (SVG).
4. Time-of-day chart (SVG bar chart with interval whiskers).
5. Episode table: date, time, type, intensity, duration, setting, what happened before, what helped.
6. Patterns table: factor, status, effect (with 80% range), confidence %, evidence counts.
7. Worth watching list.
8. Medications (clinician/family only): list, change timeline, adherence % per medication, missed-dose count.
9. Sleep summary (clinician/family).
10. Strategies: success counts by context.
11. Forecast quality: skill score, alert hit rate.
12. Selected caregiver notes (user picks which to include).
13. "How to read this report" glossary: confidence, 80% range, odds ratio in plain words.

All charts are generated as inline SVG strings by pure TS functions in `src/reports/svg.ts` (no native chart rendering in PDFs). Page size: Letter for US locale, A4 otherwise; page breaks before tables; header/footer with page numbers via CSS.

### 22.3 ABC data CSV

UTF-8 with BOM (Excel-friendly). Columns: `date, start_time, duration_min, setting, antecedent_auto, antecedent_caregiver, behavior, intensity, consequence_and_support, outcome, logged_by_role`.
- `antecedent_auto`: semicolon list of factors active for that episode's block with a positive contribution ≥ 0.1 (e.g. "planned transition; short sleep (−2.1 h); arrived at new place").
- `consequence_and_support`: strategies used during, with helped/not helped.

### 22.4 FHIR R4 export

A `Bundle` with `type: "collection"` in JSON (`emolens-fhir-{date}.json`):

- `Patient`: random UUID `id` per export (not linkable across exports); no name unless the user opts in to include the nickname; `birthDate` as year only if provided.
- `Observation` per episode: `status: "final"`, `code` with system `https://emolens.app/fhir/CodeSystem/emolens`, code `distress-episode`, display "Distress episode (caregiver-reported)"; `subject` → Patient; `effectivePeriod` (start, start + duration); `component`s: `episode-type` (`valueCodeableConcept`: meltdown/shutdown/other in the same local code system), `intensity` (`valueInteger` 1–5), `setting` (`valueString` place type); `note` with antecedents and notes text.
- `Observation` per night of sleep: LOINC code 93832-4 "Sleep duration" (verify at loinc.org before release), `valueQuantity` in hours (`unit: "h"`, system UCUM, code `h`).
- `MedicationStatement` per medication: `status` active/completed; `medication[x]` as `medicationCodeableConcept` with RxNorm system `http://www.nlm.nih.gov/research/umls/rxnorm` + rxcui (or text only); `effectivePeriod`; `dosage[0].text` from strength + schedule.
- `MedicationAdministration` per dose in range: `status` `completed` (taken/late) or `not-done` (missed/skipped), `effectiveDateTime`.
- Unit tests validate structure (resourceType, ids, references resolve within the bundle). CI MAY run the official HL7 FHIR validator jar on a sample export; document the command in `docs/`.

### 22.5 Full data export and import

- **Export all data:** one JSON file `emolens-export-{date}.json` containing every local table (except downloaded models and raw audio), plus `schema_version`. Offered in Privacy & security; shared via share sheet.
- **Import backup:** choose a file, validate with zod schemas, preview counts, merge by `id` (LWW on `updated_at`). Used for moving to a new phone in local-only mode.

---

## 23. Care Team and Sync

### 23.1 Turning on Care Team

Owner (account mode) → Team → "Turn on Care Team" → explanation of what syncs (Section 7.2 exclusions) → confirm → create `children` row + owner membership → initial push of all syncable history in batches of 500.

### 23.2 Invites

- Owner taps Invite → chooses role → `invite-create` returns code → share sheet with message: "Join {Nickname}'s EmoLens care team. Install EmoLens, choose 'Join a care team' and enter code ABCD2345. Clinicians can use {portal URL}."
- Invitee: onboarding step 3 offers "Join a care team" → account → code → `invite-accept` → initial pull → app configured with `device_role` choice (caregiver device or child device) and `receive_alerts` choice. Teachers and clinicians skip child-profile steps.

### 23.3 Sync engine (`src/sync/`)

- **Push:** read `outbox` ordered by `seq` in batches of 200; convert to cloud types; upsert; delete sent rows. On failure, exponential backoff (2^attempts s, max 10 attempts, then show a sync-error banner).
- **Pull:** for each synced table, `select * where child_id = ? and server_received_at > cursor order by server_received_at limit 1000`, repeat until empty. Apply a row if no local row exists or `incoming.updated_at > local.updated_at` (tie → lexicographically greater `device_id` wins). Update cursor. Pulled changes mark blocks dirty.
- **Triggers:** app foreground, 5 s after local writes (debounced), background task, and a Supabase Realtime `postgres_changes` subscription (filtered by `child_id`) while in the foreground, which triggers a pull.
- **Alerts across devices:** only the device with `primary_forecaster = true` creates `alerts` rows (which sync). Other devices with `receive_alerts = true` schedule local notifications for synced alerts they pull (best effort). When any device records an `alert_response`, other devices cancel their pending CONFIRM notification for that alert after pulling.
- **Primary forecaster** uploads an `insight_snapshots` row after each daily fit.
- **Removal:** if a pull returns 401/403 for a previously accessible child, show "You're no longer on {Nickname}'s care team" and offer to delete the local copy (default: delete).
- **Places:** `places_public` syncs labels/types; coordinates stay on the device that created them. Other devices can set their own coordinates for the same place locally.

---

## 24. Clinician Portal and Share Links

### 24.1 Portal pages (`apps/portal/app/`)

| Route | Content |
|---|---|
| `/login` | Email magic link (Supabase) |
| `/children` | Children the user is a member of (any role; the portal is primarily for clinicians and also works for parents) |
| `/children/[id]` | Overview: KPIs (hard moments last 30 days vs prior 30), calendar heatmap, time-of-day chart, latest patterns and model health from the newest `insight_snapshots` row with its timestamp ("Computed on the family's phone on …") |
| `/children/[id]/episodes` | Filterable table (date range, type, intensity, setting), CSV download |
| `/children/[id]/medications` | Medications, change timeline, adherence chart (hidden for teachers by RLS) |
| `/children/[id]/strategies` | Strategy stats from snapshot |
| `/children/[id]/notes` | Clinician notes list/editor; "Draft session prep" button |
| `/children/[id]/report` | Print-optimized report (same sections as the mobile PDF) with `@media print` CSS; user prints to PDF |
| `/share/[token]` | Public read-only snapshot page |

### 24.2 Session-prep draft (clinician only)

- Portal route handler builds a summary JSON from synced data for a chosen range (default since last clinician note, max 60 days) plus the latest snapshot; nickname redacted.
- Calls `ai-session-prep` (role verified server-side as `clinician`) with the prompt in Appendix A.5.
- Returns a draft with sections: **Caregiver-reported summary**, **Logged data summary**, **Patterns observed (with confidence caveats)**, **Questions to explore in session**. It is explicitly *not* an assessment or diagnosis.
- Shown in an editor labeled "AI draft: review and edit before use." Saved as `clinician_notes` with `kind='session_prep_draft'`; clinician can mark final.

### 24.3 Share links

- Owner creates in the app: date range + expiry (7 or 30 days) + sections (same as report audiences). The app builds a static **snapshot JSON** (report data, no raw notes unless selected, no medication data if the School preset is used) and calls `share-create`.
- URL: `{PORTAL_URL}/share/{token}`. The portal page calls `share-view` server-side and renders the snapshot with a banner: "Read-only report shared by {Nickname}'s family. Expires {date}." `<meta name="robots" content="noindex">`.
- Owner can revoke any link (sets `revoked_at`); expired or revoked links show "This link is no longer available."

### 24.4 Portal security

- Uses the signed-in user's Supabase session only (RLS enforced). The service role key is never present in the portal.
- Security headers: CSP, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.

---

## 25. EmoLens Room Sensor (Hardware + Firmware + BLE Protocol)

An optional, low-cost device that continuously measures sound level, temperature, humidity, and light in the child's main space, so sensory features work without anyone logging them.

### 25.1 Bill of materials

| Part | Notes | Approx. cost |
|---|---|---|
| ESP32-S3-DevKitC-1 | BLE 5, USB-C | $10–15 |
| INMP441 I2S MEMS microphone breakout | digital mic, −26 dBFS sensitivity at 94 dB SPL | $3–6 |
| BME280 breakout (I2C) | temperature, humidity, pressure. Many cheap boards labeled "BME280" are actually BMP280 (no humidity); verify chip ID 0x60 | $5–10 |
| BH1750 breakout (I2C) | ambient light (lux) | $2–4 |
| USB-C cable + 5 V USB power adapter | wall-powered; **no coin-cell batteries** (swallowing hazard for children) | $5 |
| Enclosure | 3D-printed or small project box with a mic port and side vents | $0–5 |

### 25.2 Wiring

| Module pin | ESP32-S3 pin |
|---|---|
| INMP441 VDD / GND / L/R | 3V3 / GND / GND (left channel) |
| INMP441 WS / SCK / SD | GPIO5 / GPIO6 / GPIO7 |
| BME280 + BH1750 VCC / GND | 3V3 / GND |
| BME280 + BH1750 SDA / SCL (shared bus) | GPIO8 / GPIO9 |

BME280 address 0x76 (or 0x77), BH1750 address 0x23. Mount the BME280 away from the ESP32 (short cable or separate vented compartment) because the microcontroller's heat biases temperature readings. Place the device out of the child's reach.

### 25.3 Firmware behavior (`firmware/src/main.cpp`, PlatformIO env `esp32-s3-devkitc-1`, Arduino framework)

- **Audio:** I2S at 16 kHz, 32-bit samples, left channel; use the top 24 bits. DC removal with a one-pole high-pass (~20 Hz). A-weighting via a biquad cascade whose coefficients are generated by `firmware/tools/aweight.py` (bilinear transform of the analog IEC 61672 A-weighting curve at fs = 16 kHz) into `aweight_coeffs.h`. Every 1 s compute RMS → `dBFS = 20·log10(rms / 2^23)` → `dBA = dBFS + 120 + dba_offset` (120 = 94 dB SPL reference + 26 dB sensitivity), clamped to [30, 120].
- **Minute aggregation:** average the 1-second values in the linear power domain (Leq) for `dba_avg`; keep `dba_max`. Every 60 s read BME280 and BH1750, then finalize the minute record into a RAM ring buffer of 1,440 records (24 h).
- **Time:** history recording starts only after the app writes the current Unix time (TIME characteristic) following power-up; until then only live values are available. Keep time with `millis()` offset from the last set.
- **BLE:** NimBLE peripheral, advertised name `EmoLens-XXXX` (last 2 bytes of MAC, hex).

### 25.4 BLE GATT protocol

Service UUID: `6c3f0001-5e2b-4f7a-9d61-3a8e0c1b7e10`. Characteristic UUIDs replace `0001` with the codes below. All integers little-endian.

| Char | Code | Properties | Payload |
|---|---|---|---|
| LIVE | `0002` | read, notify (every `live_interval_s`, default 10 s) | 1 record (current minute so far) |
| TIME | `0003` | write | `uint32` Unix seconds |
| HISTORY_CTRL | `0004` | write | `uint8 cmd` (1 = send since) + `uint32 since_minute_epoch` |
| HISTORY_DATA | `0005` | notify | `uint8 count` then `count` records; `count = 0` marks end |
| INFO | `0006` | read | UTF-8 JSON `{"fw":"1.0.0","id":"<mac>","uptime_s":N,"time_set":true,"records":N}` |
| CONFIG | `0007` | read, write | `int16 dba_offset×10`, `uint16 live_interval_s` |

**Record (14 bytes):** `uint32 minute_epoch` (Unix seconds / 60) · `int16 dba_avg×10` · `int16 dba_max×10` · `int16 temp_c×100` · `uint16 humidity×100` · `uint16 lux` (clamped 0–65,535). Missing values: `0x7FFF` for int16, `0xFFFF` for uint16.

HISTORY_DATA packets hold `floor((MTU − 3 − 1) / 14)` records (at most 16). The app requests MTU 247 on connect.

### 25.5 App integration

- **Pairing:** More → Room sensor → Scan (filter by service UUID, 15 s) → pick device → name it and assign a tagged place → app writes TIME → saves `sensor_devices` row → history sync.
- **Sync:** on app start, foreground, and BLE background wake: connect to known devices, write TIME, write HISTORY_CTRL with `last_history_minute + 1`, receive until `count = 0`, upsert `sensor_readings` (applying the device's `dba_offset` only if the firmware offset is 0), update `last_history_minute`. Subscribe to LIVE while foregrounded (shown on the sensor screen as a live meter).
- **Settings:** rename, reassign place, calibration offset slider (±15 dB, written to CONFIG), "Calibrate with phone" (runs simultaneous sound checks), forget device.
- iOS: `bluetooth-central` background mode; use the library's state-restoration option if supported.
- `firmware/enclosure/README.md`: printable enclosure notes (mic port, vents, sensor separation), mounting guidance.

---

## 26. Simulator and Validation Study

The simulator proves that the model learns real patterns, ignores fake ones, and that the three-answer confirmation design avoids the intervention trap. Its generator (`packages/simulator/src/generate.ts`) MUST be pure TypeScript with no Node-only APIs, so the mobile app's demo mode ([Section 9.10](#910-demo-mode)) can import it. The experiment runner (`src/run.ts`) may use Node (`worker_threads`, `fs`).

### 26.1 Scenario configuration (`scenarios/*.json`)

```json
{
  "name": "default",
  "seed": 20260928,
  "families": 200,
  "days": 120,
  "wake": ["06:30", "21:00"],
  "baseRatePerBlock": 0.05,
  "todEffects": {"tod_afternoon": 0.3},
  "trueEffects": {"sleep_deficit": 0.35, "planned_transitions": 0.6, "missed_dose": 0.7, "illness": 0.8},
  "sources": {"sleep": true, "meals": true, "meds": true, "calendar": true, "places": true, "sensor": true, "weather": true, "physiology": false},
  "behavior": {
    "logRate": 0.9,
    "eodCompletion": 0.8,
    "alertResponseRate": 0.7,
    "interveneProbWhenAlerted": 0.5,
    "interventionEffect": 0.5
  },
  "parentSuspected": ["sleep_deficit", "high_sugar_recent"],
  "labelPolicy": "emolens"
}
```

(`high_sugar_recent` is a deliberately *wrong* parent belief: its true effect is 0.)

### 26.2 Generative process (per family, per day)

- **Child traits:** mean sleep `U(9, 10.5)` h; per-family effect sizes = scenario effects × `U(0.7, 1.3)` (families differ).
- **Sleep:** `N(mean, 0.6)`; with probability 0.15 a short night (subtract `U(1.5, 3)` h); night wakings `Poisson(0.5)`.
- **School and places:** Mon–Fri school 08:00–15:00 (5% random no-school days); therapy one weekday 16:00–17:00; non-school days: home, with 30% chance of an outing (store/public 2 h or relative 3 h).
- **Calendar:** arrival transitions at school start/end; `Poisson(0.8)` extra transition events per day at random awake times; one appointment per week; unusual day with probability 0.08.
- **Meals:** breakfast 07:00, lunch 12:00, snack 15:30 (skipped 30%), dinner 18:00, each ±30 min; 20% of snacks tagged `high_sugar`.
- **Medication:** one med at 08:00; missed 7%, late 10%; with probability 0.5 a dose change on a random day in 40–80.
- **Illness:** starts with daily probability 1/30, lasts 2–4 days, severity uniform 1–3.
- **Weather:** pressure mean-reverting random walk (hourly sd 1 hPa, toward 1013); temperature seasonal sine + noise; AQI mostly < 100 with occasional spikes.
- **Sound:** minutes above threshold in the pre-block window drawn per place (school highest).
- **Episodes:** for each awake block, build features with the engine's feature builder from the generated dataset, compute `p_true = σ(logit(baseRate) + Σ trueEffect_k · x_k + todEffects)`. If the simulated app raised an alert for the block (next bullet) and the simulated parent intervenes (probability `interveneProbWhenAlerted`), multiply `p_true` by `interventionEffect`. Draw the episode.
- **Simulated app:** each day at 18:00 the engine refits on the *observed* labels and makes day-ahead predictions for tomorrow; alerts follow the real scheduling rules (`packages/engine/src/alerts.ts`).
- **Simulated caregiver:** logs each episode with probability `logRate`; answers alerts with probability `alertResponseRate` truthfully (intervened & no episode → `stepped_in`); completes the end-of-day check with probability `eodCompletion`, answering "that's everything" even when an episode went unlogged (realistic label noise).
- **`labelPolicy`:** `"emolens"` = Section 12.2 rules; `"naive"` = `stepped_in` treated as `negative_confirmed`.

### 26.3 Metrics (computed each simulated day from day 7)

- **Detection rate:** fraction of planted triggers with status `likely` or `strong`.
- **False-pattern rates:** among features with true effect 0, fraction at `possible`, and at `likely`/`strong` (reported separately).
- **Wrong-belief correction:** status over time of parent-suspected null features.
- **Forecast quality:** AUROC and Brier of day-ahead predictions against *true* outcomes (all episodes, logged or not; intervened blocks excluded), next 7 days; skill score vs the baseline model; calibration against `p_true` (reliability bins).
- **Coefficient recovery:** bias and RMSE of `β̂` vs true effects at days 30, 60, 90, 120.
- **Alert metrics:** alerts per week, hit rate.

### 26.4 Experiments

| ID | Question | Design |
|---|---|---|
| E1 | How fast does EmoLens learn? | Default scenario; plot metrics vs day |
| E2 | Does the three-answer confirmation avoid the intervention trap? | Same seeds, `labelPolicy` emolens vs naive, `interveneProbWhenAlerted ∈ {0.3, 0.5, 0.8}`; compare β̂ for planted triggers and AUROC over time; report the mean difference with 95% bootstrap CI across families |
| E3 | Does shrinkage prevent fake patterns? | τ selection vs fixed τ = 1 vs weak prior (all trigger sds = 5) |
| E4 | How much does logging diligence matter? | `logRate ∈ {1.0, 0.8, 0.6}` × `eodCompletion ∈ {0.9, 0.6}` |
| E5 | Can the data overrule a wrong parent belief? | Track `high_sugar_recent` status (suspected but truly null) |
| E6 | Does physiology help? | Scenario with `physiology: true` and a true `hr_elevated_pre` effect of 0.5 vs without |

### 26.5 Outputs and figures

- CLI: `pnpm --filter @emolens/simulator sim --scenario default --families 200 --days 120 --out out/default` (workers = CPU count).
- Writes `daily_metrics.csv`, `coefficients.csv`, `alerts.csv`, `summary.json` per experiment.
- `analysis/plots.py` produces in `docs/figures/`: `fig1_learning_curve.png` (detection and false-pattern rates vs day), `fig2_forecast_quality.png` (AUROC, skill vs day), `fig3_calibration.png`, `fig4_intervention_trap.png`, `fig5_shrinkage.png`, `fig6_compliance.png`, `fig7_wrong_belief.png`, `fig8_physiology.png`. Every figure has axis labels, a title, a caption in `docs/VALIDATION.md`, and shaded 95% intervals across families.

### 26.6 Acceptance targets (default scenario)

These are targets, not claims. Report actual values honestly in `docs/VALIDATION.md` either way.

- By day 90: mean detection rate of planted triggers ≥ 0.70.
- At every day: `likely`/`strong` rate among null features ≤ 0.05.
- By day 45: skill score > 0 in ≥ 80% of families.
- E2: naive labeling yields lower mean `β̂` for planted triggers than EmoLens labeling, with a 95% CI excluding 0 at `interveneProbWhenAlerted = 0.5`.

If targets are missed, you may tune only: status thresholds (14.3), `REASON_MIN_CONTRIBUTION`, `TAU_GRID`, and registry prior sds. Record every change and its effect in `docs/VALIDATION.md`.

---

## 27. Privacy, Security, and Consent

### 27.1 Data inventory

| Data | Stored | Synced (Care Team) | Can reach AI provider (if enabled) |
|---|---|---|---|
| Episodes, strategies, notes | Device (encrypted) | Yes | Yes (redacted) |
| Medications, doses | Device | Yes (not to teachers) | Yes |
| Meals | Device | Yes | Yes |
| Sleep entries | Device | Yes | Yes |
| Raw heart rate / HRV / steps | Device only | Only per-block summaries from child device | Summaries only |
| Place coordinates | Device only | Never | Never |
| Place labels/types, visits | Device | Yes | Yes |
| Calendar titles | Device only | Never | Only if `ai_share_event_titles` |
| Audio | Deleted after transcription (unless kept) | Never | Never |
| Document photos | Deleted after OCR | Never | Never (OCR text only, after review) |
| Sensor readings, sound samples, weather | Device only | Never | Aggregates only |
| Model fits, predictions | Device | Snapshot summaries only | Yes (summaries) |
| Child nickname | Device + cloud (if Care Team) | Yes | Never (redacted) |

### 27.2 Protections

- SQLCipher encryption at rest; key in Keychain/Keystore. TLS for all network calls.
- Optional app lock (Face ID / Touch ID / device passcode), auto-lock after 5 minutes in background.
- Privacy overlay: when the app goes to background, cover the screen with a blank EmoLens view (hides content in the app switcher).
- No advertising or third-party analytics SDKs. No crash reporting by default.
- Edge functions never log request or response bodies. The AI provider's own data-retention policy is linked in the consent screen.
- Notification text never contains medication names or place labels.
- `pnpm audit` in CI; no dynamic code evaluation.

### 27.3 Consent and legal notes

- EmoLens accounts are for adults (18+). The app is not directed to children; it stores information about a child provided by a parent or guardian, with minimal identifiers (nickname, optional birth year, no photos, no full name).
- **Before any public release**, obtain legal review covering children's privacy (COPPA), state consumer health-data laws, and app-store health-app requirements. HIPAA generally does not apply to a consumer app used directly by families, but may if a clinic deploys it.
- For the competition prototype, testing is limited to the student's own family with written consent. Include `docs/CONSENT_TEMPLATE.md`: a plain-language parent/guardian consent form and a simple child assent script appropriate to the child's communication style. If the student later runs a study beyond family (e.g. a science fair), follow that fair's human-subjects review process.

### 27.4 Deletion

- **Delete all data (device):** confirm by typing "DELETE"; closes DB, deletes DB files, models, audio, secure-store keys, notifications, geofences; returns to onboarding.
- **Delete account:** calls `account-delete` (removes cloud rows for children the user owns and their memberships) and then deletes local data.
- Removing a team member stops their access immediately (RLS); their device deletes its copy on next sync (Section 23.3).

---

## 28. Design System, Accessibility, and Localization

### 28.1 Tokens (`src/ui/theme.ts`)

| Token | Light | Dark |
|---|---|---|
| `bg` | `#F6F7FB` | `#0F1320` |
| `surface` | `#FFFFFF` | `#181D2E` |
| `text` | `#1B2233` | `#E9ECF5` |
| `textMuted` | `#5A6378` | `#A3ABC0` |
| `primary` | `#4A5FD6` | `#8C9BFF` |
| `riskLow` | `#2E8B6E` | `#4CC39C` |
| `riskModerate` | `#B7791F` | `#E5AE52` |
| `riskHigh` | `#C2413B` | `#F07A74` |
| `learning` | `#6B7280` | `#9CA3AF` |
| `border` | `#E3E6EF` | `#2A3148` |

- Risk levels always pair color with an icon and a text label (Low: check-circle, Moderate: half-circle, High: alert-triangle, Learning: sparkles). Icons: `lucide-react-native`.
- Typography: system font (SF Pro / Roboto). Sizes: display 28/34 semibold, title 22/28 semibold, headline 17/22 semibold, body 17/22, callout 16/21, footnote 13/18.
- Spacing on a 4-pt grid (4, 8, 12, 16, 24, 32); card radius 16; sheet radius 24; soft shadows in light mode only.
- Motion: gentle 200 ms fades; respect Reduce Motion (no animations). Light haptic on successful save (`expo-haptics`).
- Tone: calm, warm, short sentences; celebrate logging ("Thanks. Every entry helps EmoLens learn."), never guilt about missed logs.

### 28.2 Accessibility (MUST)

- WCAG 2.1 AA contrast (4.5:1 text, 3:1 large text/icons); verify both themes.
- Dynamic Type / font scaling up to the largest accessibility sizes without truncation (layouts wrap).
- Screen reader labels, hints, and roles for every control; charts expose a text summary (`accessibilityLabel` e.g. "Hard moments by time of day: most common 2 to 4 pm").
- Touch targets ≥ 44×44 pt. No time-limited interactions. No flashing content.
- The fast-path log works one-handed and with a screen reader in two actions.

### 28.3 Localization

- All user-facing strings via i18n keys (`src/i18n/en.json`, `es.json`), including notifications, PDFs, and server-side AI prompts' output language (pass `language` so AI replies in the user's language).
- Localize dates, times (12/24 h per locale), numbers, and units (°F/°C, lb not needed).
- Spanish translations must be complete; list "native-speaker review of Spanish strings" in `docs/HUMAN_TODO.md`.
- Every list and chart has an empty state with guidance (e.g. Patterns: "Patterns appear after about two weeks of logging.").

---

## 29. Error Handling and Offline Behavior

- The app is fully usable offline. Cloud features degrade gracefully: sync queues in the outbox; AI features show "Needs an internet connection"; weather uses cached data (features marked missing if older than 12 h); food search falls back to recent items and custom entries; medication search falls back to a custom name.
- Network GET requests: 10 s timeout, 2 retries with exponential backoff. POSTs to edge functions: 30 s timeout (AI) / 10 s (others), no automatic retry for AI.
- Integration failures appear as warning chips on Today and in Data sources; they never block logging.
- Engine failure: keep the last good fit, show "Forecast temporarily unavailable," record the error in a local `app_errors` table (id, at, area, message) viewable in About → Diagnostics (copyable, contains no personal data).
- Global React error boundary with "Something went wrong," "Try again," and "Copy details."
- Migration failure: never delete data; show a recovery screen offering "Export my data" and "Retry."
- Permission denied: explain the impact and offer `Linking.openSettings()`.

---

## 30. Testing Plan

### 30.1 Engine (`packages/engine/test`), all MUST pass

- **Linear algebra:** Cholesky and solves against known matrices; `A · A⁻¹ ≈ I` (max error < 1e-9) for random SPD matrices up to 40×40; jitter path triggers on a near-singular matrix.
- **Stats:** `normalCdf` vs reference values (|error| < 1e-7 at z ∈ {−5, −2, −1, 0, 1, 1.2816, 2, 5}); softplus stability for |z| up to 800.
- **Logistic fit:**
  1. No data → `β̂ = m`, `Σ = Λ⁻¹`.
  2. Synthetic n = 20,000, d = 6, known β, weak priors → |β̂ − β| < 0.1 for all j.
  3. Perfectly separable data → finite β̂, converged.
  4. At the MAP, ‖g(β̂)‖ < 1e-6.
  5. Analytic gradient matches finite differences (relative error < 1e-5).
  6. Duplicating a row equals doubling its weight.
  7. Zero-weight rows have no effect.
- **τ selection:** strong true effects → selected τ ≥ 1 in ≥ 80% of 50 seeded datasets; all-null effects → τ ≤ 0.75 in ≥ 80%.
- **Prediction:** `v = 0` → `p = σ(μ)`; `p_lo ≤ p ≤ p_hi`.
- **Effect summary:** hand-computed example matches to 1e-9.
- **Samplers:** Beta and Gamma sample means/variances within 2% of theory over 200k draws (including Gamma shape < 1); seeded determinism.
- **Metrics:** AUROC on a hand-computed example; `null` when one class is absent; Brier; reliability bin counts.
- **Insight status:** table-driven tests covering every rule and hysteresis (downgrade only after two consecutive fits).
- **Features:** table-driven tests per feature with hand-built datasets, including a DST-transition day, missing data (with missingness indicators), clamps, and the leakage rule (sensor data inside the block must not affect that block's features).
- **Labels:** every rule and the priority order.
- **Alerts:** quiet hours, daily max, cooldown, learning period, lead time, in-progress block, cancellation when level drops.

### 30.2 Mobile

- Database access behind a `Db` interface; unit tests use a Node `better-sqlite3` adapter with the same migrations.
- Repository tests: writes set `updated_at`, enqueue outbox rows (Care Team on), mark dirty blocks.
- Sync: LWW merge function (including ties), outbox ordering, removal handling.
- Component tests (`@testing-library/react-native`): fast-path episode log in ≤ 2 presses; Today in learning state; confirmation card actions; end-of-day one-tap close; review screen saves only checked items.
- Reports: FHIR bundle structure (resource types, ids, internal references resolve); ABC CSV header and row formatting; SVG generators return valid SVG.
- Redaction: nickname replaced in every outgoing AI payload (property-based test with random nicknames and casings).

### 30.3 Cloud and portal

- `supabase/tests/rls.sql`: a teacher cannot select `medications`; a non-member cannot select anything; a clinician cannot insert episodes; `share_links` unreadable except by owner.
- Edge functions: unit tests for invite-code generation/validation, rate limiting, and share-token hashing.
- Portal: Playwright smoke tests with fixtures (children list, overview renders snapshot, share page renders and expired link message).

### 30.4 Simulator

CI runs a smoke test (5 families × 30 days) that must complete and produce all CSVs.

### 30.5 Manual device QA (`docs/QA_CHECKLIST.md`)

Notification actions (foreground, background, killed app) · geofence enter/exit · HealthKit and Health Connect sync · calendar tagging · BLE pairing, history sync, reconnection · background task execution · offline logging and later sync · VoiceOver/TalkBack walkthrough · largest font size · dark mode · Spanish · app lock · delete all data.

---

## 31. Build, Run, and Deploy

**Prerequisites:** current Node.js LTS, pnpm, Xcode, Android Studio, Supabase CLI, EAS CLI, Python 3.11+, PlatformIO Core.

```bash
# install and verify
pnpm install
pnpm -r typecheck && pnpm -r lint && pnpm -r test

# cloud (local dev)
supabase start
supabase db reset                                  # applies migrations
supabase functions serve                           # local edge functions
# cloud (production)
supabase link --project-ref <ref>
supabase db push
supabase secrets set ANTHROPIC_API_KEY=... ANTHROPIC_MODEL=... AI_DAILY_REQUEST_LIMIT=60 PORTAL_URL=...
supabase functions deploy ai-ask ai-structure ai-digest ai-session-prep invite-create invite-accept share-create share-view account-delete

# mobile
cd apps/mobile
cp .env.example .env                               # fill values
npx expo prebuild
eas build --profile development --platform ios     # and/or android
npx expo start --dev-client

# portal
cd apps/portal
cp .env.example .env.local
pnpm dev                                           # http://localhost:3000
vercel deploy --prod

# simulator + figures
pnpm --filter @emolens/simulator sim --scenario default --families 200 --days 120 --out out/default
python -m venv .venv && . .venv/bin/activate && pip install -r analysis/requirements.txt
python analysis/plots.py --in packages/simulator/out --figures docs/figures

# firmware
python firmware/tools/aweight.py > firmware/src/aweight_coeffs.h
cd firmware && pio run -t upload && pio device monitor
```

`eas.json` profiles: `development` (dev client, internal distribution), `preview` (internal), `production` (store). CI (`.github/workflows/ci.yml`): install → typecheck → lint → unit tests → simulator smoke → `pnpm audit --prod`.

---

## 32. Implementation Phases and Definition of Done

| Phase | Scope | Acceptance check |
|---|---|---|
| 0 | Monorepo scaffold, tooling, CI, docs skeleton, `AIDisclosure.md`, `HUMAN_TODO.md` | CI green on empty packages |
| 1 | Engine math (Sections 13, 14, 17, 18 functions) + tests | All 30.1 math tests pass |
| 2 | Pure feature/label/alert builders (Section 12, 15.2 logic) + simulator + figures | Feature/label/alert tests pass; simulator produces all outputs; `VALIDATION.md` filled with actual numbers |
| 3 | Mobile foundation: encrypted DB + migrations, onboarding, all manual logging, Timeline, settings, i18n (en/es), design system, demo mode shell | Fast-path test passes; app runs on a device |
| 4 | Integrations: weather/air/pollen, calendar, location/places + child device mode, HealthKit/Health Connect, Fitbit, food search/barcode, RxNorm, med reminders, sound check, background task | Each integration shows status and syncs on a real device |
| 5 | In-app forecasting: recompute, fit, predictions, Today live, Insights, trigger detail, worth watching, strategies, model health, alerts, confirmation loop, end-of-day check, demo mode populated from simulator | Demo mode shows patterns, forecasts, model health; alert → confirm → label → refit works end-to-end |
| 6 | Reports (PDF, ABC CSV, FHIR), full export/import, weekly digest (template narrative) | Reports open correctly; FHIR tests pass |
| 7 | Cloud: schema, RLS + tests, edge functions, accounts, Care Team sync, invites, snapshots, share links, portal | RLS tests pass; two devices sync; portal shows a child; share link works and expires |
| 8 | AI: consent, Ask EmoLens tool loop, voice notes (whisper + structuring + rule parser), document import, AI digest narrative, session-prep drafts | Redaction tests pass; tool loop answers "How many hard moments last week?" correctly from demo data |
| 9 | Room sensor firmware, BLE integration, calibration | Live meter updates; history sync after 1 h offline |
| 10 | Polish: accessibility audit, Spanish completion, empty states, performance budget (13.10), privacy review, QA checklist, `ARCHITECTURE_EXPLAINED.md` | All checklist items pass |

**Definition of done (whole project):**

- [ ] Every feature in this README implemented or explicitly listed in `docs/DECISIONS.md` with the reason and substitution.
- [ ] All automated tests pass in CI.
- [ ] `docs/VALIDATION.md` reports real simulator results with all figures.
- [ ] Demo mode demonstrates every screen.
- [ ] `AIDisclosure.md` accurately describes AI use during development and within the application.
- [ ] `ARCHITECTURE_EXPLAINED.md`, `PRIVACY_POLICY.md`, `CONSENT_TEMPLATE.md`, `QA_CHECKLIST.md`, `HUMAN_TODO.md` complete.
- [ ] No secrets in the repository; `.env.example` files document every variable.

---

## 33. Appendix A: LLM Prompts and Tool Schemas

All prompts receive a `language` parameter and must answer in that language. `[CHILD]` is the redaction placeholder.

### A.1 Ask EmoLens system prompt (`ai-ask`)

```
You are EmoLens, a warm, careful assistant that helps a parent or caregiver understand patterns in logs about their autistic child, referred to as [CHILD].

Rules:
- Answer ONLY from data returned by your tools. Call tools to get facts; never guess numbers, dates, or patterns.
- If the data can't answer the question, say so and suggest what to log to answer it in future.
- Be honest about uncertainty. Use the pattern statuses and confidence values exactly as the tools report them. Never call a "possible" pattern proven.
- Never diagnose, never recommend starting, stopping, or changing medications or doses. For medication questions, share what the logs show and suggest discussing it with [CHILD]'s prescriber.
- Use respectful, neurodiversity-affirming language: "hard moment," "meltdown," "shutdown," "distress." Never "tantrum," "bad behavior," or "outburst."
- If the user describes an emergency or someone in danger, tell them to call 911 (or local emergency services) right away.
- Keep answers short: 2–6 sentences or a brief list. Mention time ranges in the family's local time.
- Answer in {language}. Today is {today_local} ({tz}).
```

### A.2 Ask EmoLens tools (defined server-side; executed on device)

```json
[
  {"name":"get_episodes","description":"List hard moments in a date range with optional filters.",
   "input_schema":{"type":"object","properties":{
     "start_date":{"type":"string","description":"YYYY-MM-DD local"},
     "end_date":{"type":"string","description":"YYYY-MM-DD local, inclusive"},
     "types":{"type":"array","items":{"type":"string","enum":["meltdown","shutdown","other"]}},
     "min_intensity":{"type":"integer","minimum":1,"maximum":5},
     "place_type":{"type":"string"}},
     "required":["start_date","end_date"]}},
  {"name":"get_day_summary","description":"Everything logged on one day: episodes, meals, doses, sleep, places, schedule tags, strategies, notes.",
   "input_schema":{"type":"object","properties":{"date":{"type":"string"}},"required":["date"]}},
  {"name":"get_patterns","description":"Current trigger patterns with status, effect (odds ratio with 80% range), confidence 0-100, and evidence counts.",
   "input_schema":{"type":"object","properties":{}}},
  {"name":"get_worth_watching","description":"Specific foods, medications, places, or schedule tags linked to more hard moments.",
   "input_schema":{"type":"object","properties":{}}},
  {"name":"get_forecast","description":"Risk forecast by time block for a date (today or tomorrow) with reasons.",
   "input_schema":{"type":"object","properties":{"date":{"type":"string"}},"required":["date"]}},
  {"name":"get_strategy_stats","description":"Success counts and estimates for each calming strategy, by context.",
   "input_schema":{"type":"object","properties":{"context":{"type":"string","enum":["proactive","during","both"]}}}},
  {"name":"get_medications","description":"Medications with schedules and change history.",
   "input_schema":{"type":"object","properties":{}}},
  {"name":"get_dose_history","description":"Dose records (taken, late, missed, skipped) in a range.",
   "input_schema":{"type":"object","properties":{"start_date":{"type":"string"},"end_date":{"type":"string"},"medication_name":{"type":"string"}},"required":["start_date","end_date"]}},
  {"name":"get_meals","description":"Meals and snacks with items and tags in a range.",
   "input_schema":{"type":"object","properties":{"start_date":{"type":"string"},"end_date":{"type":"string"}},"required":["start_date","end_date"]}},
  {"name":"get_sleep","description":"Nightly sleep in a range with the child's typical sleep.",
   "input_schema":{"type":"object","properties":{"start_date":{"type":"string"},"end_date":{"type":"string"}},"required":["start_date","end_date"]}},
  {"name":"compare_periods","description":"Compare a metric between two date ranges.",
   "input_schema":{"type":"object","properties":{
     "metric":{"type":"string","enum":["episode_count","episode_rate_per_day","avg_intensity","avg_duration","sleep_hours","dose_adherence"]},
     "a_start":{"type":"string"},"a_end":{"type":"string"},"b_start":{"type":"string"},"b_end":{"type":"string"}},
     "required":["metric","a_start","a_end","b_start","b_end"]}},
  {"name":"get_model_health","description":"Forecast accuracy: skill score, Brier score, calibration, alert hit rate.",
   "input_schema":{"type":"object","properties":{}}},
  {"name":"search_notes","description":"Full-text search over notes and episode notes.",
   "input_schema":{"type":"object","properties":{"query":{"type":"string"},"start_date":{"type":"string"},"end_date":{"type":"string"}},"required":["query"]}}
]
```

Each result is JSON: `{"rows":[...], "total":N, "truncated":bool}` (or a summary object), with `ref` on every row.

### A.3 Voice/document structuring (`ai-structure`)

System prompt:

```
You convert a caregiver's voice note or a school report into structured log entries for an app about an autistic child, [CHILD]. Only extract what is clearly stated. Do not invent times, amounts, or events. Resolve relative times using now_local and tz. Match medication, strategy, and place names to the provided lists when possible; otherwise leave them as spoken. If nothing loggable is present, return empty arrays and put the text in notes. Always call record_structured_log exactly once.
```

Tool (forced via `tool_choice`):

```json
{"name":"record_structured_log","description":"Structured entries extracted from the text.",
 "input_schema":{"type":"object","properties":{
   "episodes":{"type":"array","items":{"type":"object","properties":{
      "started_at_local":{"type":"string","description":"YYYY-MM-DDTHH:MM"},
      "type":{"type":"string","enum":["meltdown","shutdown","other"]},
      "intensity":{"type":["integer","null"],"minimum":1,"maximum":5},
      "duration_min":{"type":["integer","null"]},
      "place_label":{"type":["string","null"]},
      "antecedent_note":{"type":["string","null"]},
      "strategies":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"helped":{"type":["boolean","null"]}},"required":["name"]}}},
      "required":["started_at_local","type"]}},
   "med_doses":{"type":"array","items":{"type":"object","properties":{"medication_name":{"type":"string"},"taken_at_local":{"type":"string"},"status":{"type":"string","enum":["taken","missed","skipped"]}},"required":["medication_name","status"]}},
   "meals":{"type":"array","items":{"type":"object","properties":{"eaten_at_local":{"type":"string"},"meal_type":{"type":"string","enum":["breakfast","lunch","dinner","snack","drink"]},"items":{"type":"array","items":{"type":"string"}}},"required":["meal_type","items"]}},
   "sleep":{"type":["object","null"],"properties":{"bedtime_local":{"type":"string"},"wake_local":{"type":"string"},"night_wakings":{"type":["integer","null"]}}},
   "illness":{"type":"array","items":{"type":"object","properties":{"kind":{"type":"string"},"severity":{"type":"integer","minimum":1,"maximum":3}},"required":["kind"]}},
   "routine_change":{"type":["string","null"]},
   "notes":{"type":["string","null"]}},
  "required":["episodes","med_doses","meals","illness"]}}
```

### A.4 Weekly digest narrative (`ai-digest`)

```
Write a 120–180 word weekly summary for a parent about [CHILD], using ONLY the statistics JSON provided. Be warm, factual, and encouraging. Start with the overall picture, mention one or two notable changes or patterns (with their stated confidence), mention what helped, and end with one gentle, optional suggestion about what to keep logging. No medical advice, no medication suggestions, no diagnosis. Neurodiversity-affirming language only. Answer in {language}.
```

### A.5 Session-prep draft (`ai-session-prep`)

```
You are drafting session-preparation notes for a clinician who works with [CHILD], based ONLY on the caregiver-logged data and statistical summaries provided. Produce four sections with headings: "Caregiver-reported summary", "Logged data summary", "Patterns observed (with confidence)", "Questions to explore in session". Report counts and trends precisely. Describe patterns using their stated status and confidence; never present them as causes. Do not diagnose, assess, or recommend treatment or medication changes. Mark the whole output as an AI draft for clinician review. Answer in {language}.
```

---

## 34. Appendix B: Default Content (Strategies, Tags, Copy)

### B.1 Default strategies

| Name | Category |
|---|---|
| Quiet space / break area | environment |
| Noise-reducing headphones | sensory |
| Dim lights / reduce visual input | sensory |
| Deep pressure / weighted item | sensory |
| Comfort object | sensory |
| Allow stimming / movement | movement |
| Movement break (walk, swing, jump) | movement |
| Calm, few words / co-regulation | connection |
| Give space and time | connection |
| Visual schedule / first-then | routine |
| Advance warning before a change | routine |
| Reduce demands | routine |
| Offer choices | routine |
| Snack or water | body_needs |
| Bathroom / check for pain or discomfort | body_needs |
| Favorite activity or special interest | preferred_activity |
| AAC / communication support | connection |

### B.2 Antecedent tags ("What was happening before")

`transition`, `waiting`, `demand_or_task`, `told_no`, `change_in_plans`, `loud_noise`, `crowd`, `bright_or_visual`, `smell_or_texture`, `hungry`, `tired`, `pain_or_sick`, `new_place`, `new_person`, `screen_ended`, `sibling_or_peer_conflict`, `unknown`.

### B.3 Behavior tags ("What it looked like")

`crying`, `yelling`, `dropping_to_floor`, `running_or_bolting`, `hitting_or_kicking`, `self_injury`, `throwing`, `withdrawing`, `not_responding`, `hiding`, `repetitive_movements`, `covering_ears`, `other`.

### B.4 Suspected-trigger options (onboarding step 7) → feature keys

| Option (UI) | Feature keys nudged |
|---|---|
| Not enough sleep | `sleep_deficit`, `night_wakings` |
| Hunger | `hunger_gap` |
| Sugary foods | `high_sugar_recent` |
| Caffeine | `caffeine_recent` |
| Missed or late medication | `missed_dose`, `late_dose` |
| Medication changes | `med_change_recent` |
| Transitions between activities | `planned_transitions`, `arrival_recent` |
| Changes in routine | `unusual_day` |
| Appointments | `appointment_near` |
| New places | `new_place` |
| School | `place_school` |
| Stores / crowded places | `place_store_public` |
| Loud environments | `noise_high` |
| Hot or stuffy rooms | `temp_uncomfortable` |
| Weather changes | `pressure_change`, `heat_or_cold` |
| Being sick or in pain | `illness` |

### B.5 Rule-parser keywords (on-device voice structuring)

- Meltdown: meltdown, melted down, screaming, crying hard, lost it, fell apart, overwhelmed.
- Shutdown: shutdown, shut down, went quiet, stopped talking, froze, withdrew, hid.
- Other: upset, distressed, hard moment, rough time.
- Intensity words: mild → 1–2, big/bad → 4, worst/huge → 5.
- Spanish equivalents in `src/voice/keywords.es.ts` (crisis, se desreguló, lloró mucho, se cerró, se escondió, etc.).

### B.6 Reason templates (en)

| Feature | Raising | Protective |
|---|---|---|
| `sleep_deficit` | "Short sleep last night ({h} h less than usual)" | "Good sleep last night" |
| `hunger_gap` | "It's been a while since eating{est}" | "Recently ate" |
| `missed_dose` | "A missed medication dose" | n/a |
| `med_change_recent` | "A recent medication change" | n/a |
| `planned_transitions` | "{n} planned transition(s) in this window" | "A predictable stretch" |
| `arrival_recent` | "Just arrived somewhere" | n/a |
| `unusual_day` | "Today's routine is different" | "A normal routine day" |
| `appointment_near` | "An appointment around this time" | n/a |
| `new_place` | "Being somewhere new" | n/a |
| `noise_high` | "A loud environment recently" | "A quiet environment recently" |
| `illness` | "Feeling unwell" | n/a |
| `recent_episode` | "A hard moment happened recently" | n/a |
| `tod_afternoon` etc. | "Afternoons tend to be harder" | "Mornings tend to be calmer" |
| physiology | "Body signs of stress (heart rate)" | "Calm body signals" |

`{est}` renders as " (expected)" when the input is estimated. Every feature in the registry MUST have a raising template and, where sensible, a protective template, in both languages.

### B.7 "How we know this" (help text, en)

"EmoLens starts with a gentle guess about how much each factor matters, then updates that guess every time you log. When a factor keeps showing up before hard moments (and doesn't show up as much during calm times), EmoLens becomes more confident it's linked. The confidence meter shows how much of EmoLens's starting uncertainty has been cleared up by {Nickname}'s own data. A link isn't proof that one thing causes another, but it can point to things worth trying."

### B.8 Template digest sentences (used when cloud AI is off)

- "{Nickname} had {n} hard moments this week ({change} compared with last week)."
- "Most happened in the {tod_group}."
- "EmoLens's pattern for {factor} is now {status}."
- "{strategy} helped {s} of {t} times."
- "Thanks for logging on {k} of 7 days. Every entry sharpens the forecasts."

---

## 35. Appendix C: Research Background

- **Wearable prediction of aggression in autistic youth.** Goodwin et al., *Autism Research* 12:1286–1296 (2019): in 20 autistic youth observed over 87 hours, a wrist biosensor (heart rate, electrodermal activity, skin temperature, motion) predicted aggression toward others 1 minute before onset with about 84% accuracy, using ridge-regularized logistic regression.
- **Extension to longer horizons.** Goodwin and colleagues (Northeastern University), *JAMA Network Open* (late 2023): 70 youths with 497 hours of biosensor and behavioral data containing 6,665 documented behaviors; logistic regression was the best-performing classifier, predicting aggressive behavior 3 minutes before onset with a mean AUROC of 0.80.
- **Design implications for EmoLens:** (1) physiological arousal carries predictive signal; (2) simple, regularized logistic models perform well, which supports EmoLens's explainable Bayesian logistic regression with shrinkage; (3) EmoLens complements minute-scale wearable prediction with *hours-ahead*, context-based forecasting (sleep, schedule, medication, environment) that caregivers can plan around, and personalizes it per child.
- **Product inspirations:** Jvala (chronic-illness flare tracker: one-tap logging, Bayesian daily risk forecast with reasons, integrations, clinician reports, weekly digest) and emoTune (student-built, neurodiversity-focused AI coaching app).

Cite the published papers (not news coverage) in the submission video and in `docs/ARCHITECTURE_EXPLAINED.md`; the student should read and verify each citation directly.
