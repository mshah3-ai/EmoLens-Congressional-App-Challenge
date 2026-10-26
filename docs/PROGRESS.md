# Progress log

## Session 1 (built in a claude.ai sandbox without network access)

### Done
- Monorepo scaffold: root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.github/workflows/ci.yml`.
- `packages/shared`: constants (SPEC 5), dataset types, FEATURE_REGISTRY (SPEC 12.4, 39 features),
  Appendix B content in English + Spanish (strategies, tags, suspected triggers, reason templates, status labels, help text).
- `packages/engine` (pure TS, no third-party runtime deps):
  - `stats.ts` sigmoid/softplus/erfc-based normal CDF/mulberry32/Gamma/Beta/Poisson samplers
  - `linalg.ts` Cholesky with jitter, solves, inverse, log-determinant
  - `logistic.ts` MAP Newton-Raphson with backtracking + Laplace covariance + log marginal
  - `shrinkage.ts` tau selection; `predict.ts` predictive p with 80% range + contributions
  - `insights.ts` effect summary, exposure counts, status rules, hysteresis, effect sentences
  - `betabinomial.ts`, `calibration.ts`, `health.ts`, `reasons.ts`, `levels.ts`, `alerts.ts`, `strategies.ts`
  - `features/` time zones (Intl), blocks (DST-aware), feature builder (actual + forecast mode, leakage rule),
    labels (incl. naive policy for the intervention-trap experiment), feature enabling, priors, worth-watching items
  - `pipeline.ts` `runEngine()`: the one entry point for app, portal and simulator
- Tests: `test/math.test.ts` (9) and `test/logistic.test.ts` (8): 17/17 pass.
  Bug found and fixed while testing: the backtracking check used an absolute 1e-12 tolerance, which rejected good
  Newton steps near the optimum because of floating-point noise; now relative to |L|.

### Next (Phase 2)
1. Table-driven tests for features (incl. a DST-transition day, missingness indicators, clamps, leakage rule),
   labels (every rule + priority), alerts (quiet hours, daily max, cooldown, learning, lead time, in-progress block,
   cancellation), insight status (every rule + hysteresis). Fix any engine bugs they reveal.
2. `packages/simulator`: `generate.ts` (pure TS, no Node APIs, so demo mode can import it), `run.ts`, scenarios,
   experiments E1-E6, CSV outputs; `analysis/plots.py`; `docs/VALIDATION.md` with the real numbers.

### Notes for the next session
- Engine timestamps are epoch milliseconds; local dates are 'YYYY-MM-DD'. The app converts from SQLite ISO strings.
- Performance idea for the simulator: actual-mode features depend only on data before the block, so they can be
  cached per block (`EngineOptions.featureCache`) instead of recomputed each simulated day.

## Session 2 (2026-09-28): Phase 0 finished

### Done
- Fixed the two failures in `pnpm -r typecheck` / `pnpm -r lint`:
  1. `packages/shared` asked for Node type definitions (`"types": ["node"]`) it does not install. Shared code is
     also used by the phone app and portal, so it must not rely on Node; it now uses `"types": []`.
  2. `packages/simulator` had no source files, so `tsc` stopped with "No inputs were found". Added a placeholder
     `src/generate.ts` (replaced in Phase 2).
- Lint: ESLint 10 + typescript-eslint (`eslint.config.mjs` at the root). Each package's `lint` script runs ESLint and
  then `tsc` with unused-code checks. The only existing findings were `x != null` checks, which are intentional, so
  `eqeqeq` allows comparisons with `null`. See DECISIONS #10.
- CI: the simulator smoke step is skipped until `packages/simulator/src/run.ts` exists (DECISIONS #11).
- Doc skeletons from SPEC Section 4: `ARCHITECTURE_EXPLAINED.md` (engine and shared sections written),
  `VALIDATION.md`, `PRIVACY_POLICY.md`, `CONSENT_TEMPLATE.md`, `QA_CHECKLIST.md`; `docs/figures/.gitkeep`.
- `pnpm -r typecheck && pnpm -r lint && pnpm -r test` all pass (engine 17/17; simulator has no tests yet).
- LICENSE copyright name left as `<student name>` at the student's request.

### Next
Phase 2 (see the "Next (Phase 2)" list in Session 1 above).

## Session 3 (2026-09-28/29): Phase 2 done

### Done
- **Engine tests (SPEC 30.1):** `features.test.ts`, `labels.test.ts`, `alerts.test.ts`, `insights.test.ts`, plus
  `helpers.ts` for small hand-built datasets.
  - They cover every feature (a test checks that the registry is fully covered), DST spring-forward and fall-back
    days, missingness indicators and feature enabling, clamps, the leakage rule, forecast mode, every label rule and
    its priority, every alert rule, every status rule at its boundaries, and hysteresis.
  - Engine total: 213 tests, all passing.
- **Bugs found and fixed:**
  1. Hysteresis counted *fits*, not *daily* fits (SPEC 14.3). The app refits many times a day, so a status could
     drop after two fits a minute apart. `StatusHistoryEntry` now has `lastRawDate`, and `runEngine` passes the
     local date (DECISIONS #12).
  2. (simulator) `withOverrides` merged effect maps key by key, so an override could not remove a planted effect.
     It now replaces them whole.
- Status thresholds moved to `STATUS_THRESHOLDS` in shared constants, with unchanged values (DECISIONS #13).
- **Simulator** (`packages/simulator`):
  - Pure generator, day-by-day simulation, metrics and summaries; demo mode can import all of it.
  - Node runner with worker threads, experiments E1-E6, and CSV/JSON outputs.
  - 8 tests, including a CLI smoke run. The CI smoke step now runs.
- **Validation study:** 200 families × 120 days × 16 settings, 569 s on 14 cores.
  - Results and figures in `docs/VALIDATION.md` and `docs/figures/`; summary JSONs in `docs/validation-data/`.
  - Acceptance: detection @90 = 0.785 ✔; null likely/strong ≤ 0.035 ✔; E2 CI excludes 0 ✔ (small effect).
  - Skill > 0 in ≥ 80% of families at day 45 ✘ (64.5%). Not reachable by any forecaster here: even the oracle is
    at 72%.
- **Tuning (allowed by 26.6):** `TAU_GRID` [0.5, 0.75, 1.0, 1.5] → [0.75, 1.0, 1.5]. Before it, worst-day null
  likely/strong was 0.055. Logged in the VALIDATION tuning log and DECISIONS #14.
- `analysis/plots.py` + `requirements.txt`; Python 3.12 (Homebrew) in a gitignored `.venv`.
- Docs: ARCHITECTURE_EXPLAINED (tests, simulator, the shrinkage lesson), DECISIONS #12-21, AI_DISCLOSURE.

### Notes for the next session
- Demo mode (Phase 5): `simulateFamily(scenario, 0)` from `@emolens/simulator` runs one synthetic family through
  the real engine. Read `scenarios/default.json` as the scenario.
- An open design question for the student (not a tunable): trigger priors shrink toward positive starting guesses,
  not toward 0 (see VALIDATION Section 4).
- `pnpm` is still not on PATH on this Mac. Use `corepack pnpm ...` until `corepack enable` is run (HUMAN_TODO).

### Next
Phase 3 (mobile foundation), SPEC Section 32.

## Session 4 (2026-09-29): Phase 3 done (mobile foundation)

### Done
- `apps/mobile`: Expo SDK 57 (React Native 0.86, expo-router 57), TypeScript strict, development builds only.
- **Encrypted database:** op-sqlite + SQLCipher; 32-byte key in Keychain/Keystore; migration `001_init.sql` with every
  table from SPEC 6.2; migrations run in transactions; the app refuses to run without SQLCipher.
- **Repository layer:** every syncable write sets the standard columns, writes the outbox only when Care Team is on (never
  place coordinates), and marks dirty blocks (±24 h; +21 days for medication changes; everything for wake-window/
  school-day/tracked-type changes). Soft delete + undo.
- **Onboarding:** all 13 steps of SPEC 8, saved in one transaction. The reveal step has animation.
- **Manual logging:** hard moment (two-tap fast path, full form, Safety Card, "add details" notification 45 min later,
  auto-answer of an open alert), meals (recent items, automatic caffeine/color/new-food tags), medications (add/edit/stop
  with change history, daily dose rows, taken/late/missed/skipped), sleep, place check-in, illness (+ "Mark better"),
  routine change, notes, proactive strategy use.
- **Today, Timeline, Insights (learning state), Team (local-only), More** with settings: child profile, medications,
  places, alerts & quiet hours, privacy (app lock, privacy cover, delete all data), language, device role,
  about + diagnostics, AI disclosure, "How EmoLens works".
- **English + Spanish**, complete (test-enforced). **Design system** from SPEC 28 with WCAG contrast test.
  App icon + splash.
- **Demo-mode shell:** separate `emolens-demo.db`, banner, enter/exit, synthetic profile.
- Engine: `doses.ts` (dose status rules) + tests.
- Tests: engine 215, simulator 8, mobile 27 (migrations, repositories, fast path in 2 presses, contrast, i18n).
  `expo-doctor` 21/21; `expo export` bundles iOS and Android.
- Visual check: screens were rendered in a temporary web preview (sql.js in memory, not committed) and screenshotted
  with headless Chrome. This found and fixed: a crash if notifications fail at startup, awkward reminder wording, an SVG
  accessibility prop. **Not yet run on a real phone**: needs the EAS build steps in HUMAN_TODO.
- Decisions #22-#38 in DECISIONS.md.

### Next (Phase 4: integrations)
Weather/air/pollen, calendar, location/places + child device mode, HealthKit/Health Connect, Fitbit, food search +
barcode, RxNorm, medication reminders (MED_DOSE actions), sound check, background task. Each needs a new EAS build.
Places already exist without coordinates; add "Use current location"/address search to `settings/place.tsx` and
onboarding step 10. Turn the "Soon" rows in onboarding step 11 and More into real Data sources screens.

### Notes for the next session
- Run `pnpm -r typecheck` after editing any `.sql` migration (it regenerates bundled copies).
- The mobile component test uses RNTL v14: `await renderRouter(...)` and `await fireEvent.press(...)`.

## Session 5 (2026-09-29): iOS launch crash fixed
- Symptom: white screen, then "EmoLens quit unexpectedly" in the iOS 27 Simulator. Crash reports: `EXC_BREAKPOINT` in
  UIKit's `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`; the log says "Application failed to launch:
  UIScene life cycle is required for apps built with this SDK."
- Cause: Expo SDK 57's native template creates the window in the AppDelegate (no scenes). Apps built with Xcode 27 must
  use scenes. No JavaScript involved.
- Fix: config plugin `apps/mobile/plugins/withSceneLifecycle.js` (DECISIONS #39) + 3 tests. `expo prebuild --clean` and
  `npx expo run:ios` build and install; the app now launches, loads the JS bundle from Metro and shows the Welcome
  screen, with no new crash reports. Tapping through onboarding in the Simulator was not automated (no tap tool; the
  Simulator window was closed), so the student should tap through by hand.
- Tip: if the dev client says "Failed to load app from http://<your-ip>:8081", open
  `exp+emolens://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081` with `xcrun simctl openurl booted ...`
  (the Simulator shares the Mac's localhost).

## Session 6 (2026-09-29): Phase 4 (integrations)

### Done
- **Integration layer** `apps/mobile/src/integrations/`: each source has isAvailable / requestPermission / sync / status
  (SPEC 11); network GETs with a 10 s timeout and 2 retries (SPEC 29); per-source state (on/off, last sync, last error).
- **Sources:** weather + air quality + pollen (Open-Meteo, rounded home location, every 3 h, 120 days kept); Apple Health
  (HealthKit, with background delivery) and Health Connect (sleep → nights, heart rate, resting HR, HRV, steps; 60 days
  at first); calendar (choose calendars, whole-word auto-tags incl. Spanish, own keywords, re-tag/ignore kept across
  syncs); location (current location, address search, geofencing up to 20 places, arrivals/departures → place visits,
  "While Using" fallback); sound check (30 s, metering only, audio deleted, power-averaged; automatic 60 s on the
  hard-moment sheet); food (Open Food Facts barcode scanner, USDA name search, sugar/caffeine/artificial-color tags);
  RxNorm medication search; medication reminders (daily/weekly, Given / Skip, no medication names in the text).
- **Background:** `emolens-refresh` task (every 30+ min, 25 s budget) and `emolens-geofence`; refresh on start and on
  return to the app (at most every 5 min). One failing source never blocks the others.
- **Screens:** More → Data sources, Calendars, Calendar events; place map locations; onboarding steps 10 (Home location)
  and 11 (live permissions); Today source chips and Sound quick-add; Timeline shows calendar events and sound checks;
  Child device mode (status screen + local collection).
- **Not built:** Fitbit (its Web API shuts down around 2026-09-30; DECISIONS #40).
- Tests: engine 215, simulator 8, mobile 66 (32 new in `test/integrations.test.ts`). `expo-doctor` 21/21; Metro bundles
  iOS and Android; `expo prebuild` + `expo run:ios` build for the Simulator (see below).
- Decisions #40-#52. HUMAN_TODO "Phase 4" lists the USDA key, the contact email, and what needs a real phone.

### Acceptance (SPEC 32: "each integration shows status and syncs on a real device")
Met on 2026-09-29: the student's hand-testing passed (see Session 10). Bug #1 was fixed in Session 9.

### Next (Phase 5: in-app forecasting)
Load SQLite into a `ChildDataset` (weather_hourly, calendar_events tags, place_visits, sound_samples, health_samples /
block_physio, sleep_entries…), recompute dirty blocks, fit, predict, Today live, Insights, alerts, confirmation loop,
end-of-day check, and demo mode filled from the simulator.

## Session 7 (2026-09-29): Apple Health fix (BUGS.md #3)
- Hand-added Health sleep is "In Bed" only; nights now fall back to in-bed time. Switching sources on always asks; a
  sync with no data shows "No data received". "Sync now" reports what was imported. DECISIONS #53.
- Mobile tests: 73. Verified in the Simulator with real HealthKit (1 night + 1 heart-rate reading imported).

## Session 8 (2026-09-29): Calendar list fix (BUGS.md #4)
- `getCalendars()` needed Reminders permission on iOS; now event calendars only. "Choose calendars" separates no access
  (Open Settings), load errors and none found, and re-checks on return from Settings. DECISIONS #54. Mobile tests: 76.

## Session 9 (2026-09-29): Phase 4 Simulator bug round (BUGS.md #5-#10, #1)
- #5 "Delete all data" → Render Error: the session was cleared while screens were still shown; now it shows the
  loading screen first, then onboarding.
- #6 Medication reminder: couldn't be reproduced (scheduled correctly and delivered in the Simulator). Fixed three
  real problems nearby: time-zone conversion (child's home time → phone clock), "Given" on a same-day medication, and the
  save message now says when the next reminder comes (or that notifications are off).
- #7 Calendar: "No calendars found" was #4 (already fixed); verified again. New: switching Calendar on goes straight to
  the calendar picker.
- #8 "Location couldn't sync": the iOS Simulator can't monitor regions (`ERR_GEOFENCING_UNAVAILABLE`); the Location card
  now says "Works partly" with what to do, and Sync now explains it. DECISIONS #55.
- #9 (and #1) Back: a test taps Back on all 13 onboarding steps, 13 sheets and 13 settings screens. Fixed step 9 with the
  medication form open, and Back doing nothing on a screen opened without history (e.g. after a reload).
- #10 Weather card: "Change Home's location" once it is set.
- Tests: engine 215, simulator 8, mobile 116. Typecheck and lint pass; iOS bundle exports.

## Session 10 (2026-09-29): Phase 4 DONE
- The student re-tested every Phase 4 item and the Session 9 bug fixes; all passed. Phase 4 is complete.
- Final state: engine 215 tests, simulator 8, mobile 116; typecheck and lint pass. BUGS.md #1-#10 fixed.
  Decisions #40-#55.
- Still only checkable on a real phone (HUMAN_TODO "Phase 4", item 4): barcode scanning (no camera in the Simulator) and
  arriving at a place in the background (the Simulator can't watch places, DECISIONS #55).

### Next (Phase 5: in-app forecasting)
See "Next (Phase 5: in-app forecasting)" in Session 6.

## Session 11 (2026-09-29): Phase 5 (in-app forecasting) built

### Done
- **Engine** (`history.ts`): day-ahead snapshot rule, Model Health inputs, alert metrics, weekly fits + effect history, day
  outlook. **Simulator:** `simulateSteps` (one day per step, same results, returns the caregiver log) and `demo.ts`.
- **Forecasting on the phone** (`apps/mobile/src/forecast/`): SQLite -> `ChildDataset`, recompute job (block rows, dirty
  features, labels, proactive outcomes), forecast run saving fits (one per day), day-ahead snapshots, in-block forecast,
  forecast-mode features and a screen snapshot (`engine_snapshots`, migration 003). Runs 2 s after saves, with every refresh
  pass (open / return / background), after forecast-relevant setting changes, and on "Refit now".
- **Alerts and the confirmation loop:** engine `planAlerts` -> alert rows + heads-up and "How did it go?" notifications
  (no medication or place names), notification buttons, Today answer cards, the three answers, "What did you try?",
  end-of-day check + next-morning follow-up, morning outlook, new-pattern notice, daily end-of-day reminder.
- **Screens:** Today (live strip with levels and outcomes, Now card with chance / range / "x usual" / reasons / ideas,
  answer and end-of-day cards), block sheet, confirm, end-of-day, Insights hub, trigger detail (2 charts), worth watching,
  strategies (tabs, discovery, add / rename / archive), Model Health, Timeline heads-ups. Charts in `src/ui/charts.tsx`.
- **Demo mode from the simulator** (student's choice): simulated once on the phone with a progress screen, saved,
  "Regenerate demo data"; demo-only tools (sample heads-up, ask about a past time).
- Decisions #56-#69. HUMAN_TODO "Phase 5" has the hand-test list. QA checklist rows 24-26.
- Tests: engine 224, simulator 12, mobile 138. Typecheck and lint pass. The running Metro server bundles iOS with the
  new code.

### Acceptance (SPEC 32)
- "Alert -> confirm -> label -> refit works end-to-end": automated in `test/forecast.test.ts` for all three answers (real
  SQLite, engine and simulator) and in `test/phase5Screens.test.tsx` from Today's card.
- "Demo mode shows patterns, forecasts, model health": the 120-day demo built for 2026-09-29 (family 0, Node) shows
  sleep and planned transitions Strong, illness Likely, missed dose Possible, sugar (the wrong parent guess) No clear link,
  and noise Likely although noise has no true effect (confounded with school). Model Health: skill +2.0% vs the
  time-of-day guess, AUROC 0.61, 795 checked forecasts; 18 heads-ups (10 stepped in, 4 calm, 1 hard moment, 3 unanswered).
- **Not checked visually by me:** the iOS Simulator was running without a window and AppleScript GUI control isn't allowed
  on this Mac, so I couldn't tap through the new screens. Render tests cover them; the student's hand test is the check.

### Performance (SPEC 13.10)
- Demo build, 120 days, Node on this Mac: 6.4 s (simulation 5.5 s). The simulation alone with the JIT off
  (`node --jitless`, closer to the phone's Hermes interpreter): 6.0 s vs 1.4 s with JIT. Expect roughly 10-20 s on a phone;
  the real figure appears in the demo sheet ("Built on this phone in N s").
- One live forecast run on the 36-day test demo: about 0.3 s in Node. About → Diagnostics shows the last run's time on the
  phone.

### Next
Phase 6 (reports and exports, weekly digest), after the student's Phase 5 hand test.

## Session 12 (2026-09-30): Phase 5 DONE
- The student's hand test passed all 14 items in HUMAN_TODO "Phase 5": demo build, Today, Insights, What helps, Model
  Health, the heads-up -> "How did it go?" loop with all three answers, "Ask about a past time", the end-of-day check and
  the 8:30 pm "Quick check" notification, Timeline, Spanish, dark mode / large text / VoiceOver, Regenerate and leaving the
  demo. **The 120-day demo built in 11 s in the iOS Simulator** (Hermes), inside the 10-20 s estimate.
- Polish from the hand test:
  1. Trigger detail: "Strong link" next to "39%" could confuse judges. The meter is now "How precisely EmoLens knows the
     size of this effect", with a line explaining the status ("“Strong link” = EmoLens is confident this raises the
     chance. The meter shows how pinned-down the exact size is."), a per-status meaning for every status, a caption on
     the Insights rows, and updated "How we know this" help text, in English and Spanish (DECISIONS #70).
  2. Plurals: "1 planned transition(s)" -> "1 planned transition" / "2 planned transitions" (and Spanish). Engine texts
     use `{n, plural, ...}` in the shared `fmt` (Intl.PluralRules); app strings use i18next `_one`/`_other`. The whole-app
     check also fixed "Helped 1 of 1 times", "Seen in 1 time blocks", the evidence sentence, "worth watching" sentences,
     Model Health's data line and alert summary, and the demo's day count.
- Committed Expo's `apps/mobile/tsconfig.json` (Expo removed `expo-env.d.ts` from `include`).
- Tests: engine 228, simulator 12, mobile 153 (new: `engine/test/reasons.test.ts`, `mobile/test/plurals.test.ts`, the
  "(s)" / `{{count}}` rule in `i18n.test.ts`, and the status-vs-meter screen test). Typecheck and lint pass.

### Next
Phase 6 (reports and exports, weekly digest), SPEC Section 32.

## Session 13 (2026-09-30): Phase 6 (reports, exports, backup, weekly digest) built

### Done
- **Engine** (`summary.ts`): summaries over a date range (hard moments per type / day / part of the day, busiest day,
  medication adherence, sleep vs usual, end-of-day streak), the weekly digest's numbers (`digestStats`) and schedule
  (`latestDigestWeek`); `antecedentFactors` for the ABC export; `timeOfDayRows` and `sleepReference` made reusable.
- **PDF report** (`apps/mobile/src/reports/`): date presets (2 weeks / 30 / 90 days / custom), Clinician / School / Family
  audiences (School leaves out medications, sleep, health, body signals and place names, in the data), selected notes,
  13 sections with SVG charts, Letter or A4 by region, printed with expo-print, shared with expo-sharing.
- **ABC data CSV** (byte-order mark, the SPEC header, RFC 4180 quoting, automatic antecedents from the engine) and
  **FHIR R4** bundle (random Patient id per export, nickname only when switched on, episode and sleep Observations with
  LOINC 93832-4, MedicationStatement / MedicationAdministration). LOINC 93832-4 checked in NLM's LOINC service.
- **Export all data / Import a backup** (Privacy & security) and **Restore from a backup** (welcome screen): zod checks
  built from the database's own columns, preview, last-writer-wins merge in one transaction, one child per phone
  (a different child only by "Replace", typed confirmation).
- **Weekly digest:** made at the first forecast run after the digest time (default Sunday 6 pm), one notification,
  digest screen (summary sentences from Appendix B.8 in the current language, daily and time-of-day charts, pattern
  changes since last week, what helped, heads-ups, medications, sleep, Share as PDF), More → Weekly digests (list, day and
  time). Demo mode now has a digest for every simulated week.
- Decisions #71-#83; HUMAN_TODO "Phase 6" (one app rebuild + 14 hand tests); QA checklist #27-#32;
  ARCHITECTURE_EXPLAINED 5.12; `docs/FHIR_VALIDATION.md`.
- Tests: engine 247, simulator 12, mobile 181 (new: `engine/test/summary.test.ts`, `mobile/test/reports.test.ts`,
  `backup.test.ts`, `phase6Screens.test.tsx`; Back checks on the 4 new screens). Typecheck and lint pass; the iOS bundle
  exports (`npx expo export --platform ios`).

### Acceptance (SPEC 32: "Reports open correctly; FHIR tests pass")
- **FHIR tests pass:** resource types, unique ids, every reference resolves inside the bundle, new Patient id each export,
  no name unless opted in, LOINC/UCUM on sleep, dose statuses (on the 30-day demo and on hand-built data).
- **Reports open correctly:** automated: the report HTML contains every section for each audience, its SVG charts parse
  as well-formed XML, and the buttons print and share (with the native modules faked). **Not yet checked by eye on a
  phone**: I couldn't render the PDFs here (no PDF viewer for me, and the headless-browser screenshots were declined), so
  the layout, page breaks and page numbers are the student's hand test (HUMAN_TODO "Phase 6", items 1-7).
- A sample from the 120-day demo (built for 2026-09-30, Node): 17 weekly digests; the 30-day clinician report; 75 hard
  moments in the ABC file with automatic antecedents; the full backup is 7.8 MB (mostly model fits and sound samples)
  and exports in about 15 ms in Node.

### Next
The student rebuilds the app (new native modules) and does the Phase 6 hand test. Then Phase 7 (cloud, Care Team,
portal), SPEC Section 32.

## Session 14 (2026-09-30): bug #11, "Couldn't create the file" (PDF report and ABC data)
- Reported: on the iOS Simulator, "Create PDF report" (every audience and range) and "ABC data" failed; FHIR worked.
- Reproduced: the Simulator's app folder showed both failed before writing any file. The phone's Hermes engine has
  no `Intl.PluralRules` (checked in the dev build's Hermes framework). The shared `fmt` called it (Phase 5 plurals polish),
  and the PDF report and the ABC export both use `fmt`; FHIR doesn't. A new test with `Intl.PluralRules` removed failed
  9/9 on the old code with "Intl.PluralRules is not a constructor", including the demo build and the forecast run: so
  **forecasts on the phone have been failing since the plurals change** too, and "Regenerate demo data" would have
  failed.
- Fixed: `fmt` writes out the English/Spanish CLDR plural rule (`isPluralOne`); no rebuild needed. Every file feature now
  records failures by step (`report.pdf · print: ...`) in About → Diagnostics and prints them in the dev terminal, with
  paths and quoted text scrubbed. Checked the other file features: the digest PDF, "Export all data" and backup import
  don't use `fmt`, and zod uses no `Intl`; all are covered by the new test anyway.
- Tried and not possible here: running the loaders inside the Simulator app through Metro's debugger (not permitted in
  this session); the Hermes compiler can't run scripts.
- Tests: engine 249, simulator 12, mobile 197 (new: `hermesIntl.test.ts`, `fileErrors.test.tsx`). Typecheck and lint pass.
  DECISIONS #84, BUGS.md #11, HUMAN_TODO re-test list.

## Session 15 (2026-09-30): Phase 6 hand-test fixes (BUGS.md #12-#18)
- The student confirmed PDF creation works after bug #11. Fixed their 7 findings, each with a test:
  unique export file names incl. the audience (#12), "How precisely known" 3900% -> 39% (#13), headings kept with their
  content across page breaks (#14), heatmap labels spaced by width (#15), "About the same chance" for ~1.0× effects in
  English and Spanish (#16), proper labels for calendar-tag items ("Transitions") (#17), and an automated School-report
  privacy test.
- The privacy test found real gaps in the School report (#18): the kind of place per hard moment, the therapy/medical and
  relatives' place patterns, and non-home place names in worth watching. Fixed; the test fails on the old code and passes
  now. The School share-link snapshot doesn't exist yet (Phase 7); `test/privacyChecks.ts` is ready for it.
- Tests: engine 250, simulator 12, mobile 209 (new: `reportLayout.test.ts`, `schoolPrivacy.test.ts`). Typecheck and lint
  pass. DECISIONS #85-#87; HUMAN_TODO re-test list. No rebuild needed.

## Session 16 (2026-09-30): Phase 6 DONE, follow-ups
- The student's Phase 6 hand test (14 items) and both re-test lists passed. Phase 6 is complete.
- Follow-ups the student asked for, each with a test:
  1. Importing a backup that adds nothing now says "Everything in this backup is already on this phone. Nothing was
     duplicated." (Spanish too) instead of "Imported: 0 new, 0 updated."
  2. Demo hard moments look like a real parent's log (DECISIONS #88): the place where the simulated child was, "what
     happened before" tags that match the simulated situation, behavior tags by type, varied lengths, an occasional
     short note, and blank details on fast-path and busy-day ones. The engine never reads these fields: a test runs the
     engine on the demo with and without them and gets identical fits, forecasts, patterns and worth-watching items.
     **VALIDATION unchanged:** the full study (200 families x 120 days x 16 settings, 603 s) was rerun and all 25
     summary files in `docs/validation-data/` are identical apart from the run-time fields.
  3. In the PDF's hard-moments table the date, time and duration never wrap onto two lines.
- Tests: engine 250, simulator 13, mobile 211. Typecheck and lint pass.

### Next
Phase 7 (cloud, Care Team, portal).

## Session 17 (2026-09-30): Phase 7 built; cloud tests waiting for Docker / Supabase CLI / Deno
### Done (checked without the cloud)
- **Schema + RLS** (`supabase/migrations/`): cloud tables, last-writer-wins and server-time triggers, owner membership,
  RLS for every table; pgTAP tests written (`supabase/tests/database/rls.test.sql`), **not yet run**.
- **Edge functions** (`supabase/functions/`): invite-create / accept, member-remove, share-create / revoke / view,
  account-delete; Deno unit tests and API integration tests written, **not yet run**.
- **App:** accounts (email code), Care Team sync (outbox push, pull, last writer wins, Realtime, backoff), turning on /
  joining, invites, removal, heads-ups across phones, insight snapshots and school-hours forecasts, share links, teacher
  mode, account deletion. Tested against an in-memory cloud with the same rules (`test/fakeCloud.ts`): 18 sync tests,
  4 screen tests. Two real bugs found and fixed on the way (device id of the last writer; the owner's first sync).
- **Shared report** (`packages/reports`, strings in `packages/shared/i18n`) used by the app, portal and share links;
  byte-for-byte parity test; found and fixed BUGS.md #19 in the phone's PDF.
- **Portal** (`apps/portal`, Next.js 16): sign-in, children, overview, hard moments + CSV, medications, strategies,
  notes, report, join, public share page; CSP with nonce; builds; 4 unit tests; Playwright smoke tests written.
- Tests now: engine 250, simulator 13, reports 3, portal 4, mobile 238 (+4 real-cloud tests skipped without Supabase).
- Docs: DECISIONS #89-#111, BUGS #19, HUMAN_TODO Phase 7, ARCHITECTURE_EXPLAINED 6, QA #33-40, privacy policy, AI_DISCLOSURE.

### Next
1. The student installs Docker Desktop, the Supabase CLI and Deno (HUMAN_TODO Phase 7 A).
2. `supabase init` (config.toml: 6-digit email code in the magic-link template, `share-view` public), `supabase start`,
   then `pnpm test:cloud` (pgTAP RLS, function integration, two-phone sync, portal Playwright) and `deno` checks; fix
   what they find; commit.
3. Deploy with the student (HUMAN_TODO Phase 7 D), then the hand test (E).

## Session 18 (2026-09-30): Phase 7 cloud tests run and pass on the local Supabase
- The student installed Docker Desktop, the Supabase CLI (2.119) and Deno (2.9). `supabase init` + `supabase start`;
  all three migrations applied cleanly.
- **Results (`pnpm test:cloud`):**
  - **RLS (pgTAP): 61/61.** This includes the SPEC 30.3 proofs: a teacher reads no medications, a non-member, a removed
    member and a signed-out visitor read nothing from any table, a clinician can't insert hard moments, and share links
    are readable only by the owner.
  - **API integration: 9/9:**
    - invites, including a used code and rate-limited guessing;
    - who may invite, share or remove;
    - removal ends access;
    - share create / view / revoke / expired / malformed;
    - the server's School privacy check;
    - account deletion cascades.
  - **Two phones on the real stack: 4/4:**
    - a caregiver's phone gets every synced table, with no coordinates, notification ids or audio paths;
    - the later edit wins on both phones and in the cloud;
    - a teacher's phone gets nothing private, and its school log reaches the owner;
    - a removed caregiver is told and reads nothing.
  - **Portal Playwright: 5/5:**
    - sign-in redirect;
    - a clinician's overview from the snapshot, medications and report;
    - the teacher view;
    - share page working, revoked and expired;
    - security headers.
  - **Deno: 10/10** unit tests, `deno check` and `deno lint` clean.
- **Fixed while running them:**
  - One RLS test didn't exercise the rule: the edit was dropped by the last-writer-wins trigger first. Fixed the test
    and added a check that the row is unchanged.
  - Deno refused `@supabase/server` 1.9.0, published less than a day ago; pinned 1.8.1 (DECISIONS #112).
  - Deno tried to rewrite the root `package.json`; it now has its own `supabase/functions/deno.json`.
  - Expo's Jest setup replaces the network functions, so the real-cloud two-phone test now runs in plain Node
    (DECISIONS #113).
  - The portal no longer breaks on a snapshot whose Model Health is missing parts.
  - The Mailpit helper no longer compares clocks: Docker's clock was 44 s behind the Mac's.
- Tests: engine 250, simulator 13, reports 3, portal 4 (+5 e2e), mobile 238, Deno 10, cloud 61 SQL + 13 integration.
  Typecheck and lint pass in every package.

### Next
Deploy with the student (HUMAN_TODO Phase 7 D), then the hand test (E). Phase 7 acceptance: RLS tests pass ✔, two
devices sync ✔ (automated; the two-Simulator hand test is pending), portal shows a child ✔, share link works and
expires ✔.

## Session 19 (2026-10-01): deployed
- **Database:** `supabase db push` applied the 3 migrations to the student's project (`liczaptwohlgvykauupr`). Before
  pushing I checked their "automatic RLS" setting: an event trigger that only enables RLS on new public tables. It is
  harmless with our migrations.
- **Functions:** the 7 edge functions are deployed. `share-view` is public, the others require sign-in.
  `PORTAL_URL` is set.
- **Portal:** Vercel project `emolens-portal` (root `apps/portal`, Node 22, portal-only install, `.vercelignore`) at
  https://emolens-portal.vercel.app. Live checks: login page 200, the CSP / X-Frame-Options / Referrer-Policy / HSTS
  headers, signed-out redirect, and an unknown share link showing "This link is no longer available." with noindex.
- **Auth:** `config push` with a `[remotes.production]` block: portal URL, redirect URLs, 6-digit codes, no extra
  confirmation email. Email templates are blocked on the free plan with the built-in sender (DECISIONS #115), so the
  sign-in email is link-only until custom SMTP is set up: the portal works by link; the app waits for SMTP (HUMAN_TODO D3).
- **RLS parity (requested):** compared the catalog of local and production. All 27 public tables have RLS on (none
  forced); all 69 policies (command, roles, USING and WITH CHECK), the table privileges (no `anon` privileges; signed-in
  users never DELETE), the 42 triggers, the helper functions and the 20 Realtime tables are identical. The only
  difference is the project's own `rls_auto_enable`. Every production table returned 401 to the anonymous key, and an
  anonymous insert was refused.

### Next
Custom SMTP (the student's choice, HUMAN_TODO D3), then the phone app against production; the hand test (E).

## Session 20 (2026-10-01): local hand-test setup
- Local Supabase running (the edge-functions container had stopped; restarted). `apps/mobile/.env` and
  `apps/portal/.env.local` point at it; share links use `http://localhost:3000`.
- BUGS #20: the Simulator kept running an old copy of the app from a stale Metro address; fixed by opening through
  `localhost` (HUMAN_TODO C4). New `test/cloudConfig.test.ts`. BUGS #21: a sync test's fixed dates fixed.
- Tests: mobile 242 (new: `cloudConfig.test.ts`, 4). Typecheck and lint pass.
- BUGS #22 (found in hand test E8): "Made on", share-link / invite expiry, backup date and FHIR "today" now use the
  child's home time zone instead of UTC. Tests: reports 5, mobile 243.

## Session 21 (2026-10-06): hand tests 1, 2, 3, 4 and 7 passed; removal change
- Simulator couldn't reach Metro: Metro had been started with `--localhost`, which made it listen on IPv6 `::1` only,
  while the Simulator asks for `127.0.0.1`. Restarted without the flag; both Simulators connected.
- DECISIONS #118 (from hand test 4): a removed member's phone always deletes its copy at the next sync, for every
  role, and says "You're no longer on Max's care team. Their information has been removed from this phone." No "keep"
  choice. New `test/removal.test.ts`; `sync.test.ts` checks the full deletion; the screen test checks there is no keep
  button. Tests: mobile 245. Typecheck and lint pass.

## Session 22 (2026-10-08): Phase 7 DONE
- SPEC 32 acceptance for Phase 7 is met: RLS tests pass (61), two devices sync (automated two-phone test and the
  student's two-Simulator hand test), the portal shows a child (portal e2e), a share link works (student's hand test)
  and expires (integration test).
- Still open (not part of the acceptance): re-tests after BUGS #22 and DECISIONS #118, the remaining hand tests in
  HUMAN_TODO Phase 7 E, a custom email sender (D3), and redeploying the portal so production has the #22 date fix.
- Backup: private GitHub repository `asharma2511/emolens` (the student's account, checked with `gh api user`), pushed
  from `main`. Checked first: no `.env` files, keys or tokens anywhere in the history (only the two `.env.example`
  templates are tracked), no file over 5 MB.
- The student's portal, clinician, account and Spanish hand tests passed (reported 2026-10-08). Left: re-test
  "Made on" (#22) and removal (#118).
- Portal redeploy: Vercel blocked the first try. With the repo on (private) GitHub, a Hobby team only deploys commits
  whose author it can match to the team, and git had no email set (it made one up from the Mac's network name). This
  repo's commits now use the student's GitHub noreply address (`git config user.email`, this repo only).
  Still blocked with that address: the Vercel login isn't linked to GitHub `asharma2511` (HUMAN_TODO Phase 7 D4).
  Production still serves the 2026-10-01 portal.
- After the student linked GitHub `asharma2511` to Vercel, the production deploy went through (`dpl_6AeN…`, commit
  `a67a7a7`). emolens-portal.vercel.app serves it: signed-out visitors go to /login, security headers present, an
  unknown share link says "This link is no longer available."
- CI on GitHub was red: every check passed except `pnpm audit --prod --audit-level high`, which found three new high
  advisories. `source-map-js` pinned to the fixed 1.2.2; the two with no fix yet are ignored by id with reasons
  (DECISIONS #119). Typecheck, lint, all tests and the portal build pass locally.

## Phase 7: COMPLETE (2026-10-08)
- SPEC 32 acceptance: RLS tests pass (61) ✔, two devices sync ✔ (automated and the student's two-Simulator test), the
  portal shows a child ✔, a share link works and expires ✔.
- The student's hand tests all passed locally: two-Simulator sync, offline, heads-ups, teacher, removal, portal,
  clinician, share links, account and Spanish. Re-tests passed after the fixes: "Made on" shows the home date (BUGS
  #22; Oct 8 on a School share link and the PDF) and removal deletes the copy by itself with only OK (DECISIONS #118).
- Deployed: Supabase `liczaptwohlgvykauupr`; portal https://emolens-portal.vercel.app (`dpl_6AeN…`, with the #22 fix).
- Backup: private GitHub repo `asharma2511/emolens`; CI green on `main` (build and cloud).
- Tests: engine 250, reports 5, simulator 13, portal 4 (+5 e2e), mobile 245, Deno 10, cloud 61 SQL + 13 integration.
- Still open: a custom email sender (HUMAN_TODO D3, DECISIONS #115) before the phone app can sign in to production.
- For Phase 10: BUGS #23 (School report: only school-hours / at-school hard moments) and #24 (time-of-day chart vs.
  the summary's "Most often in …").


## Session 23 (2026-10-08): Phase 8 built (AI features)
- **What the student must do first** is in HUMAN_TODO "Phase 8" A-D: an Anthropic API key (console, credit, spend
  limit), the key in `supabase/functions/.env` for local tests (never in the chat), later in the Supabase dashboard
  for production, and one app rebuild (`npx expo run:ios`).
- **Model:** `claude-sonnet-5-5` (the SPEC's model, checked against Anthropic's current model list); changeable with
  `ANTHROPIC_MODEL`. Current API rules applied (DECISIONS #120-#122): official SDK, structured outputs instead of a
  forced tool call, thinking blocks sent back unchanged in an append-only conversation, server-side refusal fallback,
  prompt caching, explicit effort.
- **Cloud:** migration `20261008000001_ai.sql` (atomic daily counter, server role only); functions `ai-ask`,
  `ai-structure`, `ai-digest`, `ai-session-prep` (clinician check on the server); fixed prompts and tools on the
  server only; request checks (no client prompts/tools, block types, size); 429 `daily_limit`, 502 `ai_unavailable`,
  422 `ai_declined`.
- **Phone:** consent screen (More → AI features); the single AI door with nickname redaction; Ask EmoLens (13 tools
  run on the phone, ≤ 6 rounds, "Based on N entries", copy, clear, Today bar, Insights card); voice notes (whisper.rn
  on the phone, model download with SHA-256 check, audio deleted unless kept, iPhone only: #125); school-note photos
  (on-device text recognition, photo deleted: #123); review screen (only ticked cards saved); on-device rule parser
  (en/es); the digest's AI summary.
- **Portal:** "Draft session prep" for clinicians (redacted summary from the report data, AI draft label, edit, mark
  final).
- **SPEC 32 acceptance (automated):** redaction tests pass (shared property test: 3,000 random nicknames; app test:
  every AI request with 20 random nicknames planted in notes, place names and voice text); the tool loop answers
  "How many hard moments last week?" with the same number as an independent count of the demo database
  (`test/askLoop.test.ts`, with a scripted stand-in for the model).
- **Still to do with the student:** the same question against the real model (`EMOLENS_LIVE_AI=1 pnpm --filter
  @emolens/mobile test:live-ai`, once the key is in place), the hand tests (HUMAN_TODO Phase 8 E), then deploy to
  production (migration, 4 functions, secrets, portal).
- Tests: engine 250, shared 6 (new), reports 5, simulator 13, portal 6 (+6 e2e), mobile 283 (+3 live, skipped),
  Deno 26, cloud 66 SQL + 17 integration. Typecheck and lint pass.

## Session 24 (2026-10-08): Phase 8 checks with the student's key
- `pnpm test:cloud` with the student's portal dev server stopped: RLS 66, integration 17, **portal e2e 6** all pass
  (including the new session-prep e2e).
- Live check (`test:live-ai`) reached Anthropic, but the key was refused: `401 invalid x-api-key`. Confirmed directly
  against `api.anthropic.com/v1/models` (status only; the key was never printed). The file's format is correct (one
  line, right name, usual length, no quotes or spaces), so the key itself is not active. The student is replacing it.
- Bug found by the live check: under Jest, a 502 from an AI function was shown as "offline" because
  `supabaseApi.call` used `instanceof Response`, which fails when supabase-js's fetch comes from another realm. Now
  checked by shape; the live check correctly reports `ai_unavailable`. Mobile 283 tests still pass.

## Session 25 (2026-10-13): live check against the real model PASSED
- Two more keys were refused (`401 invalid x-api-key`; one had 260 characters). The third key works.
- `EMOLENS_LIVE_AI=1 pnpm --filter @emolens/mobile test:live-ai`: **3/3 pass** with `claude-sonnet-5-5`.
  (A first attempt timed out in setup while the local Supabase was still restarting; the rerun took 19 s.)
  - **"How many hard moments last week?"**: the model called `get_episodes` for Mon 2026-10-05 – Sun 2026-10-11 and
    answered "3 hard moments", listing each one. An independent count of the demo database gives 3. 2 requests
    (1 tool round), nickname absent from every request and restored in the answer.
  - **Real cost of that question: $0.0124.** Tokens: 6 input, 438 output, 3,009 cache writes, 2,264 cache reads
    (prices $2 / $10 / $2.50 / $0.20 per million). Most of it is the cache write ($0.0075) and the answer ($0.0044).
  - **Voice-note structuring:** valid structured log (meltdown at 15:30 "after school", 20 min, headphones helped,
    melatonin missed). The model left intensity empty because the note gives no number.
  - **Digest summary:** 150-200 words, factual. The first run began with a remark about the "[CHILD]" placeholder;
    fixed in the digest and session-prep prompts (DECISIONS #133) and the rerun was clean.
- Deno 26 tests pass after the prompt change.

## Session 26 (2026-10-13): BUGS #25, the app wouldn't load after the Phase 8 rebuild
- Red screen "Unable to resolve module buffer" from `safe-buffer`, pulled in by whisper.rn (voice notes). Fixed
  without a polyfill: Metro redirects `safe-buffer` to a stand-in that throws if whisper.rn's unused base64 path is
  ever called (DECISIONS #134).
- New `pnpm --filter @emolens/mobile bundle:check` (also a CI step): builds the iOS and Android release bundles and
  fails on an unresolvable or Node-only module. It fails on the old code with the student's exact error and passes now
  (~20 s). The source map shows no `safe-buffer`; whisper.rn is still bundled.
- Checked in the Simulator's dev build: a separate Metro server (port 8082) served the dev bundle (5,237 modules, HTTP
  200, no `safe-buffer`); the dev launcher listed it. iOS's "Open in EmoLens?" prompt can't be tapped from the command
  line, so the student confirms the app opens (JS change only: restart Metro with `--clear` and reload; no rebuild).
- Tests unchanged: typecheck, lint and all tests pass (mobile 283, engine 250, Deno 26, ...).

## Session 27 (2026-10-14): Phase 8 hand tests passed; six fixes (BUGS #26-#31)
- The student's 10 Phase 8 hand tests passed. Test 9 used a temporary local limit of 2; it is back to 60 (config.toml,
  the running functions) and the temporary value was never committed.
- Fixes, each with a test: strategy review cards and everyday strategy words (#26), digest note when the AI summary
  fails (#27), the real reset time of the daily limit (#28, DECISIONS #135), formatted AI answers and digest summary
  (#29), a calm daily-limit notice without Try again (#30), "Ask EmoLens needs an internet connection" when the phone
  has no internet (#31, `expo-network`, DECISIONS #136: needs one app rebuild).
- Tests: mobile 294 (+11: `phase8Fixes.test.tsx` 9, `ruleParser.test.ts` 2), others unchanged; typecheck, lint and
  `bundle:check` pass.

## Phase 9: DEFERRED (2026-10-15)
- The student chose to skip the room sensor (firmware, BLE, calibration) because of the submission deadline. Recorded
  as future work in DECISIONS #138, README and ARCHITECTURE_EXPLAINED §8. The phone's sound check already measures room
  noise, and nothing else depends on the sensor. The app shows it as "Soon" with a note pointing to the sound check.
  QA checklist rows 7-9 (BLE) are marked n/a.

## Session 28 (2026-10-15): Phase 10 started (submission polish)
- Order, most important first: (1) bugs a judge or user could notice, (2) privacy follow-ups, (3) accessibility and
  Spanish pass, (4) README / ARCHITECTURE_EXPLAINED / demo-video script, (5) AI_DISCLOSURE, (6) honest Definition of
  Done check, (7) access log only if time allows.
- Open items carried: re-test the six Phase 8 fixes (BUGS #26-#31; #31 needs one app rebuild; also confirm the app
  opens after #25) and deploy Phase 8 to production (migration, 4 AI functions, `ANTHROPIC_API_KEY` secret, portal).
- Step 1 (bugs a judge or user could notice) DONE: sound check stops cleanly in the background / when closed / after
  sleep, no console error (BUGS #32); the Sound check screen's "sound.listening" text and the Today header contrast
  (#33); the report's "most likely" sentence and the chart agree, with an outside-waking-hours note (#24, DECISIONS
  #140); School report and share links show only school-time hard moments by default (#23, DECISIONS #139).
  Tests: mobile 310 (+16), reports 6 (+1); typecheck, lint, all tests and `bundle:check` pass.
- Step 2 (privacy follow-ups) DONE: `docs/PRIVACY_REVIEW.md` (who can see and do what, the test behind each rule, NOT
  TESTED where none; fixed and still-open items); invite preview of what each role will and will never see
  (`ROLE_ACCESS`); server School-link check now also covers "worth watching" and patterns (BUGS #34, needs the
  functions deploy); overstated "never leaves this phone" texts corrected; PRIVACY_POLICY and CONSENT_TEMPLATE filled
  in; legal review (HIPAA, FERPA, COPPA, state health-data laws) added to HUMAN_TODO. Access log: not built (only if
  time allows).
- Step 3 (accessibility and Spanish) DONE: Spanish keys complete (1600+ en = es); new `spanishScreens.test.tsx` renders
  Today, Insights, Model Health, Strategies, Timeline, Team, Reports, Log a hard moment and Invite in Spanish on the
  Spanish demo and finds no English, raw keys or English filler; plural strings always get a count (found the
  "sound.listening" bug, #33); Today header contrast (#33); 44 pt touch targets on Ask's source list; button role on
  date/time picker backdrops. Headers: screen, sheet and section titles already have the header role (shared
  components); every chart has a spoken summary. Hand checks with VoiceOver and the largest text size are on the
  Phase 10 checklist. Tests: mobile 320, reports 7, Deno 26; typecheck, lint, all tests, `bundle:check` pass.
- Step 4 (docs for judges) DONE: README rewritten (what it does, how the forecasting works with the real validation
  numbers, privacy, AI use, stack, map, future work); ARCHITECTURE_EXPLAINED brought up to date (stale status lines,
  new §9 Phase 10, §10 research citations, §11 questions judges may ask); `docs/DEMO_SCRIPT.md` (3½-minute demo-mode
  video script, screen by screen, with checklist, citations and don'ts).
- Step 5 (disclosure documentation) UPDATED: AI-use information is consolidated in `AIDisclosure.md`.
  Repeated file-level disclosure comments have been removed; the in-app More → AI disclosure screen uses a
  translated summary. Review the centralized statement for accuracy before submission.
- Step 6 (Definition of Done check) DONE, honest status below. Quick fixes made during it: Delete all data also stops
  place alerts (SPEC 27.4; `deleteAll.test.ts`); empty message on the Strategies "During" tab; a timing test for the
  13.10 budget (Mac: 12 ms per n=3,000 d=40 fit, 37 ms for the tau grid; phone check is QA row 49); `.env.example`
  files now list every variable (contact email, older anon key, server options). Recorded: DECISIONS #141 (screens not
  in demo mode), #142 (11.4 location source priority not built), #143 (Reduce Motion relies on Reanimated); #29 and
  #69 updated.
- Step 7 (access log): NOT built (time). Listed under Future work in the README.

### Definition of Done (SPEC 32), status on 2026-10-15
| Item | Status |
|---|---|
| Every feature implemented or in DECISIONS | **Mostly.** About 125 features checked. Not built, now recorded: room sensor (#138), Fitbit (#40), Android voice notes (#125), child-device physio upload (#108), location source priority (#142), Reduce Motion for two animations (#143), Export on the database-error screen (#29). Partly: notification-privacy tests exist only for medication reminders; digest charts have no empty-state text |
| All automated tests pass in CI | Yes locally (see the test counts in CLAUDE.md); CI green on every Phase 10 push that has finished |
| VALIDATION.md has real results and all figures | Yes (8 figures; one target missed and explained) |
| Demo mode demonstrates every screen | Yes except Care Team, Account and the portal (by design, #141) |
| AI-use disclosure | Consolidated in `AIDisclosure.md`; developer should review the statement before submission |
| ARCHITECTURE_EXPLAINED, PRIVACY_POLICY, CONSENT_TEMPLATE, QA_CHECKLIST, HUMAN_TODO complete | Written. PRIVACY_POLICY is a draft (hosting region, contact address, legal review open); CONSENT_TEMPLATE has [brackets] to fill; **QA_CHECKLIST has not been run on a real device** (all rows unticked) |
| No secrets in the repo; .env.example documents every variable | Yes (scan for API keys, JWTs and private keys found none; no .env files tracked) |
| Phase 10 row: accessibility audit, Spanish, empty states, performance, privacy review, QA checklist | Automated parts done; **hand parts open**: VoiceOver/TalkBack walkthrough, largest text size, native-speaker Spanish review, performance on a phone, the QA checklist |
| Open from earlier phases | Re-test BUGS #26-#31 (#31 needs a rebuild); deploy Phase 8 to production; custom email sender D3 (phone sign-in to production) |

## Session 29 (2026-10-22): validation tuning attempt (VALIDATION Section 4, DECISIONS #144)
- Goal: day-90 detection 0.785 → 0.86–0.87, allowed tunables only, fake likely/strong ≤ 0.05 on every day; keep the
  original settings if the goal isn't reached.
- The current code reproduces the published study exactly (E1 CSV byte-identical; all six experiments' summaries
  compared). Figures regenerated: unchanged.
- Search: 3 rounds, 25 settings, tuning seeds 101–104 (50 families each). Lowering P(raises) or adding τ = 0.6 broke
  the 0.05 limit; wider priors lowered detection; lower exposure minimums plus OR ≥ 1.25 helped most.
- Confirmation (200 new families, seed 20261022): setting A 0.853 (0.830–0.875), worst fake 0.043; original 0.774
  (0.748–0.800), worst 0.037. **Goal missed, so the original settings are kept**; no engine numbers changed.
- Added `packages/simulator/src/tune.ts` / `tuneWorker.ts` and `sim --seed`.
- Later the same day: goal 0.93 at day 120. Rounds 4–5 (17 settings, incl. experiments outside 26.6: prior means,
  recency half-life). Every setting reaching 0.93 broke the 0.05 fake-pattern limit (best within the limit about
  0.90), so nothing was adopted (DECISIONS #145).

## Session 30 (2026-10-22): text polish for families; data sources checked
- Removed creator-facing text from the app: Room sensor and Fitbit rows, "(soon)", "coming update", iOS Simulator
  notes, τ / convergence / engine time (engine time now only in development builds), "for now" on voice notes.
- More → AI disclosure: a translated family note instead of the repo file list (DECISIONS #146).
- Unused Bluetooth permissions removed; Health and Calendar permission texts made accurate (needs a rebuild).
- Data sources: Open-Meteo (weather, air, pollen), Open Food Facts and RxNorm answered live; USDA needs the student's
  free key; device sources need only permissions. HUMAN_TODO "Data sources: ready-to-go check".
- New test: no app text reads as a builder's note (i18n.test.ts).

## Session 31 (2026-10-22): place search with suggestions to tap (DECISIONS #147)
- `src/integrations/placeSearch.ts` (Photon), `src/ui/PlaceSearch.tsx` (search box, suggestions, offline fallback),
  used by More → Places → Add/Edit and onboarding Home. Privacy texts, PRIVACY_POLICY and PRIVACY_REVIEW updated.
- BUGS #35 fixed: the Spanish demo's meal names are now Spanish (found by the Spanish screen test).
- Tests: `placeSearch.test.tsx` (8); mobile total 332.

## Session 32 (2026-10-24): setting A adopted (DECISIONS #144)
- `STATUS_THRESHOLDS.likely`: exposed 20 → 15, exposedPos 5 → 3, or 1.3 → 1.25 (pHarm 0.90 unchanged); engine
  boundary tests updated (`insights.test.ts`).
- Full study re-run (seed 20260928, 621 s): detection 0.841 @90 (0.815–0.867), 0.894 @120 (0.874–0.914); worst daily
  fake likely/strong 0.042 (day 65). Only status-based numbers changed (3,890 other summary values identical).
  Confirmation seed 20261022 reproduces 0.853 / 0.880 / 0.043 exactly.
- Figures regenerated (fig1, 5–8 changed; 2–4 identical). Earlier results kept: VALIDATION Section 4,
  `docs/validation-data/before-setting-A/`, `docs/figures/before-setting-A/`.
- README, ARCHITECTURE_EXPLAINED (3.6, Section 4, judge Q&A), DEMO_SCRIPT updated.

## Session 33 (2026-10-24): local portal demo child
- `apps/mobile/test/portalDemo.seed.test.ts` (`pnpm --filter @emolens/mobile seed:portal-demo`; skipped otherwise): builds
  the 120-day demo with the app's demo builder, adds 8 synthetic caregiver notes, uploads it with the real Care Team
  sync as parent@emolens.test, shares today's insight snapshot, and adds clinician@emolens.test by invite code. LOCAL
  only (refuses any non-local address). Checked in a browser as the clinician: every portal page shows data.
- `apps/mobile/test/nodeFetchShim.ts`: Jest's `performance` lacks `markResourceTiming`, which undici needs.


## Session 34 (2026-10-25): publication-style Figure 1
- `analysis/fig1_publication.py` (student's script) now renames the simulator's columns itself; run on the setting A
  results (`packages/simulator/out/E1/default/daily_metrics.csv`, seed 20260928, 200 families).
- Wrote `docs/figures/fig1_publication_video.png` (1920×1080) and `fig1_publication_print.pdf`/`.png`. Labeled values
  match VALIDATION: 84% day 90 (0.8412), 89% day 120 (0.8938), worst day 4.2% (0.0416, day 65).
