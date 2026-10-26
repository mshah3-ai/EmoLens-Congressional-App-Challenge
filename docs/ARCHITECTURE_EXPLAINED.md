# How EmoLens works (plain-English guide)

This guide is written so you can study it and explain EmoLens to judges. Each section says what a part of the app
does, why it is built that way, and which files to open. It grows as each build phase is finished
(see `docs/PROGRESS.md`). Section 8 (room sensor) is future work; everything else is built.

## 1. The big picture
EmoLens helps a family notice patterns behind their child's hard moments (for example: short sleep, busy days with
many transitions, a missed medication dose). Families log hard moments; the app also collects context such as
sleep, meals and calendar events. A statistics engine then estimates which things are linked to a higher chance
of a hard moment, how sure it is, and what the next day might look like.

Everything is stored on the phone, encrypted. Nothing leaves the phone unless the family turns on Care Team
sharing or the optional AI features.

The code is one repository with several packages:

| Folder | What it is | Status |
|---|---|---|
| `packages/shared` | Shared constants, data types, the list of model features, and all app text (English + Spanish) | Built |
| `packages/engine` | The math: turns a child's logged data into patterns and forecasts | Built and tested |
| `packages/reports` | The report shared by the phone's PDF, the portal and share links | Built |
| `packages/simulator` | Generates made-up families to test that the engine really works | Built (Phase 2) |
| `analysis/` | Python script that draws the validation figures | Built (Phase 2) |
| `apps/mobile` | The phone app (React Native + Expo) | Built |
| `apps/portal` | Website for clinicians the family invites | Built (Phase 7) |
| `supabase/` | Optional cloud database for Care Team sharing, and the AI server functions | Built (Phases 7-8) |
| `firmware/` | Optional room sensor (noise, light, temperature) | Future work (deferred, DECISIONS #138) |

**Key design rule:** the engine is written once, in `packages/engine`, and the app, portal and simulator all use
that same code. So the simulator's test results describe exactly the math that runs on the phone.

## 2. Shared package (`packages/shared`)
- `constants.ts`: every tunable number in one place (for example, how confident the engine must be before it
  shows a pattern).
- `features.ts`: the *feature registry*. A "feature" is one measurable thing about a two-hour time block, such as
  "slept at least an hour less than usual last night" or "number of transitions on the calendar". Each entry has
  a starting guess (a *prior*) for how strongly it is linked to hard moments.
- `content.ts`: all text the engine produces, in English and Spanish, following the language rules in SPEC Section 1
  (for example "hard moment", never "tantrum").

## 3. The engine (`packages/engine`)
### 3.1 Time blocks and features
The day is split into two-hour blocks. For each block the engine computes the features using **only data from
before the block starts** (the *leakage rule*), so a forecast never "cheats" by looking at the answer.
Files: `src/features/blocks.ts`, `src/features/build.ts`, `src/features/time.ts`.

### 3.2 Labels
Each past block gets a label: hard moment, calm, "stepped in" (the parent was warned, acted, and nothing happened),
or unknown. "Stepped in" blocks are not counted as calm, because the calm might only be thanks to the parent's
help. Counting them as calm would teach the model that the warning signs were harmless (the *intervention trap*).
File: `src/features/labels.ts`.

### 3.3 The model: Bayesian logistic regression
The engine fits one model per child. It predicts the chance of a hard moment in a block from that block's
features. "Bayesian" means it starts from sensible guesses (priors) and updates them as data arrives, and it
keeps track of how uncertain each estimate is. The best estimate is found with Newton's method, and the
uncertainty with the Laplace approximation. Files: `src/logistic.ts`, `src/linalg.ts`, `src/stats.ts`.

### 3.4 Shrinkage: avoiding fake patterns
With little data, random coincidences can look like patterns. The engine pulls all trigger estimates toward their
starting guesses (the priors) by an amount (tau) that it chooses from the data itself (*empirical Bayes*): if most
possible triggers look like noise, it shrinks harder. File: `src/shrinkage.ts`.

One lesson from the simulator (see `docs/VALIDATION.md`): tau makes the starting guess *narrower* but does not move
it. Most starting guesses are small positive numbers ("this might raise risk a little"), so shrinking too hard made
the model more and more sure of the starting guess itself, and a few factors with no real effect reached "likely".
The fix was to stop offering the smallest tau (0.5); tau is now picked from 0.75, 1 and 1.5.

### 3.5 Forecasts, reasons and risk levels
For an upcoming block the engine gives a probability with an 80% range, the top reasons (which features push the
chance up or down the most), and a low / moderate / high level compared with the child's own usual rate.
Files: `src/predict.ts`, `src/reasons.ts`, `src/levels.ts`.

### 3.6 Pattern status and confidence
Each possible trigger gets a status such as "possible link" or "likely link" only after enough evidence. A status
is only lowered after two **daily** fits in a row agree, so it doesn't flicker (*hysteresis*). The app refits many
times a day, so several fits on the same date count as one; a test found and fixed this. File: `src/insights.ts`.

**Status and meter answer two different questions** (a judge may ask why "Strong link" sits next to "39%"):
- The **status** asks: *does this factor raise the chance at all?* "Strong link" needs EmoLens to be at least 97.5% sure
  the effect is above zero (and the low end of its range at least 1.2x), with enough days and examples. "Likely link"
  needs at least 90% sure, an effect of at least 1.25x, and at least 15 time blocks with the factor, 3 of them followed
  by a hard moment (tuned in the simulator, see Section 4).
- The **precision meter** asks: *how precisely do we know how big the effect is?* It is 1 - (the effect's current
  uncertainty / its starting uncertainty), so 39% means the child's own data has removed 39% of the starting uncertainty
  about the size. Example: "somewhere between 1.4x and 2.8x" is clearly above 1x (strong link) but still a wide range
  (low precision). The meter fills slowly, because pinning down a size needs many more examples than seeing a direction.
- The app says both plainly on the trigger screen: "“Strong link” = EmoLens is confident this raises the chance. The meter
  shows how pinned-down the exact size is." (The spec calls the meter "confidence"; the screen calls it precision so the
  two numbers aren't confused. DECISIONS #70.)

### 3.7 Alerts, strategies and model health
- `src/alerts.ts`: decides whether to send a heads-up (respects quiet hours, a daily maximum and a cooldown).
- `src/strategies.ts`, `src/betabinomial.ts`: which calming strategies seem to help.
- `src/calibration.ts`, `src/health.ts`: checks whether past forecasts matched what actually happened.

### 3.8 One entry point
`src/pipeline.ts` (`runEngine`) runs all of the steps above in order. The app, portal and simulator all call it.

### 3.9 How we test it
`packages/engine/test` has 213 automatic tests. Run `pnpm --filter @emolens/engine test`.
- `math.test.ts`, `logistic.test.ts`: the math against known answers (for example, the model recovers known
  effects from 20,000 synthetic rows).
- `features.test.ts`: one small hand-built example per feature ("a meal 5 hours ago gives hunger_gap = 2"),
  including daylight-saving days (a 23-hour and a 25-hour day), missing data, clamps, and the leakage rule (a loud
  room *during* a block must not change that block's features). `helpers.ts` builds the tiny example datasets.
- `labels.test.ts`: every labeling rule and which rule wins when several apply.
- `alerts.test.ts`: quiet hours, the daily maximum, the 3-hour cooldown, the learning period, alert timing, and
  cancelling an alert when the risk drops.
- `insights.test.ts`: every pattern-status rule at its exact boundary, and the hysteresis rules.
They are *table-driven*: each test is one row in a table (input and expected answer), which makes it easy to read
and to add cases.

## 4. Simulator and validation study
**Why:** with a real family we never know the "right answer", so we can't check whether EmoLens finds true
patterns. In a simulation we *plant* the answer (for example "a missed dose raises the chance of a hard moment"),
run the real engine, and check whether it finds the planted patterns and ignores the fake ones. Results:
`docs/VALIDATION.md`.

**How one simulated family works** (`packages/simulator/src`):
1. `generate.ts` makes up 120 days of a child's life: sleep (some short nights), school days, therapy, outings,
   calendar events, meals, a daily medication (sometimes missed), colds, weather, room noise. Then it computes the
   **true** chance of a hard moment in every two-hour block, using the engine's own feature code plus the planted
   effects, for example: base chance 5%, higher after short sleep, busy transitions, a missed dose or illness.
   Everything else (sugary snacks, noise, weather, ...) truly has **no** effect.
2. `simulate.ts` then plays the days one by one:
   - The child lives the day: in each block a random number decides whether a hard moment happens.
   - The simulated parent logs 90% of hard moments, answers 70% of alerts truthfully, and does the end-of-day check
     80% of the time, saying "that's everything" even when they forgot one (realistic mistakes).
   - If an alert went out and the parent stepped in, the chance was halved.
   - Every evening at 6 pm the **real engine** (`runEngine`) refits using only what the app could know by then
     (`observedView`: no peeking at the future) and forecasts tomorrow; the **real alert rules** (`planAlerts`)
     decide tomorrow's alerts.
3. `metrics.ts` and `summary.ts` score each day. Did the planted triggers reach "likely/strong"? Did any fake ones?
   Were the forecasts better than a simple time-of-day guess?

4. `experiments.ts` defines the six experiments (E1-E6). `run.ts` runs 200 families per setting in parallel
   (`worker.ts`, one worker per CPU core) and writes CSV files and `summary.json`. `analysis/plots.py` draws the
   figures in `docs/figures`.

**Tuning it to find more (2026-10-22 and 2026-10-24).** We tried to raise "planted triggers found by day 90" from
78.5% toward 86–87% without breaking the rule that fake "likely" patterns stay at or under 5% on every day. The spec
only allows changing the status thresholds, τ and the prior widths; the tuning tool is `packages/simulator/src/tune.ts`.
- **How:** search on small batches of practice families, pick one setting, then check it once on 200 brand-new
  families (a new seed). Checking on new families matters: a setting picked on the same families it is scored on
  looks better than it really is.
- **What we learned:** the triggers missed most were the rare ones (missed doses, colds). They often didn't have 5 hard
  moments right after them by day 90, which "likely" required.
- **What we changed ("setting A"):** "likely" now needs 15 blocks with the factor (was 20), 3 hard moments right after
  it (was 5) and an effect of at least 1.25× (was 1.3×). It still needs EmoLens to be at least 90% sure the factor
  raises the chance.
- **Result:** on the brand-new families it found 85.3% by day 90 with at most 4.3% fake patterns. That missed our 86%
  goal, but it finds clearly more and stays under the 5% limit, so we adopted it. With the full study re-run, EmoLens
  now finds **84.1%** of planted triggers by day 90 and **89.4%** by day 120, and calls a non-trigger "likely" on at
  most **4.2%** of days. Details: `docs/VALIDATION.md` Section 4.

**Fair comparisons.** Every random decision (does a hard moment happen in block 5 of day 40?) comes from a random
number tied to that exact family, day, block and purpose. When two experiment settings are compared, the children
and their luck are identical; only the setting differs. These are called *common random numbers*.

**Demo mode.** Everything except `run.ts`/`worker.ts` avoids Node-only code, so the phone app's demo mode can run
one simulated family through the same engine.

Run it: `pnpm --filter @emolens/simulator sim --scenario default --families 200 --days 120 --out out`, then
`python analysis/plots.py --in packages/simulator/out --figures docs/figures`.

## 5. Mobile app
The app lives in `apps/mobile`. It is a React Native app built with **Expo**, written in TypeScript. Phase 3 built its
foundation: the encrypted database, onboarding, every manual log, the Timeline, settings, English and Spanish, the
design system and a demo-mode shell. Forecasts and insights on the phone come in Phase 5.

### 5.1 How the app starts
1. `app/_layout.tsx` is the root screen. It asks the **session store** (`src/store/session.ts`) to boot.
2. The store gets the **database key** from the phone's secure storage (`src/db/keys.ts`). On the very first launch it
   makes a new key: 32 random bytes. The key never leaves the phone.
3. It opens `emolens.db` with **SQLCipher** (`src/db/opsqlite.ts`), a version of SQLite that encrypts the whole file.
   Without the key, the file is unreadable noise. If the build somehow lacks SQLCipher, the app refuses to open
   rather than store data unencrypted.
4. It runs the **migrations** (`src/db/migrate.ts`): numbered SQL files that create or change tables. Each runs inside a
   transaction, so a failure leaves the database exactly as it was, and the app shows a "try again" screen instead of
   deleting anything.
5. It loads the child profile and settings. No profile yet means the **onboarding** screens; otherwise the five tabs.
   This switch uses expo-router's `Stack.Protected` guards.
6. Daily upkeep: it creates today's scheduled medication doses and marks long-overdue ones as missed.

### 5.2 Saving data: the repository layer
Screens never write SQL directly. They call small functions in `src/db/repo/` (for example `logEpisode`), and every
write goes through one class, `Writer` (`repo/writer.ts`). It does three things every time (SPEC 6.1):
- **Standard columns:** a new id (a UUIDv7, which sorts by time), `created_at`/`updated_at` timestamps in UTC, and which
  device made it. UTC is only for storing: anything shown as a date (a report's "Made on", a link's expiry) is turned
  into the child's home time zone first (`dateYearAt`, `localDateOf`). Cutting the date off a UTC timestamp would show
  tomorrow's date on a US evening. Deleting only sets `deleted_at` ("soft delete"), which is how the Timeline's Undo works.
- **Outbox:** if Care Team sync is on (Phase 7), a copy of the row goes into the `outbox` table to upload later.
  Place coordinates are removed from that copy, so they can never leave the phone.
- **Dirty blocks:** the day is split into 2-hour blocks (Section 3.1). A change at time *t* marks the blocks from 24 hours
  before to 24 hours after *t* as "dirty", so the engine knows exactly what to recompute. A medication change marks the
  next 21 days, because the `med_change_recent` feature looks back 21 days.
`repo.write(...)` wraps all of a save in a **transaction**: either everything is saved or nothing is.

### 5.3 The two-tap rule
The spec says logging a hard moment must take at most two taps on the worst day. Tap 1 is the big "Log hard moment"
button. The sheet opens with the most-used type already chosen and the time set to now. Tap 2 is "Save now, add
details later". The app also schedules a gentle notification 45 minutes later to add details. `test/fastpath.test.tsx`
renders the real Today screen, presses exactly those two buttons, and checks the database row.

### 5.4 Screens
- **Onboarding** (`app/(onboarding)/`): 13 short steps. Answers are kept in memory and saved together at the end, so
  quitting halfway leaves nothing half-finished. The "reveal" step shows the child's starting profile and a timeline of
  what happens next.
- **Today**: greeting, learning progress, the day strip (one segment per awake 2-hour block), the "Now" card, reminder
  cards (details to add, medication due, last night's sleep, ongoing illness) and quick-add buttons. Until the engine runs
  on the phone (Phase 5), Today honestly says "Learning" instead of showing a made-up number. "Ideas that have helped"
  uses the parent's own favorites, labeled "You said this helps", as SPEC 17 says to do when there is no data yet.
- **Timeline**: every entry for one day, filter chips, search across all days, tap to edit, swipe to delete with Undo.
- **Settings** (More tab): child profile, medications, places, alerts, privacy (app lock, delete all data), language.

### 5.5 Design system
`src/ui/theme.ts` holds the colors, type sizes and spacing from SPEC 28. Every component (`Button`, `Card`, `Chip`, …)
uses them, so the whole app looks consistent in light and dark mode. Accessibility is built in: every control has a
screen-reader label, touch targets are at least 44 points, text grows with the phone's font size, and risk levels always
pair a color with an icon and a word. `test/theme.test.ts` computes the WCAG contrast ratio of every text/background
pair in both themes and fails if any is too low.

### 5.6 Two languages
Every word on screen comes from `src/i18n/en.json` or `es.json`, looked up by a key like `today.markTaken`.
`test/i18n.test.ts` scans the code for every key and checks that it exists, that Spanish has exactly the same keys and
placeholders as English, and that neither language uses words the product principles forbid (such as "tantrum").

### 5.7 Privacy features on the phone
- Encrypted database (5.1) and no ads, analytics or crash reporting.
- **Privacy cover:** when the app goes to the background, a plain EmoLens screen hides the content in the app switcher.
- **App lock** (optional): Face ID, fingerprint or passcode when opening, and again after 5 minutes away.
- **Delete all data:** type DELETE to confirm; the app closes and deletes both database files, the key and all scheduled
  notifications, then starts fresh.

### 5.8 Demo mode
Demo mode opens a completely separate database file, `emolens-demo.db`, with a pretend child and a "DEMO DATA: not a
real child" banner on every screen. The real database is not even opened while the demo is on. Since Phase 5 the demo
is filled with about 120 simulated days (see 5.11, "Demo mode filled by the simulator").

### 5.9 How it is tested
The same repository code runs against a real SQLite database in Node (`test/nodeDb.ts`, using better-sqlite3), so the
tests check real SQL, not a fake. The mobile tests (138 after Phase 5) cover migrations, the standard columns, the outbox rule, dirty blocks,
medication dose rules, meals, check-ins, the Timeline, search, the two-tap fast path, color contrast and translations.

### 5.10 Automatic data sources (Phase 4)
EmoLens can fill in some data by itself, so parents log less. Every source lives in `src/integrations/` and has the same
four functions (SPEC 11): *is it available on this phone*, *ask permission*, *sync*, and *status*. All are optional, all
are off until the parent switches them on (in onboarding step 11 or More → Data sources), and each card explains what it
reads before the phone's permission prompt appears.

| Source | What it reads | Where it comes from | What leaves the phone |
|---|---|---|---|
| Weather & air | temperature, pressure, humidity, rain, air quality, pollen | Open-Meteo (free) | only Home's location rounded to about 1 km |
| Health | sleep, heart rate, heart-rate variability, steps | Apple Health / Health Connect | nothing |
| Calendar | events from the calendars you choose | the phone's calendar | nothing (titles stay local) |
| Location | arrivals at tagged places | the phone's geofencing | nothing (coordinates stay local) |
| Sound check | how loud the room is | the microphone, 30 s | nothing; the audio is deleted at once |
| Food lookup | product names, sugar, caffeine, colors | Open Food Facts (barcode), USDA (name search) | the barcode or the typed food name |
| Medication names | official drug names | RxNorm (U.S. National Library of Medicine) | the typed medication name |

**The rules are small pure functions, each with tests** (`test/integrations.test.ts`):
- *Pollen level* (`weather.ts`): the highest pollen count becomes 0 (none), 1 (< 20), 2 (20-100) or 3 (> 100).
- *Calendar tags* (`calendarRules.ts`): whole-word keyword matching, so "breakfast" never counts as a school "break". Every
  timed event is also a *transition*. The parent can add words and re-tag or ignore any event; those choices are remembered.
- *Nights of sleep* (`health/sleep.ts`): health apps report many small "asleep" pieces. Overlapping pieces (watch + phone)
  are joined first, pieces less than 90 minutes apart form one stretch, and a stretch ending between 3 am and 1 pm is a night.
- *Place visits* (`geofence.ts`): arriving somewhere closes the last visit and opens a new one; leaving the current place
  means "somewhere untagged".
- *Food tags* (`food.ts`): sugary (≥ 15 g per serving or ≥ 22.5 g per 100 g), caffeine, artificial colors.
- *Sound level* (`sound.ts`): decibels are averaged as sound power, so a loud burst counts as much as the ear hears it.
- *Medication reminders* (`notifications/medReminders.ts`): one repeating reminder per time, with "Given" and "Skip".
  The text never names the medication, because notifications show on the lock screen. Medication times are the child's
  home time, but the phone's alarm clock uses the phone's own time zone, so each time is converted before it is
  scheduled (they differ when the family travels). Saving a medication says when the next reminder will come.

**How syncing runs** (`refresh.ts`): when the app opens, when it comes back to the front (at most every 5 minutes), and in a
background task the phone runs every half hour or so. Each source gets a time limit, the whole pass gets 25 seconds in
the background, and one failing source never stops the others. Failures are saved and shown as a warning chip on Today
and in Data sources, but they never block logging (SPEC 29). A source can also "work partly": the iOS Simulator, for
example, can't watch places in the background, so the Location card says so and suggests checking in by hand instead of
reporting a failure. All network requests wait at most 10 seconds and try twice
more before giving up (`http.ts`).

**Child device mode** (`app/child-device.tsx`): on a phone or tablet the child carries, EmoLens shows only a status screen
and collects place arrivals and health data in the background. The data reaches the parents' phones once Care Team
exists (Phase 7).

**Why this matters for the model (Phase 5):** each source feeds features from SPEC 12.4. Weather gives `pressure_change`,
`heat_or_cold`, `poor_air`, `pollen_high`; calendar gives `planned_transitions`, `appointment_near`, `unusual_day`; places give
`arrival_recent`, `new_place` and the place features; health gives `sleep_deficit`, `night_wakings` and the heart-rate
features; sound gives `noise_high`; food tags give `high_sugar_recent` and `caffeine_recent`. A feature only enters the model
once its source has enough data (SPEC 12.5), so a family that never connects health data is not penalized.

### 5.11 Forecasting on the phone (Phase 5)
Until Phase 5 the engine only ran in tests and in the simulator. Now the phone runs it too. **The phone never does any
statistics of its own**: it copies its data into the engine's input, calls the engine, and saves what comes back.

**One forecast run, step by step** (`src/forecast/run.ts`):
1. *Load* (`dataset.ts`): read the database into one `ChildDataset` object (the same shape the simulator makes).
   Dates become numbers, deleted rows are skipped. Nothing is decided here.
2. *Recompute* (`recompute.ts`): the day is cut into 2-hour blocks. The app keeps one row per awake block in the `blocks`
   table. When you log something, the blocks within a day of it are marked "dirty" (the saving code does this). The
   recompute job asks the engine to recompute the features of dirty blocks only, saves them (`block_features`), and asks
   the engine for every block's label (hard moment / calm / stepped in / unknown). Saved features are reused next time,
   so a normal run only does the new blocks. This is why editing an old entry still works: its blocks become dirty.
3. *Fit and forecast*: `runEngine` fits the Bayesian model on the labeled blocks, works out each pattern's status and
   precision number (how precisely the size of each effect is known), and forecasts the rest of today and all of tomorrow,
   with reasons.
4. *Save*: the fit (`model_fits`, one kept per day), the forecasts, and a summary the screens read (`engine_snapshots`).
   Screens never wait for the engine; they show the last run and refresh when a new one finishes.

**When it runs:** 2 seconds after you save anything (several quick saves count once), when the app opens or comes back to
the front, in the background task, when you change a setting that matters (language, alert sensitivity, wake times...),
and when you tap **Refit now** on Model Health. It runs after animations finish so the screen doesn't stutter.

**The "day-ahead" snapshot (why Model Health is honest):** for every block, the app keeps exactly one forecast made the
evening before (the first one made at or after 6 pm the previous day) and never changes it. Model Health grades those
frozen forecasts against what really happened. If we graded the latest forecast instead, a forecast made *after* a hard
moment was logged would look great for the wrong reason.

**Alerts and the three answers** (`src/forecast/alerts.ts`, `src/db/repo/alerts.ts`):
- After each run the engine's `planAlerts` decides: send a heads-up for a "High" block 30 minutes before it, unless it is
  in quiet hours, over the daily limit, too soon after another alert, right after a logged hard moment, or still in the
  learning period. If a block stops being High before its heads-up, the heads-up is cancelled.
- 30 minutes after the block ends the app asks **"How did 2-4 pm go?"** (notification + a card on Today, so nothing is lost):
  - *A hard moment happened*: saved immediately (at the middle of the block if nothing was logged), details can wait.
  - *We stepped in early*: the block is left out of the risk model. This is the "intervention trap" fix: if the parent
    helped and things stayed calm, counting it as "calm" would teach the model its warnings were wrong. Instead the credit
    goes to the strategy: an optional "What did you try?" card records it.
  - *All calm*: the block becomes a calm block.
- The answer changes the block's label, the next run refits, and the forecast updates. That is the full loop
  **alert -> answer -> label -> refit**, tested end to end in `test/forecast.test.ts`.
- Notification text never contains medication names or place names (lock-screen privacy).

**End-of-day check** (`app/end-of-day/[date].tsx`): once a day the app asks "Were there any other hard moments that aren't
logged?". "No, that's everything" (one tap) turns every finished block of the day without another answer into a calm
block. "I'm not sure" guesses nothing. The next morning a card asks about the blocks after the check ("Anything happen
after 8:30 pm last night?"). Calm blocks matter as much as hard ones: the model learns from the difference.

**What the screens show:**
- *Today*: the strip (level for later blocks, how it went for earlier ones), the Now card ("18% chance", "likely between
  11% and 27%", "about 2x Sam's usual for this time", the top reasons, and ideas that have helped), answer cards, and the
  end-of-day cards. While EmoLens is learning (fewer than 14 days with answers or fewer than 3 hard moments) the level
  says "Learning" and no alerts are sent.
- *Insights*: patterns from strongest to weakest, each with its status and precision meter; your own suspicions with what
  the data says about them; "worth watching" foods/places; the time-of-day chart; links to What helps and Model Health.
- *Trigger detail*: what the status means and the precision meter (see 3.6); the effect with its likely range; chart 1 compares how often hard moments happened with and without
  the factor; chart 2 shows how the estimate changed week by week; the raw counts; "How we know this".
- *Strategies*: "Helped 6 of 7 times" with a bar showing the estimate and its likely range (a Beta distribution, the
  same idea as a coin whose fairness you learn by flipping it).
- *Model Health*: the skill score ("23% better than a simple time-of-day guess"), the reliability diagram (does "15%"
  really mean 15%?), how well it ranks risky vs calm times (AUROC), and what happened after heads-ups.
Charts use one color, show uncertainty as a light band or thin whiskers, and each has a sentence for screen readers.
Counts use proper plurals ("1 planned transition", "Helped 1 of 1 time") in both languages: the app's own texts with
i18next plural keys, the engine's reason texts with the same English/Spanish plural rule written out in `fmt`
(`isPluralOne`). The phone's JavaScript engine (Hermes) has no `Intl.PluralRules`, so the engine must not rely on it
(BUGS.md #11; a test checks for it).

**Demo mode filled by the simulator** (`src/demo/build.ts`): the first time demo mode opens, the phone runs the simulator's
default family through the same engine: about 120 days up to yesterday, refitting every evening, sending alerts by the
same rules, with a simulated parent who logs, answers and does the end-of-day check. A progress screen shows the days
going by. The result is copied into the demo database with every evening's forecast and fit, then one live run makes
today's forecast at the real time. It is saved, so later visits are instant; **Regenerate demo data** does it again so
the data ends today. Only in demo mode, a "Demo tools" card can send a sample heads-up now or ask about a past block, so
the answer loop can be shown in a video without waiting hours. What is made up for the demo (and nothing else): the
calming-strategy uses (the simulator doesn't model strategies), the calendar titles, and the medication name.

**Files to open first:** `src/forecast/run.ts`, `src/forecast/recompute.ts`, `src/forecast/alerts.ts`,
`src/db/repo/alerts.ts`, `src/demo/build.ts`, `app/(tabs)/index.tsx`, `app/(tabs)/insights/`.

### 5.12 Reports, backups and the weekly digest (Phase 6)
Phase 6 is about getting information *out* of EmoLens: to a doctor or therapist, to a teacher, to a new phone, and back
to the parent once a week. As before, **the numbers come from the engine**; the phone only reads rows, asks the engine,
and turns the answers into files.

**Where the numbers come from** (`packages/engine/src/summary.ts`): small pure functions that summarize a date range.
`episodeSummary` counts hard moments per type, per day and per part of the day (the same morning / midday / afternoon /
evening split the model uses); `adherence` is doses given (on time or late) out of scheduled doses; `sleepSummary` compares
average sleep with the child's usual amount (the same "usual" the model's short-sleep feature uses); `digestStats` puts a
whole week together. They are plain math on lists, tested with hand-made data (`test/summary.test.ts`), including a week
with the daylight-saving change (a 25-hour Sunday).

**The PDF report** (`apps/mobile/src/reports/`):
1. `data.ts` reads everything for the chosen dates and **audience**. The audience rules are applied *here*, before anything
   is drawn: a School report never even loads medications, sleep, health or body-signal data, or anything about places
   outside school (teachers shouldn't see them, SPEC 7.1). So a mistake in the drawing code can't leak them, and a test
   (`schoolPrivacy.test.ts`) searches the finished School report for any medication, sleep or place word.
2. `svg.ts` draws the charts as SVG text (the calendar squares, the time-of-day bars with their likely-range whiskers).
   Every label is "escaped" (`<` becomes `&lt;`) so a note like "<park>" can't break the page.
3. `templates/report.ts` writes the report as one HTML web page, with 13 sections from the cover to "How to read this
   report". `templates/shell.ts` adds the print style: Letter paper in the US and A4 elsewhere, a page break before long
   tables, table headers that repeat on each page, and every other section kept in one piece so a heading never ends a page.
4. The phone's own web engine turns the HTML into a PDF (`expo-print`), and the share sheet sends it (`expo-sharing`).
   EmoLens uploads nothing itself; the parent chooses Mail, Files, AirDrop or a printer.

**The two data files:**
- *ABC data* (`abc.ts`): behavior specialists record each hard moment as Antecedent (what came before), Behavior (what it
  looked like) and Consequence (what followed). EmoLens writes one CSV row per hard moment in that layout. The column
  `antecedent_auto` is filled by the engine: it takes the block's saved features, multiplies them by the model's current
  weights (`contributions`), and lists the factors that pushed the chance up by at least 0.1 on the log-odds scale, but
  only factors whose pattern the app already shows (`antecedentFactors`). The file starts with an invisible "byte-order
  mark" so Excel shows Spanish accents correctly, and fields with commas or quotes are quoted the standard way (RFC 4180).
- *FHIR* (`fhir.ts`): FHIR is the international standard for exchanging health records. The file is a "Bundle" of
  resources: one Patient (a new random id every time, no name unless the parent switches it on), an Observation per hard
  moment and per night of sleep (sleep uses the official LOINC code 93832-4, measured in hours), and the medications and
  each dose. Inside the file, every "subject" link points to the Patient in the same file; a test follows every link.

**Backups** (`apps/mobile/src/backup/`): "Export all data" writes every table into one JSON file with the database version
number. "Import a backup" first *checks* the file with **zod** (a library that validates data against a description of
its shape). Instead of writing a description for each of 30+ tables by hand, EmoLens asks SQLite for each table's
columns (`PRAGMA table_info`) and builds the checks from that (`packages/shared/src/schemas.ts`). Then it *merges*, all
in one transaction (all or nothing): for each entry, the most recently edited copy wins ("last writer wins"), and on a
tie this phone's copy stays. EmoLens keeps one child per phone, so a backup of a *different* child is never mixed in; the
parent can only replace this phone's data, after typing REPLACE. On a new phone, the welcome screen's "Restore from a
backup" does the same and skips onboarding.

**The weekly digest** (`apps/mobile/src/digest/`): every forecast run checks whether the digest time (default Sunday
6 pm) has passed without a digest for that week. If so, `digestStats` computes the week (hard moments, change vs last
week and vs the 4-week average, busiest time of day, end-of-day streak, heads-ups, what helped, medications, sleep) and
**what changed in the patterns**, by comparing with the statuses saved in last week's digest. The result is saved as
numbers (`digests.stats_json`), and one notification says only "Sam's weekly digest is ready." The sentences
("Sam had 4 hard moments this week (2 fewer compared with last week)...") are written from the numbers each time the
digest is opened, so they follow the app's language. With AI features on, an AI-written summary is added on top (Section 7.4). In demo mode, the
simulated months come with a digest for every week, built from what the engine showed each simulated Sunday.

**When something fails:** each button's work is split into labelled steps (load, render, print, save or write, share;
for import: pick, read, check, import, in `src/lib/steps.ts`). A failure shows the toast *and* is saved in
About → Diagnostics as, e.g., `report.pdf · print: Error: ...`; while developing it is also printed in the dev terminal.
File paths and quoted text are removed from these messages, so they never contain a name or a note.

**How it is tested:** `test/reports.test.ts` (FHIR structure and links, CSV format, SVG well-formedness, every report
section, what a School report leaves out, Spanish), `test/backup.test.ts` (round trip, last-writer-wins both ways and on
ties, bad files change nothing, the different-child rule), `test/phase6Screens.test.tsx` (the buttons really print and
share, the digest is made once and only after Sunday 6 pm, restore on a new phone), `test/hermesIntl.test.ts` (everything
above with `Intl.PluralRules` removed, like on the phone), `test/fileErrors.test.tsx` (what a failure records).

**Files to open first:** `packages/engine/src/summary.ts`, `apps/mobile/src/reports/data.ts`,
`apps/mobile/src/reports/templates/report.ts`, `apps/mobile/src/backup/import.ts`, `apps/mobile/src/digest/generate.ts`.

## 6. Cloud, Care Team and clinician portal

### 6.1 The big idea: the phone is still the main copy
Everything still works with no internet and no account. The cloud (Supabase: a Postgres database, sign-in and small
server functions) only comes in when a parent turns on **Care Team** to share with other caregivers, a teacher or a
clinician. Even then, each phone keeps its own full copy in its encrypted database and keeps working offline. The cloud
is a meeting point where phones swap changes.

Some things **never** go to the cloud: where places are on a map (coordinates), calendar event titles, heart-rate
readings, sound checks, weather, and the model's raw numbers. Only a place's *name and kind* ("Grandma's", relative)
travel. The table in `apps/mobile/src/sync/tables.ts` lists exactly what each synced table sends, and a test searches
everything the fake cloud received for coordinates to prove none were sent.

### 6.2 Who can see what: row-level security
The cloud database checks **every single query** against rules written in SQL (`supabase/migrations/..._rls.sql`).
This is called *row-level security* (RLS). The rule for a table says which rows a signed-in person may read or write. For
example, a medication row is readable only if `is_member(child_id, '{owner,caregiver,clinician}')` is true: you must be
an active member of that child's team with one of those roles. A teacher's query for medications doesn't fail; it simply
comes back empty.
- **Owner:** everything, and the only one who can invite, remove and share.
- **Caregiver:** logs and reads everything, but can't manage the team.
- **Teacher:**
  - reads hard moments at school and their own entries;
  - never reads medications, sleep, health, home places or snapshots;
  - may only write rows signed with their own id.
- **Clinician:** reads everything that is synced but can only write their own clinician notes.
- **Anyone else**, and anyone removed from the team, reads nothing. A signed-out visitor is refused outright.

Because the rules live in the database, a modified or buggy app can't get around them. The tests prove it:
- `supabase/tests/database/rls.test.sql` (pgTAP, run by `supabase test db`) signs in as each role and checks, for example,
  that a teacher reads 0 medication rows and that a non-member reads 0 rows from *every* table (the test loops over all
  tables, so a new table without rules would fail it);
- a clinician's insert of a hard moment is refused;
- share links are readable only by the child's owner;
- nobody can make themselves a member or an owner.

### 6.3 The secret key never leaves Supabase
Supabase has two kinds of keys:
- The **publishable** key is in the app and the portal. By itself it can read nothing, because of RLS.
- The **secret** key bypasses RLS. It exists only inside Supabase's servers, where the **edge functions** (small
  TypeScript programs in `supabase/functions/`) use it.

A function always checks, in code, that the caller is allowed before using it. For example, `invite-create` first checks
that the caller is the child's owner. A lint check (`apps/portal/scripts/check-no-secrets.mjs`) fails if the portal ever
mentions a secret key.

### 6.4 Invites and share links
- An **invite code** is 8 characters from 31 easy-to-read letters and digits (no 0/O or 1/I/L), so there are about 850
  billion codes.
  - It works once, for 7 days.
  - After 10 wrong codes in an hour a person has to wait, so guessing is hopeless.
  - The database stores only the code's SHA-256 *hash* (a fingerprint), never the code itself.
- A **share link** holds a random 43-character token, and again only its hash is stored.
  - Anyone with the link can read that one report until it expires (7 or 30 days) or the owner turns it off.
  - An expired, revoked or made-up link all get the same "This link is no longer available", so the page never reveals
    whether a link existed.
  - The report in the link is a *fixed copy* made on the owner's phone with the same audience rules as the PDF. A School
    link has no medications, sleep or places, and the server checks that again before storing it.

### 6.5 Sync: outbox, push, pull, last writer wins
- **Outbox.** Every save goes through one function (`Writer` in `db/repo/writer.ts`). With Care Team on, it also adds a
  line to the `outbox` table: "this row changed".
- **Push** (`sync/push.ts`) reads the outbox oldest first, 200 at a time.
  - It uploads each changed row *as it is now*, parents before children (a medication before its doses), then deletes
    those outbox lines.
  - With no internet, nothing is lost: the lines stay and the next try waits 2, 4, 8 ... seconds.
- **Pull** (`sync/pull.ts`) asks the cloud for this child's rows that arrived since the last time.
  - Each table has a bookmark: the server's own receive time of the newest row seen.
  - Pulled rows never go back into the outbox, which would make an endless loop.
  - They mark the forecast's time blocks "dirty", so the next forecast includes them.
- **Conflicts.** Two phones can change the same entry. The rule is **last writer wins**: the edit with the later
  `updated_at` is kept, on every phone *and* on the server (a database trigger applies the same rule). If two edits have
  exactly the same time, the one from the phone whose id sorts later wins, so all phones pick the same one.
  - The tests edit the same hard moment on two phones, in both orders and with a tie.
  - This work also fixed two subtle problems found by tests. A row's `device_id` must name the *last* phone that changed
    it, not the one that created it. And an Undo in the same millisecond must still count as newer.
- **When.** Sync runs when the app opens or comes back, 5 seconds after a save, in the background task, and right away
  when Supabase **Realtime** says another phone changed something.
- **Removed from the team.** Every sync first checks that this person is still on the team. If the owner removed them,
  the phone signs out and deletes its whole copy of the family's data right away, whatever the person's role, and then
  says "You're no longer on Max's care team. Their information has been removed from this phone." There is no way to
  keep a copy (DECISIONS #118). If the app is closed in the middle, a saved flag makes the next start finish the job
  before any screen can show the data.

### 6.6 One forecasting phone, and what it shares
- Only one phone per family (normally the owner's first) **makes the forecast and the heads-ups**, so parents don't get
  two different alerts.
- Other phones can still *receive* the heads-ups. When anyone answers "How did it go?", the others drop their pending
  question after syncing.
- Once a day the forecasting phone uploads an **insight snapshot**: patterns, what helps, the time-of-day chart and
  forecast quality. The portal can't compute these itself because the weather, sound and calendar data behind them
  never leave the phone.
- It also uploads today's **school-hours forecast** (levels only, no reasons) for the teacher's phone.

### 6.7 The clinician portal (apps/portal)
- **Built with:** a Next.js website, hosted on Vercel.
- **Sign-in:** an emailed link or 6-digit code.
- **Reading data:** every page reads the child's data *as the signed-in person*, so RLS applies here too. A teacher
  opening the medications page just sees "Medications aren't shared with teachers."
- **The report:** the portal report and the share page use **the same report code as the phone's PDF**
  (`packages/reports`). The phone's report builder was split in two:
  - the phone part reads SQLite;
  - a shared part (`assembleReport`) applies the audience rules and the engine's summaries.

  The portal reads the same data from the cloud and calls the same shared part. A test renders every report both ways
  and requires them to be identical, byte for byte. That test found a real bug in the phone's PDF (BUGS.md #19).
- **Security:**
  - Every page has a strict Content-Security-Policy: only the portal's own scripts, marked with a random number that
    changes on each request, may run. So even if a report contained text that looked like code, it could never run.
  - The portal can't be put inside another site's frame.
  - Share pages tell search engines not to index them.

## 7. AI features

All AI features are **optional and off by default**. They need an EmoLens account and the parent's "I understand"
on the consent screen (More → AI features). That screen lists exactly what may be sent and what never is.

### 7.1 Who talks to the AI, and what it sees
- The phone never holds an AI key and never talks to Anthropic directly. It calls four small server functions on
  Supabase (`ai-ask`, `ai-structure`, `ai-digest`, `ai-session-prep`). They add the fixed instructions and send one
  request to Claude (model `claude-sonnet-5-5`) with Anthropic's official SDK. The key lives only on the server.
- **The instructions are on the server only** (`supabase/functions/_shared/prompts.ts`). The app sends questions and
  data, never instructions, so a modified app can't change what the AI is told. The server also checks every request
  and keeps only known fields.
- **Redaction:** before anything leaves the phone, the child's nickname is replaced with `[CHILD]` everywhere: in the
  question, in every tool result, in voice-note text and in the digest numbers (`packages/shared/src/redact.ts`, used
  by `src/ai/client.ts`, the single door for AI calls). Answers come back with `[CHILD]`, and the screen puts the
  nickname back. A test renames the demo child to 20 random nicknames, plants the name in notes and place names, and
  checks that none of it reaches the server.
- **Never sent:** place coordinates, audio, photos, and calendar titles (unless the parent switches that on).
- **Daily limit:** each person may make 60 AI requests a day. A database function counts them (`ai_usage_increment`),
  and the 61st gets "You've reached today's limit".

### 7.2 Ask EmoLens: an "agent" whose tools run on the phone
This is the most interesting part to explain. The AI answers from the family's own data, but that data stays on the
phone:
1. The parent asks: "How many hard moments last week?"
2. The phone sends the question to `ai-ask`. Claude doesn't know the answer, so it replies with a **tool call**, for
   example: *get_episodes from 2026-09-28 to 2026-10-04*.
3. The phone runs that tool itself, as a plain database query (`src/ai/tools/`). It sends back only the rows the
   question needs: at most 200, with times in local time ("2026-09-29 Tue 15:05"), and each row with a `ref` like
   `E:…`.
4. Claude reads the result and answers ("There were 6 hard moments last week…"). It may call several tools first, up
   to 6 rounds; then the phone asks it to answer with what it has.
5. The answer shows "Based on 6 entries"; tapping it lists the entries, and each one opens.

There are 13 tools: hard moments, one day's summary, patterns, worth watching, forecast, strategy stats, medications,
dose history, meals, sleep, comparing two periods, model health, and searching notes. The pattern tools just repeat
the engine's own statuses and confidence values, so the AI can't make up a pattern. The instructions also say: answer
only from tool data, never diagnose, never suggest medication changes, use respectful language.

How we know it works: `test/askLoop.test.ts` builds the demo family and checks that the loop gives exactly the number
an independent count of the database gives. `test/askLoop.live.test.ts` asks the real model the same question.

### 7.3 Voice notes and school notes
- **Voice notes (iPhone):** record up to 3 minutes. The speech is turned into text **on the phone** by Whisper
  (`whisper.rn`). The model file (78 MB) downloads once and is checked with its SHA-256 fingerprint, so a damaged or
  swapped file is never used. The recording is deleted right after, unless "Keep audio" is on.
- **School notes:** take or choose a photo; the phone reads its text (Apple Vision on iPhone) and deletes the photo
  right away.
- The parent can fix the text, which is saved as a note. Then EmoLens finds entries in it:
  - with AI on, `ai-structure` returns a structured log. Its shape is enforced by a JSON schema, and the phone checks
    it again;
  - with AI off, an on-device **rule parser** looks for keywords ("meltdown", "shut down", "crisis"), times ("at 3",
    "after school" = 15:30), medication names (allowing small spelling mistakes, using Levenshtein distance), foods
    and strategies.
- **Review screen (a must):** every proposed entry is a card with a checkbox, and nothing is saved until "Save
  selected".

### 7.4 Weekly digest summary and clinician session prep
- **Digest:** with AI on, opening a weekly digest asks `ai-digest` to turn the week's numbers into a 120-180 word
  summary. Without AI, the template sentences stay.
- **Session prep (portal, clinicians only):** the portal builds a summary of the synced data for the chosen dates
  (redacted), and `ai-session-prep` drafts four sections, the last being "Questions to explore in session". The
  clinician role is checked on the server. The draft is labelled "AI draft: review and edit before use." and can be
  edited and marked final. It is never an assessment.

### 7.5 What can go wrong, and what the app does
No internet, the daily limit, the AI being unavailable, or the AI declining: each shows a short, friendly message, and
nothing half-finished is saved. If the AI can't structure a note, the rule parser is used instead.

## 8. Room sensor (future work)
The SPEC describes an optional room sensor (Section 25): a small board with a microphone, a light sensor and a
temperature sensor that would send readings to the phone over Bluetooth. **It was not built** because of the
submission deadline (DECISIONS #138). Nothing depends on it: the phone's own **sound check** (Section 5.10) already
measures how loud the room is when a hard moment is logged, and the engine simply has no sensor features, the same as
for any data source a family hasn't connected. The app no longer lists it (DECISIONS #146).

## 9. Polish before submission (Phase 10)
### 9.1 School reports show only school time
A School report already left out medications, sleep, health and places. But even a date and time can say something
private: "a hard moment at 11 PM on Wednesday" tells the school about home life. So a School report (and a School share
link) now includes, by default, only hard moments **logged at a School place** or **started 8:00 AM-3:30 PM on one of
the child's school days** (`packages/reports/src/school.ts`; the same hours as the teacher's forecast). The parent can
switch "Only school time" off. The important design choice: the filter runs **first**, inside `assembleReport`, before
any number is computed. So the table, the summary tiles, the trend, the calendar and the chart all count the same hard
moments and can never disagree. The test adds an 11 PM and a Saturday hard moment to the demo family and checks they
appear nowhere in the School PDF (English and Spanish) or the share snapshot (BUGS #23).

### 9.2 One number, one source
The report's chart shows, for each waking 2-hour block, the *share* of blocks that had a hard moment. The summary
used to count hard moments over *all* hours, so it could say "most often in the evening" while the chart had no
evening at all. Now the sentence is computed from the chart itself (its tallest bar), and a note under the chart
counts the hard moments outside waking hours. Lesson: when two parts of a screen describe the same thing, compute one
from the other (BUGS #24).

### 9.3 The invite preview and the privacy review
Before the owner creates an invite code, the screen lists what that role **will** and **will never** see, from one
list in `packages/shared/src/roleAccess.ts`. `docs/PRIVACY_REVIEW.md` is a table of every role × every kind of data,
with the automated test that proves each rule, and an honest list of what isn't tested or isn't perfect yet (for
example, a teacher can still read the child's usual sleep hours in the profile). The review also found that the
server's check of School links didn't look at "worth watching" items or patterns; it does now.

### 9.4 Stopping the sound check cleanly
The sound check records for 30-60 seconds to measure loudness. If the app went to the background mid-check (or the
Mac running the Simulator went to sleep), iOS released the microphone recorder, and when the app woke up the code
asked the released recorder for its level, which crashed with a console error. Now every check has its own number;
going to the background, closing the screen, or a 250 ms wait that took over 5 seconds makes the check "stale". A
stale check stops quietly, saves nothing, and never touches the recorder again (BUGS #32). This is a common pattern
for any long-running task in an app: always ask "what if the screen closes or the app sleeps halfway?"

### 9.5 Accessibility and Spanish checks
- Contrast: `test/theme.test.ts` computes the WCAG contrast of every text color on every background, now including
  white text on the Today header's gradient (it was 4.19:1, below the 4.5:1 minimum, so the gradient was darkened).
- Spanish: `test/spanishScreens.test.tsx` opens nine main screens in Spanish on the Spanish demo family and fails if
  any text or screen-reader label is an English string, a raw key like `today.title`, or contains English words like
  "the". `test/i18n.test.ts` also checks every plural string is given a count (otherwise the raw key shows: that
  happened on the Sound check screen).

## 10. Research background (cite the papers, and read them yourself first)
- Goodwin, M. S., et al. (2019). Predicting aggression to others in youth with autism using a wearable biosensor.
  *Autism Research*, 12, 1286-1296. In 20 autistic youth over 87 hours, a wrist sensor predicted aggression 1 minute
  ahead with about 84% accuracy, using regularized logistic regression.
- Goodwin and colleagues (Northeastern University), *JAMA Network Open* (2023): 70 youths, 497 hours, 6,665 recorded
  behaviors; logistic regression worked best, predicting aggression 3 minutes ahead (mean AUROC 0.80).
- What EmoLens takes from them: body signals carry warning signs; simple, regularized logistic models work well (so
  EmoLens uses an explainable one); and EmoLens adds what minute-ahead wearables can't: **hours-ahead** forecasts from
  context (sleep, schedule, medication, environment) that a family can plan around, fitted to each child.
- *(Check the exact titles, authors and page numbers in the published papers before citing them in the video.)*

## 11. Questions judges may ask (short answers)
- **Why not a neural network?** Each child has only a few dozen hard moments a month. A small Bayesian model can learn
  from that, says how unsure it is, and can explain every forecast ("short sleep last night"). A neural network would
  need far more data and couldn't explain itself.
- **How do you know it works?** The simulator creates families where we *know* the true triggers, runs the exact same
  engine code, and checks it finds them (84% by day 90, 89% by day 120) without inventing fake ones (at most 4.2% of
  days). It's simulated data, so it shows the math works, not that it helps real families; that needs a real study.
- **Couldn't you tune it to find more?** We did, honestly: we searched on practice families and checked the winner once
  on brand-new ones. It found 85% there (our goal was 86%), up from 77%, while fake patterns stayed under 5%, so we
  adopted it. Finding more is easy if you allow more fake patterns; the hard part is finding more while keeping fake
  patterns at or under 5%. Getting 93% by day 120 would have needed about 6% fake patterns, so we didn't.
- **What does "shrinkage" mean?** The model starts by assuming each feature has little or no effect, and only moves
  away from that when the data clearly says so. That's why it doesn't call something a pattern after two coincidences.
- **What's the "intervention trap"?** If a parent gets a warning, steps in and the hour is calm, counting that hour as
  "calm" would teach the model the warning signs were harmless. EmoLens counts it as "stepped in" instead.
- **Where is the data?** On the phone, encrypted. The cloud only gets what the family shares, and database rules
  decide who sees what; each rule has an automated test (`docs/PRIVACY_REVIEW.md`).
- **What does the AI see?** Only if the family turns it on: the question and the needed entries, with the child's
  nickname replaced by "[CHILD]". Never locations, audio or photos. The AI's tools run on the phone, so the server
  never stores the family's history.
- **What would you do next?** The room sensor, Android voice notes, a teacher-only profile view, and a study with real
  families after an ethics and legal review.
- **How was AI used during development and inside the app?** See `AIDisclosure.md`; be ready to walk through the
  engine (Section 3), the school filter (9.1) and the sound-check fix (9.4) in your own words.

## 12. Tooling
- **pnpm workspaces**: one `pnpm install` sets up every package.
- **TypeScript strict mode**: catches many mistakes before the code runs.
- **ESLint** (`eslint.config.mjs`): checks for common bugs and bans the unsafe `any` type.
- **CI** (`.github/workflows/ci.yml`): on every push GitHub runs typecheck, lint and tests automatically.
