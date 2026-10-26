# Bug log

Bugs found by hand-testing. Each fix comes with an automated test so the bug can't come back.
Status: **open** (not fixed yet), **needs info** (can't reproduce without more detail), **fixed** (test + commit).

| # | Where | Status | Test | Commit |
|---|---|---|---|---|
| 1 | Onboarding, Back button (step not yet known) | fixed (see #9) | `apps/mobile/test/backNavigation.test.tsx` | see git log |
| 2 | Onboarding step 4, birth year field | fixed | `apps/mobile/test/birthYear.test.tsx` | see git log |
| 3 | Apple Health: nothing imported in the Simulator | fixed | `apps/mobile/test/healthSync.test.ts` | see git log |
| 4 | Calendar: "No calendars found" with Full Access | fixed | `apps/mobile/test/calendarAccess.test.tsx` | see git log |
| 5 | "Delete all data" → Render Error: Session not ready | fixed | `apps/mobile/test/deleteAll.test.ts` | see git log |
| 6 | Medication reminder never arrived | fixed (see notes) | `apps/mobile/test/medReminderFlow.test.tsx`, `integrations.test.ts` | see git log |
| 7 | Calendar: "No calendars found" again; go to the picker after allowing access | fixed | `apps/mobile/test/calendarAccess.test.tsx` | see git log |
| 8 | "Location couldn't sync" with Always location | fixed (Simulator limitation, now explained) | `apps/mobile/test/locationSync.test.ts` | see git log |
| 9 | Back: all 13 onboarding steps, log sheets, settings screens | fixed | `apps/mobile/test/backNavigation.test.tsx` | see git log |
| 10 | Weather card said "Set Home's location" after it was set | fixed | `apps/mobile/test/weatherCard.test.tsx` | see git log |
| 11 | Reports: "Couldn't create the file" for the PDF report and ABC data (FHIR worked); also forecasts on the phone | fixed | `apps/mobile/test/hermesIntl.test.ts`, `fileErrors.test.tsx`, `packages/engine/test/reasons.test.ts` | see git log |
| 12 | Reports: the 3 audience PDFs had the same file name, so "Save to Files" kept only the first | fixed | `apps/mobile/test/reportLayout.test.ts` (1), `phase6Screens.test.tsx` | see git log |
| 13 | Report: "How precisely known" showed 3900% instead of 39% | fixed | `apps/mobile/test/reportLayout.test.ts` (2) | see git log |
| 14 | Report: "Time of day" heading alone at the bottom of page 1, its chart on page 2 | fixed | `apps/mobile/test/reportLayout.test.ts` (3) | see git log |
| 15 | Report: calendar heatmap week labels overlapped | fixed | `apps/mobile/test/reportLayout.test.ts` (4) | see git log |
| 16 | Effect wording "About 0% lower chance" | fixed | `packages/engine/test/insights.test.ts`, `reportLayout.test.ts` (5) | see git log |
| 17 | Worth watching showed the stored tag key "transition" in quotes | fixed | `apps/mobile/test/reportLayout.test.ts` (6) | see git log |
| 18 | School report: kind of place per hard moment, therapy/relatives' place patterns and place names in worth watching could appear | fixed | `apps/mobile/test/schoolPrivacy.test.ts` | see git log |
| 19 | Report: "common.hours" instead of the hours in the Sleep section | fixed | `apps/mobile/test/sharedReport.test.ts` | see git log |
| 20 | "Isn't connected to a server" after adding apps/mobile/.env (old Metro address in the Simulator) | fixed (setup; HUMAN_TODO C4) | `apps/mobile/test/cloudConfig.test.ts` | see git log |
| 21 | Two-phone sync test broke on its own (fixed dates in the test) | fixed | `apps/mobile/test/sync.test.ts` | see git log |
| 22 | Shared report "Made on" was the UTC date (next day on a US evening) | fixed | `packages/reports/test/reports.test.ts`, `apps/mobile/test/reports.test.ts` | f192384 |
| 23 | School report / share link: late-night hard moments reveal home life | fixed (Phase 10) | `apps/mobile/test/schoolPrivacy.test.ts` | see git log |
| 24 | Report: time-of-day chart only covers waking hours, but the summary can name another time | fixed (Phase 10) | `packages/reports/test/reports.test.ts` | see git log |
| 25 | Red "Unable to resolve module buffer" screen after the Phase 8 rebuild | fixed; student to confirm the app opens | `bundle:check` (CI) | f178d63 |
| 26 | Voice/document notes: "headphones helped" didn't become a strategy | fixed, re-test pending | `ruleParser.test.ts`, `phase8Fixes.test.tsx` | 19a18f7 |
| 27 | Weekly digest: no message when the AI summary couldn't be written | fixed, re-test pending | `phase8Fixes.test.tsx` | 19a18f7 |
| 28 | "It resets tomorrow" but the daily AI limit resets at 00:00 UTC | fixed, re-test pending | `phase8Fixes.test.tsx` | 19a18f7 |
| 29 | Ask EmoLens answers showed Markdown asterisks | fixed, re-test pending | `phase8Fixes.test.tsx` | 19a18f7 |
| 30 | Daily-limit message was a red error with a "Try again" that couldn't work | fixed, re-test pending | `phase8Fixes.test.tsx` | 19a18f7 |
| 31 | Wi-Fi off: Ask said "The AI isn't available right now" | fixed, re-test pending (needs one app rebuild) | `phase8Fixes.test.tsx` | 19a18f7 |
| 32 | Console error "[EmoLens] sound: … getStatus … Unable to find the native shared object" after the Mac slept | fixed (Phase 10) | `apps/mobile/test/soundCheck.test.tsx` | see git log |
| 33 | Sound check screen showed "sound.listening" instead of the seconds left; Today header text below 4.5:1 contrast | fixed (Phase 10) | `apps/mobile/test/i18n.test.ts`, `theme.test.ts` | see git log |
| 34 | Privacy review: server's School-link check skipped "worth watching" and patterns; some "never leaves this phone" texts overstated | fixed (Phase 10) | `supabase/functions/_tests/shared.test.ts`, `packages/reports/test/reports.test.ts`, `phase7Screens.test.tsx` | see git log |
| 35 | Spanish demo Timeline showed English meal names ("chicken and rice"); found when the Spanish screen test failed on a different set of demo days | fixed (2026-10-22) | `apps/mobile/test/spanishScreens.test.tsx` | see git log |

## 1. Back button does nothing
- **Found in:** iOS Simulator, onboarding. The exact step was not given yet.
- **Steps:** on an onboarding step, tap Back (the arrow at the top left).
- **Expected:** goes to the previous step.
- **Actual:** nothing happens.
- **Needed to reproduce:** which step number (shown at the top: "Step N of 13"), and how you got there (tapped
  Continue from the start, or opened it another way, e.g. after reloading the app).
- **Update:** the step was never pinned down, so every step was tested instead; two causes were found and fixed. See #9.

## 2. Can't type a birth year
- **Found in:** iOS Simulator, onboarding step 4 "About your child" (the same field is in More → Child profile).
- **Steps:** tap the Birth year field and type a year, e.g. 2017.
- **Expected:** the field shows the digits as you type and accepts a 4-digit year.
- **Actual:** typed digits don't appear.
- **Cause:** the field only kept what was typed if it was already a complete year in range (2001-2026). The first digit,
  "2", isn't, so it was thrown away and the field went blank again, every time.
- **Fix:** `src/features/ChildFields.tsx` keeps the typed digits on screen (digits only, up to 4) and saves the year only
  once it is a complete year in range. Four digits out of range now show "Enter a year between … and …".
- **Test:** `test/birthYear.test.tsx` types digit by digit and checks the field shows each digit, saves 2017, doesn't
  save partial or out-of-range years, ignores letters, and clears the year when emptied. It failed before the fix.

## 3. Apple Health imported nothing in the Simulator
- **Found in:** iOS Simulator. A sleep entry and a heart-rate reading were added in the Health app, Apple Health was
  switched on in More → Data sources, and Sync now was tapped. No Sleep entry appeared on the Timeline, and the card
  still said "Connected".
- **What was checked:** the build is fine. The installed app carries the HealthKit entitlement (Simulator builds embed it
  in the app binary) and the Health usage description. iOS's own Health records show EmoLens asked for all five types at
  1:17 pm and got an answer, and reads worked: a test read returned the sleep sample and the heart-rate reading.
- **Cause 1 (why no sleep):** sleep added by hand in the Health app is stored as **"In Bed"** (value 0), not "Asleep".
  EmoLens only counted "Asleep" values, so it found no sleep and made no night.
- **Cause 2 (why the card lied):** iOS never tells apps whether *read* access was refused; it just returns nothing. The
  switch skipped the permission request whenever iOS said a decision already existed ("unnecessary"), and a sync that
  received nothing still showed "Connected".
- **Fix:** nights with no "Asleep" data use "In Bed" time instead (SPEC 6.2 allows time in bed when asleep time isn't
  available; wakings are then unknown). Switching a source on always makes the permission request (iOS shows its screen
  only if it still needs an answer). A sync that receives nothing at all now shows **"No data received"** on the card, with
  where to turn Health access on. "Sync now" says what it imported, e.g. "Imported 1 night, 1 heart-rate reading.",
  counting only new items.
- **Test:** `test/healthSync.test.ts` replays the exact Simulator data through the real sync (1 night of 555 minutes,
  1 heart-rate reading; nothing new the second time), checks the "No data received" state, and checks that switching on
  always makes the request. Each test failed when its fix was removed. Also new tests in `test/integrations.test.ts`
  for in-bed nights, the Sync now sentence and the status.
- **Verified in the Simulator:** after the fix, EmoLens imported the entry as a night from 9:30 pm to 6:45 am and the
  heart-rate reading of 90.

## 4. "Choose calendars" said "No calendars found" with Full Access
- **Found in:** iOS Simulator. Settings → EmoLens → Calendars was "Full Access", the Calendar app had events, but More →
  Data sources → Calendar → Choose calendars said "No calendars found on this phone", even after reloading.
- **What was checked:** permission was fine (`getCalendarPermissions()` → granted). A probe showed `getCalendars()` **threw**
  ("Calling the 'getCalendars' function has failed"), while `getCalendars(EntityTypes.EVENT)` returned the three calendars.
- **Cause:** on iOS, `getCalendars()` without a type lists event calendars *and* reminder lists, which needs Reminders
  permission as well (stated in expo-calendar's docs). EmoLens never asks for Reminders, so it threw, and the screen showed
  every error as "No calendars found".
- **Fix:** EmoLens asks for event calendars only. The screen now tells three cases apart: no access ("EmoLens can't see
  your calendars" with Allow access / Open Settings), a loading error (with Try again), and truly no calendars. It re-checks
  when the app returns from Settings, and so do Data sources and Today's chips.
- **Test:** `test/calendarAccess.test.tsx` fakes iOS's behavior (throw without a type) and checks the calendar list, the
  no-access and error states, and the re-check after coming back from Settings. It failed with the old call.
- **Verified in the Simulator:** the calendars now load (Calendar, Birthdays, US Holidays).

## 5. "Delete all data" crashed with "Render Error: Session not ready"
- **Found in:** iOS Simulator. More → Privacy & security → Delete all data → typed DELETE → red "Render Error: Session not
  ready" on Today (`useReady`).
- **Cause:** `deleteAllData` (`src/store/session.ts`) cleared the database handle, child and profile while the session
  still said `status: 'ready'`. The root layout only looks at `status` to decide which screens exist, so Today stayed
  mounted for a moment with no session, and `useReady()` threw.
- **Fix:** switch to `status: 'booting'` in the same update that clears the session (the root layout then shows only its
  spinner), then delete the files, keys and notifications and boot again, which ends in onboarding.
- **Test:** `test/deleteAll.test.ts` records every session state during deletion and checks that none is "ready" without a
  database and child, and that it ends in onboarding. It failed before the fix.

## 6. Medication reminder never arrived
- **Found in:** iOS Simulator. Added a medication (typed "melat", picked a suggestion), set a time 2 minutes ahead with
  reminders on, saved, went to the home screen. No notification appeared. Notifications were allowed.
- **What was checked in the Simulator:** notification permission is granted; the `MED_DOSE` category is registered
  with "Given" (`TAKEN`) and "Skip" (`SKIP`); the phone's time zone and the child's home time zone are both
  America/Chicago. Replaying the exact save (add medication → reschedule) scheduled a daily reminder at the right hour
  and minute, and it was delivered 2 minutes later. A Jest test that types "melat", picks the suggestion, sets the time
  and taps Save also schedules it correctly. So the reminder itself could **not** be reproduced as missing; the
  student's original run can't be replayed (its data was deleted by the bug #5 test).
- **Real problems found on the way (fixed):**
  1. **Time zone:** medication times are saved in the child's home time zone (like dose rows), but reminders were
     scheduled on the phone's clock using the saved hour and minute. When the phone's time zone differs (travel, or a
     Simulator whose Mac is in another zone), the reminder came at the wrong time, possibly on the wrong day. Now each
     time is converted to the phone's clock (and weekday) before scheduling.
  2. **"Given" did nothing on a medication added today:** today's dose rows were only created at app start or during a
     data refresh, so the first reminder's "Given" / "Skip" found no dose to mark. Rescheduling now creates them.
  3. **Silent failure:** saving said only "Saved." It now says when the next reminder comes ("Saved. Next reminder:
     Today, 2:37 PM.") or that notifications are off in Settings, so a wrong AM/PM or blocked notifications show
     up right away instead of as a reminder that never comes.
- **Tests:** `medReminderFlow.test.tsx` walks the exact steps and checks the scheduled trigger, the `MED_DOSE`
  category with Given/Skip, the save message, and that "Given" marks the dose taken (fails on the old code: message
  was "Saved.", and no dose was marked). `integrations.test.ts` checks the time-zone conversion, including a weekly
  reminder that moves to the next weekday (fails on the old code).
- **If it happens again:** note the time shown in the save message, and whether the app was open or in the background.

## 7. Calendar still said "No calendars found"; go to the picker after allowing access
- **Found in:** iOS Simulator (Phase 4 test round). Full Access to Calendars, events in the Calendar app, but "Choose
  calendars" said "No calendars found on this phone" and the card stayed at "Needs setup · Choose which calendars".
- **What was checked:** this is the same problem as #4, fixed in commit 303cb08. Checked again on a fresh bundle in the
  Simulator: permission `granted`, and the list shows Calendar, Birthdays and US Holidays. "Needs setup" is correct
  until at least one calendar is chosen.
- **Still missing (fixed now):** after switching Calendar on (or tapping "Allow access") in Data sources, the parent
  stayed on Data sources and had to find "Choose calendars" themselves. Now, once access is granted and no calendar is
  chosen yet, EmoLens goes straight to the calendar picker. Missing access still shows "EmoLens can't see your
  calendars" with Allow access / Open Settings, and the list re-checks when you return from Settings (from #4).
- **Test:** `calendarAccess.test.tsx` switches Calendar on in Data sources and expects the picker with the calendars
  (fails on the old code: it stayed on Data sources).

## 8. "Location couldn't sync" after Sync now, with "Always" location
- **Found in:** iOS Simulator (location set to Cupertino). Settings → EmoLens → Location was "Always".
- **What was checked in the Simulator:** permission `granted` with scope "always" (foreground and background); the
  app's Info.plist has the `location` background mode; the geofence task is defined. Calling
  `startGeofencingAsync` directly failed with **"GeofencingUnavailable: Geofencing is not available"**
  (`ERR_GEOFENCING_UNAVAILABLE`). expo-location throws this when iOS says the device can't monitor regions at all
  (`CLLocationManager.isMonitoringAvailable` is false).
- **Cause:** a real iOS Simulator limitation: this Simulator can't watch places (regions) in the background. Not a
  permission problem and not an EmoLens bug, but EmoLens reported it as a failed sync with no explanation.
- **Fix:** that one error now counts as "works partly" instead of a failure. The Location card says "Works partly · This
  device can't watch places in the background, so arrivals aren't noticed automatically. Check in by hand: Today →
  Place. (The iOS Simulator can't do this; a real iPhone can.)", and Sync now explains the same instead of
  "Location couldn't sync". Any other geofencing error is still shown as a failure. Recorded in DECISIONS #55.
- **Test:** `locationSync.test.ts` makes geofencing throw the exact Simulator error and expects the explanation, not
  "couldn't sync" (fails on the old code); plus a working-geofence case and an other-error case.
- **On a real iPhone:** region monitoring is available, so the card should say "Connected · Watching N places".

## 9. Back on every onboarding step, log sheet and settings screen (follows up #1)
- **Asked for:** a test that goes through all 13 onboarding steps tapping Back on each, fixes any step where Back doesn't
  work, and checks Back on the log sheets and settings screens.
- **What the test found:**
  1. Steps 2-13, reached with Continue: Back goes to the previous step on every one.
  2. **Step 9 with "Add medication" open:** Back left step 9 for step 8 and threw away the half-filled medication. The
     form is shown inside step 9, so Back should close it. Fixed: Back now closes the form and stays on step 9.
  3. **A step opened with no history** (for example after the app reloads on that step): Back called "go back" with
     nothing to go back to, so **nothing happened**, exactly as reported in #1. Fixed: Back then goes straight to the
     previous step. Settings screens (Back) and log sheets (Close) had the same gap; they now go to Today.
  4. All 11 log sheets and the medication/place sheets close with the X; all 13 settings screens go Back.
- **Test:** `backNavigation.test.tsx` (31 checks). Before the fix, the step-9 check and the three "without history"
  checks failed ("GO_BACK was not handled by any navigator").
- **Test setup fixes found on the way:** Reanimated's test mock needs react-native-worklets' mock (added to
  `test/setup.ts`), and the `expo-audio` mock now returns the same recorder on every render like the real hook.

## 10. Weather card said "Set Home's location" after it was set
- **Found in:** iOS Simulator, More → Data sources → Weather & air.
- **Cause:** the button label was always "Set Home's location"; it never checked whether Home already had a location.
- **Fix:** once Home has a location (the rounded weather location is saved), the button says "Change Home's location"
  ("Cambiar la ubicación de Casa" in Spanish). It still opens Places.
- **Test:** `weatherCard.test.tsx` renders Data sources with and without Home's location (the "with" case fails on the
  old code).

## 11. "Couldn't create the file" for the PDF report and the ABC spreadsheet (FHIR worked)
- **Found in:** iOS Simulator after the Phase 6 rebuild, demo mode: "Create PDF report" (every audience, every range,
  custom Sep 29-30) and "ABC data" always showed "Couldn't create the file. Please try again."; "Health record file
  (FHIR)" worked.
- **How it was narrowed down:** the Simulator's app folder had the FHIR file but no CSV file and no `Print` folder, so both
  failed *before* any file was written: while preparing the data, not while saving or sharing. The same code ran fine in
  Node. The phone's JavaScript engine (Hermes) was checked directly: its `Intl` has `DateTimeFormat`, `NumberFormat` and
  `Collator` but **no `PluralRules`**.
- **Cause:** the shared text helper `fmt` (Phase 5 plurals polish) called `new Intl.PluralRules(...)` to choose "1 planned
  transition" vs "2 planned transitions". On Hermes that throws "Intl.PluralRules is not a constructor". The PDF report
  uses `fmt` for the effect sentences, the ABC file for its automatic antecedents; the FHIR file never calls it. The same
  call also made **every forecast run on the phone fail** since that change (the app kept the last good forecast and showed
  "Forecast temporarily unavailable"), and "Regenerate demo data" would have failed. i18next (the app's own texts) was not
  affected: it catches the missing `PluralRules` and falls back to a one/other rule.
- **Fix:** `fmt` uses the CLDR "one" rule for English and Spanish written out in code (`isPluralOne`): no `Intl.PluralRules`
  needed, same results on the phone and in Node. A test now fails if any app or engine code uses an `Intl` feature Hermes
  lacks.
- **Logging (so the next failure isn't just a toast):** every file feature labels its steps (load, render or build, print,
  save or write, share; for import: pick, read, check, import). A failure is saved in About → Diagnostics as, e.g.,
  `report.pdf · print: Error: ...`. While developing, it is also printed in the dev terminal (Metro) with the first lines of
  the stack. File paths and quoted text are removed from messages, so no names or notes are logged.
- **Tests:** `hermesIntl.test.ts` removes `Intl.PluralRules` like on the phone, then builds the demo, runs a forecast, makes
  every PDF (3 audiences, Spanish, 4 ranges including Sep 29-30), the ABC and FHIR files, the digest PDF, and exports and
  re-reads a backup. On the old code all 9 tests fail with "Intl.PluralRules is not a constructor". `fileErrors.test.tsx`
  checks the step labels, the scrubbing, the dev-terminal output and what each screen records. `reasons.test.ts` checks the
  plural rule in the engine without `Intl.PluralRules`.

## 12-18. Phase 6 hand test, demo mode (2026-09-30)
- **12. Same file name for every audience.** The report PDF was named `EmoLens-{nickname}-{from}-{to}.pdf`, so the
  Clinician, School and Family PDFs of the same dates collided and iOS "Save to Files" silently kept only the first.
  **Fix:** all export names come from `src/reports/fileNames.ts` and include what makes each file different: the audience
  (`EmoLens-Sam-demo-School-2026-09-01-to-2026-09-30.pdf`), the language for the digest / ABC / FHIR files, the date range
  and "with-name" for FHIR, and the time for a full backup. Checked the other exports for the same problem.
  **Test:** every combination of audience, language, range, nickname switch and backup time gives a different name; the
  screen test shares a Clinician and a School PDF and checks both names.
- **13. "How precisely known" 3900%.** The engine gives this as a whole number 0-100 (39 = 39%); the report multiplied it
  by 100 again. The app screens were right. **Fix:** one helper, `precisionPct`, used by the report and the screens (the
  digest and FHIR files don't show it; the portal snapshot doesn't exist yet). **Test:** each pattern row shows the
  engine's number with one % sign, and no percentage anywhere in the report is over 100%.
- **14. Heading stranded at the bottom of a page.** **Fix:** every section that doesn't start a new page (all but the
  table sections) is kept in one piece (`page-break-inside: avoid`), and headings never end a page
  (`page-break-after: avoid`). **Test:** every heading in all three audiences is inside a kept section or a section
  that starts a page with its table; every chart is in a kept section.
- **15. Overlapping heatmap labels.** Every week was labelled for ranges of 8 weeks or less, but "Sep 14" is wider than a
  week's column. **Fix:** the label step comes from the widest label's width. **Test:** label positions never overlap for
  2 weeks, 30 days, 90 days and long Spanish labels.
- **16. "About 0% lower chance".** **Fix:** an effect that rounds to 1.0× reads "About the same chance ..." /
  "Alrededor de la misma probabilidad ...". **Test:** engine test at 0.96, 0.996, 1.0 and 1.04, and 0.94 / 1.05 still
  say "6% lower" / "1.1×"; no report contains "0% lower".
- **17. Raw tag key in worth watching.** Calendar tags are stored as keys ("transition"); their names were lowercase
  fragments made to sit inside quotes. **Fix:** proper labels ("Transitions", "Transiciones"...), the sentence
  "... around calendar events tagged Transitions", and one helper (`watchItemName`) for the screens, the report and the
  digest. **Test:** every tag in both languages; a report with a transition item.
- **18. School report privacy gaps (found while writing the requested privacy test).** The School report still showed
  the *kind* of place of each hard moment ("Home"), could show the "Therapy or medical visits" and "Relatives' and other
  places" patterns, and listed places other than home in worth watching. **Fix:** for School, no "Where" column, no place
  items in worth watching, and those two place patterns are left out. **Test:** `schoolPrivacy.test.ts` builds the full
  120-day demo, adds hard moments at Home and at Grandma's and a worth-watching place, then checks the School report in
  English and Spanish (14 / 30 / 90 days) for any medication name, "medication", doses, sleep, the prescriber sentence,
  and any place outside school (also written as HTML, e.g. `Grandma&#39;s`). It failed on the old code ("Therapy") and
  passes now; the same check run on the Clinician report finds the leaks, so it works. The check (`test/privacyChecks.ts`)
  is ready for the School share-link snapshot in Phase 7.

## 19. "common.hours" instead of the hours in the PDF's Sleep section (found by a test, 2026-09-30)
The Sleep section's two tiles ("average asleep", "usual") passed the hours as text ("9.0") as i18next's plural `count`.
i18next can only choose a plural form for a number, so it found no string and printed the key "common.hours". Found
while building the portal: a test comparing the app's report with the portal's (which chose a plural form for text
too) showed the difference. **Fix:** a plain "{{value}} h" string (`report.hoursValue`) for these tiles; no plural needed.
**Test:** `sharedReport.test.ts` renders every audience in both languages with the app's i18next and the portal's
translator, requires identical output, and fails if any untranslated key (like `common.hours`) appears in a report.

## 20. "Isn't connected to a server" after adding apps/mobile/.env (Phase 7 hand test, 2026-10-01)
After `apps/mobile/.env` got the local Supabase values and Metro was restarted with `pnpm start --clear`, Create account
still said "This copy of EmoLens isn't connected to a server yet". **Cause: not the code.** The names match (`.env` and
`src/cloud/client.ts` both use `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`); `app.json`'s empty
`supabaseUrl` / `portalUrl` are overridden by `app.config.ts` and aren't read by the app; and the bundle Metro served
contained the local URL and key. The Simulator's development app was reopening the last Metro address it remembered, a
Wi-Fi address from another network (`10.133.197.194` / `192.168.1.57`), which no longer reaches the Mac ("No network
route" in the Simulator log). So reloading did nothing and it kept running a copy of the app from before `.env` existed.
**Fix:** open the app through `localhost` (HUMAN_TODO Phase 7 C4). **Test:** `test/cloudConfig.test.ts` checks that
the app reads the names `.env.example` lists, needs both, that `app.config.ts` passes them on over `app.json`, and that
this computer's `apps/mobile/.env`, read with Expo's own loader, has a URL and the publishable key (not the secret key).
That last test is skipped in CI, where there is no `.env`.

## 21. Two-phone sync test broke on its own on 2026-10-01 (found while fixing #20)
"Both phones edit the same hard moment" set the edits' times to fixed dates (2026-10-01 10:00 UTC). Once that time had
passed, the "later" edit was older than the row's real save time, so neither edit won. The app was fine; the test had
a date in it that turned into the past. **Fix:** the edit times are now a day after the current time. **Checked:** the
whole mobile suite passes with the clock set to 2026-10-01 23:50 and 2026-10-08; the old test fails on 2026-10-08.

## 22. Shared report said "Made on Oct 2" for a report made on Oct 1 at 10:47 PM (Phase 7 hand test E8, 2026-10-01)
The report's "Made on" date took the first 10 characters of the UTC timestamp. 10:47 PM in California is already
05:47 the next day in UTC, so every report made in a US evening (app PDF, portal report, share link) showed tomorrow's
date. The same mistake was in: the expiry date of share links and invite codes (app and the portal's share banner), the
backup file's date when importing, and the FHIR export's "today" (a medication ending today was marked "completed" in
the evening). **Fix:** one helper, `dateYearAt(lang, time, timeZone)` in `packages/reports/src/format.ts`, used for all
of them with the child's home time zone (for a backup, the backed-up child's); FHIR uses `localDateOf(now, homeTz)`.
Report periods, the digest, the hard-moments table and notes already used the home time zone. **Test:** a report made
at 10:47 PM in Los Angeles says "Made on Oct 1, 2026" (and "1 oct 2026" in Spanish), also after going through a share
link's snapshot, and contains no "Oct 2, 2026"; `dateYearAt` at 11:30 PM in New York and 1 AM in Tokyo; a FHIR
medication ending Oct 1 is still "active" at 10:47 PM in Los Angeles. Both tests fail on the old code.

## 23. School report: hard moments outside school can reveal home life (Phase 7 hand test, 2026-10-08) — fixed in Phase 10
- **Found in:** a School share link / School PDF. Places are already left out (#18), but every hard moment in the range is
  listed with its date and time, so a meltdown at 11 PM still tells the school about home life.
- **Wanted:** an option (probably the default for School) to include only hard moments **during school hours** (the
  child's school days and the school-hours blocks) **or logged at school**. The summary, calendar and time-of-day
  sections must use the same filtered set, so their numbers match the table.
- **Do in Phase 10 (privacy review), not now.** Needs a test like `schoolPrivacy.test.ts`: a late-night hard moment must
  not appear anywhere in a School report or share snapshot when the option is on.
- **Fix (2026-10-15):** a new switch **Only school time**, on by default, on the Reports screen and the new share link
  sheet when the audience is School. `packages/reports/src/school.ts` decides "school time": logged at a place of type
  School, or started 8:00 AM to 3:30 PM (`SCHOOL_HOURS`, now in `packages/shared`, the same hours as the teacher's
  forecast) on one of the child's school days. `assembleReport` filters the hard moments **first**, so the table,
  summary tiles, trend, calendar heatmap, time-of-day chart (school-day blocks, school-hour rows only) and strategy
  counts all use the same set; the report's cover says "This report includes only hard moments during school hours…".
  The portal's School report uses the same code (always on there). The share-create function can't check this (it
  doesn't know the school days), but it isn't a security boundary: the owner may turn it off.
  **Tests:** `schoolPrivacy.test.ts` (an 11 PM Wednesday and a Saturday hard moment appear nowhere in the School PDF,
  English and Spanish, or the School share snapshot; an after-hours one at school and a school-hours one do; the
  summary, calendar and chart numbers equal the table; turned off they appear, still without places).

## 24. Report: time-of-day chart vs. "Most often in …" (Phase 7 hand test, 2026-10-08) — fixed in Phase 10
- **Found in:** the report. The Time-of-day chart only has the child's waking-hour blocks, but the summary counts every
  hard moment, so it can say "Most often in the evening" while the chart shows nothing at that time.
- **Wanted:** either a short note under the chart ("N hard moments happened outside waking hours and aren't shown"),
  or count them in the chart (e.g. an "outside waking hours" bar). The summary and the chart must never disagree.
- **Do in Phase 10, not now.** Test: a report whose hard moments are mostly outside waking hours shows the note (or the
  bar), in English and Spanish.
- **Fix (2026-10-15):** there were two mismatches: the chart has waking hours only, and it shows the *share* of 2-hour
  blocks with a hard moment while "Most often" counted hard moments. The summary sentence now names the chart's tallest
  bar ("Hard moments were most likely in the 2–4 pm block (see the time-of-day chart)."), so the two can't disagree,
  and under the chart: "3 hard moments happened outside waking hours, so they aren't in this chart." Old share links
  still show (the note is worked out from data they already have). **Test:** `packages/reports/test/reports.test.ts`
  (three 11 PM hard moments: the sentence names 2–4 pm, never "evening", the note counts 3, in English and Spanish; no
  note when every hard moment is inside the chart).


## 25. App shows a red "Unable to resolve module buffer" screen after the Phase 8 rebuild (student, 2026-10-13)
Import chain: `app/log/voice.tsx` → `src/voice/whisper.ts` → `whisper.rn/index` (whisper.rn's source) →
`safe-buffer` → `buffer`. whisper.rn lists the Node package `safe-buffer` as a dependency, and `safe-buffer` needs
Node's `buffer` module, which React Native doesn't have and which isn't installed in this repo. Every test passed
because Jest mocks whisper.rn, and the app's bundle was not built after Phase 8. **Fix:** whisper.rn uses Buffer only
to decode base64 audio in `transcribeData()` / `detectVoice()`, which EmoLens never calls (it passes a WAV file path),
so no polyfill is added: `apps/mobile/metro.config.js` points `safe-buffer` at `src/shims/safeBuffer.ts`, which throws
a clear error if that base64 path is ever used (DECISIONS #134). **Test:** new `pnpm --filter @emolens/mobile
bundle:check` (also in CI) builds the iOS and Android bundles as a release would and fails on an unresolvable module or
a Node-only package in the bundle; it fails with the original error when the fix is removed, and passes with it.

## 26. Voice/document notes: "headphones helped" didn't become a strategy (Phase 8 hand test, 2026-10-14)
"Meltdown at 4 PM, headphones helped" made only the hard-moment card. Two causes: the on-device word rules matched a
strategy only by its full list name ("noise-reducing headphones"), and a matched strategy was only a small "Tried: …"
line inside the hard-moment card. **Fix:** each strategy is its own review card ("Strategy tried · Noise-reducing
headphones", with Helped / Didn't help / Not sure), saved with its hard moment (as a strategy used during it) and only
when that hard moment is ticked; a strategy not in the family's list is shown but can't be saved (like medications).
The word rules also know everyday words for the built-in strategies in English and Spanish ("headphones", "ear
defenders", "audífonos", "weighted blanket", "swing"…) and each part of names like "Quiet space / break area".
**Tests:** `ruleParser.test.ts` (everyday words, both languages, "lunch break" is not "break area"),
`phase8Fixes.test.tsx` (two cards; saving writes the strategy use with "helped"; unticking the hard moment saves
neither; an unknown strategy can't be saved).

## 27. Weekly digest: no message when the AI summary couldn't be written (Phase 8 hand test, 2026-10-14)
**Fix:** a gentle note under the usual summary: "Couldn't write an AI summary right now, so this is the usual summary.
EmoLens will try again next time you open this week." **Test:** `phase8Fixes.test.tsx` (AI answers 502 → the note and
the template sentences show).

## 28. "It resets tomorrow" but the daily AI limit resets at 00:00 UTC (7 PM Central) (Phase 8 hand test, 2026-10-14)
**Fix:** the message gives the real time in the family's time zone: "It resets at 7:00 PM." or "It resets tomorrow at
2:00 AM." (DECISIONS #135). **Test:** `phase8Fixes.test.tsx` (Chicago before and after 7 PM, Madrid).

## 29. Ask EmoLens answers showed Markdown asterisks (Phase 8 hand test, 2026-10-14)
**Fix:** `src/lib/markdown.ts` + `src/ui/RichText.tsx` show bold, bullet and numbered lists, headings and table rows
as formatting; also used for the digest's AI summary (it began with "**Weekly summary…**" in the live check). "Copy"
copies plain text. **Tests:** `phase8Fixes.test.tsx` (parser and plain text; the Ask screen shows "7 hard moments"
in bold and no "**").

## 30. Daily-limit message was a red error with a "Try again" that couldn't work (Phase 8 hand test, 2026-10-14)
**Fix:** a calm (grey) notice without "Try again". **Test:** `phase8Fixes.test.tsx` (Ask screen: no Try again button).

## 31. Wi-Fi off: Ask said "The AI isn't available right now" (Phase 8 hand test, 2026-10-14)
The wording was already grammatical ("isn't"). Cause: the Simulator's app talks to the local Supabase on the same Mac,
which it can still reach with Wi-Fi off; the server then can't reach the AI and answers "ai_unavailable". **Fix:**
when an AI request fails, the app asks the phone whether it has internet (`expo-network`, DECISIONS #136); if not,
Ask says "Ask EmoLens needs an internet connection. Connect and try again." (calm, with Try again). Other AI
features say "AI features need an internet connection." **Tests:** `phase8Fixes.test.tsx` (server error + no
internet → offline; with internet → stays "AI isn't available"; the Ask screen text).

## 32. Console error after the Mac slept with the Simulator open (student, 2026-10-15)
- **Found in:** the iOS Simulator, once, right after reopening the app when the Mac had been asleep with EmoLens in
  the background: `[EmoLens] sound: FunctionCallException: Calling the 'getStatus' function has failed ... NotFoundException:
  Unable to find the native shared object associated with given JavaScript object.`
- **Cause:** the 60-second sound check on the hard-moment sheet (or the 30-second one on Sound check) kept its loop
  running while the app was suspended. iOS released the native recorder; when the app woke up, the loop called
  `getStatus()` on it, which threw, and the error was logged. Closing the sheet mid-check could do the same through
  `stop()`, and the hook could update a screen that was already closed.
- **Fix (`src/integrations/useSoundCheck.ts`):** each check has its own number; closing the screen or the app going to
  the **background** makes it stale. On background the recorder is stopped at once, while it still exists; a stale
  check never touches it again. A 250 ms wait that took over 5 s (asleep without a background event) also stops the
  check. These stops are not errors: nothing is logged and nothing is saved, and the Sound check screen says "The sound
  check stopped because EmoLens went to the background. Nothing was saved." with **Measure again**. The audio file is
  still deleted. 'inactive' doesn't stop it (iOS sends that while the microphone permission dialog is open). The
  released-recorder error itself is never logged; real failures still go to Diagnostics.
- **Tests:** `soundCheck.test.tsx` (background mid-check: one stop, no more reads after returning even when the
  recorder throws, no error, no sample; closing mid-check; the exact reported error; a 10 s clock jump; inactive keeps
  going; a real failure is still logged; the screen shows the message and Measure again works).

## 33. Found while fixing #32 (2026-10-15)
- **Sound check screen showed "sound.listening"** instead of "Listening… 12 seconds left": the plural string was
  asked for without `count`, so i18next found no form. **Fix:** pass `count`. **Test:** `i18n.test.ts` now checks
  every plural-only string in the code is asked for with a count.
- **Today header contrast:** white text on the lighter end of the header gradient was 4.19:1 (AA needs 4.5:1), lower
  on the see-through status box and place pill, and the date line was drawn at 90% opacity. **Fix:** a slightly deeper
  gradient end (`#6152CC`), a dark film for the see-through boxes (`HERO_GLASS`), full-opacity text. **Test:**
  `theme.test.ts` checks white on both gradient ends and on the boxes, in both themes.

## 34. Found in the Phase 10 privacy review (2026-10-15)
- **School-link server check:** `schoolSafe()` refused medications, sleep and places on hard moments, but not
  medication or place items in "worth watching" or sleep/medication/health/private-place patterns, so a modified app
  could publish them in a School link (the phone itself never did). **Fix:** it refuses those too; a Node test keeps
  its pattern list equal to the report's School rules. Takes effect with the next functions deploy.
- **Wording:** "It never leaves this phone" (home location: a rounded ~1 km location goes to the weather service),
  "calendar events never leave" (titles can go to the AI if the parent switches that on), and a caregiver "can never
  delete the child's data" (they can delete entries; only the owner can delete the profile or account). **Fix:** exact
  wording in English and Spanish; the invite preview also says a teacher sees team members' names and the notes on
  school hard moments. Details and the remaining open items: `docs/PRIVACY_REVIEW.md`.

