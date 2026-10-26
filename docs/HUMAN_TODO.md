# Things only a human can do

Claude Code will add detailed steps here as each phase needs them. Known items from SPEC Section 2:

- [ ] A Mac with the latest Xcode (needed for iOS builds and HealthKit). Android-only development works on Windows/Linux.
- [ ] Apple Developer Program membership ($99/yr): HealthKit, installing on a real iPhone, TestFlight.
- [ ] Android Studio + a physical Android phone (optional, recommended).
- [ ] Expo account + EAS CLI (free).
- [ ] Supabase project (free tier).
- [ ] Anthropic API key (for the in-app AI features; pay per use). This is separate from your Claude Code login.
- [ ] USDA FoodData Central API key (free).
- [ ] Fitbit developer app registration (optional).
- [ ] Vercel account (free) for the clinician portal.
- ~~Room sensor parts, about $25-40 (optional, Phase 9).~~ Not needed: Phase 9 is deferred to future work (DECISIONS #138).
- [ ] Native-speaker review of Spanish strings.
- [ ] Written consent from your family before testing with real data (docs/CONSENT_TEMPLATE.md, now filled in: fill
      the [bracketed] parts, read it with your parent/guardian, both sign; use Part B with your sibling/child).
- [ ] **Legal review before any public release** (not needed for the competition prototype tested only by your family).
      A lawyer who knows children's and health privacy should review the app, `docs/PRIVACY_POLICY.md` and
      `docs/PRIVACY_REVIEW.md` for:
      - **HIPAA**: generally doesn't apply to an app families use themselves, but may if a clinic or therapist practice
        deploys EmoLens for its patients (then a Business Associate Agreement with Supabase and Anthropic is needed);
      - **FERPA**: what teachers log at school and School reports could become school records if a school adopts it;
      - **COPPA**: accounts are adults-only and the app isn't for children, but it stores information about a child;
      - **state consumer health-data laws** (for example Washington's My Health My Data Act, Nevada SB 370, Connecticut
        and other state privacy laws): consent, deletion and "no selling" rules for health information;
      - **app-store rules** for health apps (Apple HealthKit and Google Health Connect data-use policies).
      Also: name the cloud hosting region, a real contact address, and how policy changes are announced.
- [ ] Fill in your name in every `<student name>` placeholder after you have reviewed each file.
- [ ] Put your name in `LICENSE` (the copyright line still says `<student name>`).
- [ ] Make the `pnpm` command available: run `corepack enable` once (Node's built-in corepack then provides
      pnpm 9.12.0, the version pinned in `package.json`). Until then, `corepack pnpm <command>` works.
- [ ] (Optional) To redraw the validation figures yourself: Python 3.12 is installed via Homebrew and a `.venv`
      exists in the repo folder. Run `.venv/bin/python analysis/plots.py --in packages/simulator/out --figures docs/figures`
      after re-running the simulator (the simulator's output folder is not committed; it is about 300 MB).

## Phase 3: run EmoLens on your phone

EmoLens needs a **development build** (its own installable app), not Expo Go, because the encrypted database uses
native code (SPEC 3.1). Your Mac has no Xcode or Android Studio, so these steps use Expo's cloud builder (EAS).
Run the commands in Terminal from the repo folder (`cd ~/Downloads/emolens`).

### One-time setup (both phones)
1. [ ] Run `corepack enable` once so the `pnpm` command works (see the item above).
2. [ ] Create a free Expo account at https://expo.dev/signup.
3. [ ] `cd apps/mobile`, then `npx eas-cli@latest login`.
4. [ ] `npx eas-cli@latest init`. Say **yes** to creating a project. It writes a `projectId` into `apps/mobile/app.json`;
       commit that change.
5. [ ] (Only if the build later says the app id is taken) pick your own id, e.g. `com.yourname.emolens`, and put
       `EMOLENS_BUNDLE_ID=com.yourname.emolens` in `apps/mobile/.env` (copy `.env.example`).

### Android phone (free, easiest)
1. [ ] `npx eas-cli@latest build --profile development --platform android`. The first build takes about 15-25 minutes.
       Say yes when it offers to create an Android keystore.
2. [ ] When it finishes, open the link or QR code it prints **on the phone**, download the `.apk` and install it.
       Android will ask you to allow installing apps from your browser; allow it for this install.
3. [ ] On the Mac: `cd ~/Downloads/emolens/apps/mobile && pnpm start`. A QR code appears.
4. [ ] Phone and Mac on the same Wi-Fi: open the EmoLens app on the phone and scan the QR code (or pick the server from
       the list). If it can't connect, stop the server and run `pnpm start --tunnel` instead.

### iPhone (needs the $99/yr Apple Developer Program)
1. [ ] Join the Apple Developer Program (https://developer.apple.com/programs/). Approval can take a day or two.
2. [ ] Register your iPhone: `npx eas-cli@latest device:create`, open the link on the iPhone and install the profile it offers.
3. [ ] `npx eas-cli@latest build --profile development --platform ios`. Sign in with your Apple ID when asked and let EAS
       manage certificates.
4. [ ] Open the install link on the iPhone. Then turn on **Settings → Privacy & Security → Developer Mode** and restart
       when asked.
5. [ ] On the Mac: `cd ~/Downloads/emolens/apps/mobile && pnpm start`, then open EmoLens on the iPhone and scan the QR code
       with the Camera app.
- Free alternative: install Xcode from the Mac App Store, plug the iPhone in with a cable, and run
  `npx expo run:ios --device` in `apps/mobile`. A free Apple ID works, but the app stops opening after 7 days until you
  run it again.

### iOS Simulator (needs Xcode, no Apple membership)
- `cd apps/mobile && npx expo run:ios` builds, installs and opens EmoLens in the Simulator.
- If the app shows "Failed to load app from http://<numbers>:8081", keep the dev server running and point the app at
  localhost instead: `xcrun simctl openurl booted "exp+emolens://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"`.
- [ ] Tap through onboarding in the Simulator once (Get started → … → Go to Today) and confirm it reaches Today.

### You only rebuild the app when native code changes
After the first install, JavaScript changes appear instantly while `pnpm start` is running. Build again only when a
phase adds a native library (Phase 4 will).

### Please test by hand
- [ ] Go through onboarding in English, then switch to Español (More → Language) and look for anything untranslated.
- [ ] Two-tap test: on Today tap **Log hard moment**, then **Save now, add details later**. Check the Timeline, and that a
      notification asks for details 45 minutes later (if you allowed notifications).
- [ ] Log one of each: meal, medication dose, sleep, place check-in, note, illness, routine change, strategy.
- [ ] Timeline: edit an entry, swipe one left to delete, then tap Undo.
- [ ] Turn on app lock (More → Privacy & security), leave the app for 5+ minutes and come back.
- [ ] Try dark mode and the largest text size (phone settings), and VoiceOver or TalkBack on Today.
- [ ] Demo mode: More → Demo mode → Open demo; check the banner; go back to your profile and confirm nothing changed.
- [ ] Only on a test install: More → Privacy & security → Delete all data.
- [ ] Native-speaker review of Spanish: the key terms are "crisis" (meltdown) and "desconexión" (shutdown); see DECISIONS #37.

## Phase 4: integrations (what EmoLens needs from you)

These need nothing from you: weather, air quality and pollen (Open-Meteo), medication name search (RxNorm),
barcode lookups (Open Food Facts), calendar, places and location, sound check, medication reminders, background refresh.

### 1. USDA FoodData Central API key (free, about 2 minutes) — for typing a food name to search
1. [ ] Open https://fdc.nal.usda.gov/api-key-signup and fill in your name and email. The key arrives by email.
2. [ ] In `apps/mobile`, copy `.env.example` to `.env` (if you haven't already).
3. [ ] Put the key on the line `EXPO_PUBLIC_USDA_FDC_API_KEY=` in `.env`.
- The key is built into the app, so anyone with the app could read it. That's normal and fine for this free key.
- Without a key, barcode scanning, recent foods and typed-in foods still work; only name search is off.

### 2. A contact email for Open Food Facts (barcode lookups)
Open Food Facts asks every app to identify itself with a contact address.
1. [ ] In `apps/mobile/.env`, set `EXPO_PUBLIC_CONTACT_EMAIL=` to an address you're happy to share with Open Food Facts
       (a project address is better than a personal one).

### 3. A new app build (Phase 4 adds native code)
- [ ] Simulator (free): `cd apps/mobile && npx expo run:ios`.
- [ ] iPhone / Android phone: build again with EAS (steps in "Phase 3" above). iPhone still needs the $99 Apple
      Developer Program.

### 4. Things the iOS Simulator can't test (need a real phone)
- Barcode scanning: the Simulator has no camera.
- Arriving at a place in the background, and the background refresh timing. (The Simulator can fake your location:
  Simulator menu → Features → Location → Custom Location, which is enough to test "Use current location".)

### 5. Health data
- [ ] iOS Simulator: works with no account. Open the Health app in the Simulator and add some Sleep, Heart Rate and Steps
      entries by hand, then connect Apple Health in EmoLens.
- [ ] Real iPhone: needs the Apple Developer Program; EAS turns on the HealthKit capability for you.
- [ ] Android (optional): a phone with Android 14 or newer (Health Connect is built in), or Android 9-13 with the
      "Health Connect" app from the Play Store.
- Remember whose data it is (SPEC 11.1): health data comes from the phone EmoLens runs on. Your own phone's data
  describes you, not your child. Your child's own phone or watch (Child Device mode, working fully once Care Team exists in
  Phase 7) is the right source.

### 6. Fitbit: skipped for now (your decision)
Fitbit's old Web API, the one the spec names, shuts down around September 30, 2026. Its replacement, the Google Health
API, puts every scope in Google's "Restricted" category (a privacy and security review), is still changing, and would
need you to set up a Google Cloud project and re-connect every 7 days while in testing mode. So EmoLens does not build
a Fitbit connection now (DECISIONS #40). On Android, the Fitbit app can share sleep and heart rate with Health Connect,
which EmoLens does read. Tell me if your child actually uses a Fitbit with an iPhone and you want me to build the
Google Health API connection anyway.

### 7. Test data to set up
- [ ] In the Simulator's Calendar app, add a few events for today and tomorrow, e.g. "Dentist", "Field trip", "Soccer".
- [ ] When EmoLens asks, allow Notifications, Calendar, Microphone, Health, and Location. For places to be noticed in the
      background, choose "Allow While Using App" first, then change it to "Always" in Settings → EmoLens → Location.

## Phase 5: forecasting, alerts, Insights, demo mode

Nothing to sign up for, no keys, and **no new app build**: Phase 5 adds no native code (charts use the already-installed
`react-native-svg`). Keep using the development build you already have.

### Run it
1. [ ] In Terminal: `cd ~/Downloads/emolens/apps/mobile && pnpm start` (or `corepack pnpm start`). If one is already
       running, press `r` in it to reload. If the app shows "Unable to resolve @emolens/simulator", stop it and run
       `pnpm start --clear` once (Phase 5 added the simulator package to the app).
2. [ ] Open EmoLens in the Simulator (or on your phone). Allow notifications when asked; heads-ups need them.

### Please test by hand (demo mode first: it has 120 days of data)
Done 2026-09-30: all 14 passed; the demo built in 11 s in the iOS Simulator. After the polish fixes, glance at one
pattern's detail screen (the status line and "How precisely EmoLens knows the size of this effect") and at a heads-up
that mentions transitions ("1 planned transition").
1. [ ] **Build the demo:** More → Demo mode → Open demo. A progress screen counts the simulated days. Afterwards, More →
       Leave demo mode shows "Built on this phone in N s": please tell me N (the first build on a phone is the slowest step).
2. [ ] **Today:** the strip shows a level (Low / Moderate / High, each with an icon) for later blocks and how earlier blocks
       went; the Now card shows "N% chance", "likely between A% and B%", maybe "about 2x Sam's usual", reasons and ideas.
       Tap a strip segment: the block sheet opens. At night the Now card shows tomorrow's first block.
3. [ ] **Insights:** patterns are listed strongest first. The simulated family truly has four: shorter sleep, planned
       transitions, missed doses and being unwell. In a build made on 2026-09-29 EmoLens found: *Shorter sleep* and
       *Planned transitions* Strong, *Feeling unwell* Likely, *Missed dose* Possible; *Sugary food* (the parent's wrong
       guess) No clear link. It also showed *A loud environment* as Likely although the simulation gave noise no effect:
       school is both loud and full of transitions, so the two are tangled (confounded). That is an honest limitation you
       can explain to judges ("a pattern isn't proof"). Results shift a little depending on the day the demo is built.
       Tap a pattern: status, "How sure", both charts, the evidence, "How we know this". Tap bars and dots in the charts.
4. [ ] **What helps:** both tabs, "Helped s of t times" with bars; try the discovery switch, add / rename / archive a strategy.
5. [ ] **Forecast accuracy (Model Health):** skill headline, reliability diagram, heads-up outcomes, "Last 28 days" vs
       "All time", "Refit now". Expect a modest skill (about 2% better than a time-of-day guess in the 2026-09-29 build;
       AUROC about 0.6). That matches the validation study (VALIDATION.md section on skill): hard moments are rare
       and random, so even an impossible "oracle" that knows the true chance is only about 4% better on average; the
       patterns are the stronger result.
6. [ ] **The answer loop:** Today → Demo tools → "Send a sample heads-up now". After 5 s a "Heads up for …" notification
       appears (swipe down from the top of the Simulator screen if you miss it). About 1 minute later "How did … go?"
       arrives: long-press it and pick **All calm**. Back in the app, the current block in the strip gets a ✓ and
       Model Health says "Last updated" just now. Repeat with **A hard moment happened** (the hard moment opens for details)
       and **We stepped in early** (then "What did you try?" appears on Today).
7. [ ] Demo tools → "Ask about a past time": a "How did … go?" card appears on Today; answer it with one tap.
8. [ ] **End-of-day check:** More → End-of-day check → "No, that's everything". One tap, then the day's earlier blocks show ✓.
9. [ ] **Timeline:** heads-ups appear with their answer; tap one to change the answer.
10. [ ] **Spanish:** More → Language → Español. Within a few seconds the reasons and pattern sentences are in Spanish.
11. [ ] **Dark mode and the largest text size** on Today, Insights, a trigger detail and Model Health (nothing cut off).
12. [ ] **VoiceOver** on the strip and on one chart: each reads a sentence (e.g. "Hard moments by time of day: most common 2 to 4 pm").
13. [ ] **Regenerate demo data** (Demo tools or the demo sheet), then **Leave demo mode**: your real profile is unchanged.
14. [ ] **Real profile:** log a hard moment; a few seconds later Today updates. The banner says "0 of about 14 days with
       answers" until end-of-day checks and answers add up. At your end-of-day time (default 8:30 pm) a "Quick check"
       notification arrives.
- Only on a real phone: notification buttons while the app is fully closed (QA checklist #3) and the background task timing.

## Phase 6: reports, exports, backup, weekly digest

**Done (2026-09-30):** you tested every item below, including both re-test lists, and all passed.

Nothing to sign up for and no keys. **One new app build is needed**: Phase 6 adds three libraries with native code
(expo-print makes PDFs, expo-sharing opens the share sheet, expo-document-picker lets you choose a backup file). The
app you have now doesn't contain them and would show "Cannot find native module".

### Rebuild the app (once)
1. [x] Stop the running dev server (press Ctrl+C in its Terminal window).
2. [x] In Terminal: `cd ~/Downloads/emolens/apps/mobile && npx expo run:ios`. It takes 5-15 minutes and opens the new
       app in the Simulator. For your iPhone: plug it in, unlock it, and run `npx expo run:ios --device` instead.
3. [x] From then on, use `pnpm start` as before (press `r` to reload).

### Optional
- [x] The official FHIR validator (needs Java): follow `docs/FHIR_VALIDATION.md` and send me any "Error" lines.
- LOINC 93832-4 ("Sleep duration") was checked on 2026-09-30 in NLM's public LOINC service, so you don't need a loinc.org
  account (DECISIONS #80).

### Please test by hand (demo mode first: it has 120 days of data)
Tip: leave and reopen demo mode, or use **Regenerate demo data**, once after the rebuild so the demo includes its weekly
digests (demos built before Phase 6 have none until the next Sunday 6 pm).
1. [x] **PDF report:** More → Reports & export. Keep "30 days" and "Clinician", tap **Create PDF report**. The share sheet
       opens: choose "Save to Files", then open the PDF. Check: the cover (name, dates, disclaimer), the summary tiles,
       the calendar squares with numbers, the time-of-day bars, the hard moments table, patterns, worth watching,
       medications, sleep, what helped, forecast quality and "How to read this report". Tell me about anything cut off,
       overlapping or badly split between pages. Also tell me whether page numbers appear at the bottom (on iOS I expect
       they don't, DECISIONS #74).
2. [x] **School report:** choose "School". The "Includes" line no longer lists medications or sleep. Create the PDF: no
       medication name, no sleep, no "Shorter sleep" or "Missed dose" pattern, and no place names.
3. [x] **Family report:** choose "Family": the patterns table has only Factor / Status / Effect in plain words.
4. [x] **Notes:** add a note (Quick add → Note), then in the report builder tap it so it's selected, and create the PDF:
       it appears under "Caregiver notes". Unselected notes don't.
5. [x] **Custom dates and paper:** choose "Custom", pick two dates, create a PDF. (Your region is US, so the paper is
       Letter; with another region in iOS Settings it would be A4.)
6. [x] **ABC data:** tap **ABC data (spreadsheet)** → Save to Files → open it in Numbers (or email it to yourself and
       open it in Excel). One row per hard moment; the `antecedent_auto` column lists things like "Short sleep last
       night (2.1 h less than usual)"; accents look right in Spanish.
7. [x] **FHIR file:** tap **Health record file (FHIR)** → save it. It is a text file starting with `"resourceType": "Bundle"`.
       With the "Include “Sam (demo)”" switch off, the nickname is nowhere in it.
8. [x] **Weekly digests:** More → Weekly digests. A list of past weeks (newest first). Open one: a short summary in words
       ("Sam (demo) had 5 hard moments this week (2 more compared with last week)..."), the daily bars, the time-of-day
       bars, pattern changes, what helped. Tap **Share as PDF** and open it.
9. [x] **Digest notification:** on the Weekly digests screen, change the day to today and the time to a minute ago.
       Within a few seconds a notification "Sam (demo)'s weekly digest is ready." arrives (only if this week's digest
       didn't exist yet); tapping it opens the digest. Put the day and time back afterwards (Sunday, 6:00 PM).
10. [x] **Spanish:** More → Language → Español, then open a digest and create a PDF: both are in Spanish.
11. [x] **Export all data:** leave demo mode first (More → Leave demo mode). More → Privacy & security → **Export all
       data** → Save to Files. Read the warning: the file isn't encrypted.
12. [x] **Import it back:** same screen → **Choose a backup file** → pick that file. The card shows your child's name,
       the date and how many entries; tap **Import**. The message says "0 new, 0 updated" or close to it (weather and
       calendar entries that a sync replaced since the export can come back as "new"). Nothing appears twice.
13. [x] **Restore on a "new phone"** (only if you're happy to re-enter nothing: it uses the file from step 11):
       More → Privacy & security → Delete all data (type DELETE). On the welcome screen tap **Restore from a backup**,
       choose the file, tap **Import**. The app opens on Today with your child's data back.
14. [x] **Dark mode and the largest text size** on the report builder and a digest (nothing cut off).
- Only on a real phone: printing to an actual printer from the share sheet, and sharing by Mail / AirDrop.

### Re-test after the fix for bug #11 ("Couldn't create the file"), 2026-09-30
No rebuild: the fix is JavaScript only. In the Terminal running `pnpm start`, press `r` to reload the app.
1. [x] **Forecast first:** Today, then Insights → Forecast accuracy → **Refit now**. "Last updated" becomes "just now" and
       Today shows a percentage again (since the Phase 5 plurals change it may have said "Forecast temporarily unavailable").
2. [x] **PDF report:** More → Reports & export → Create PDF report, for Clinician, School and Family, with 30 days and with
       your custom range (Sep 29-30). The share sheet opens each time; save one to Files and open it.
3. [x] **ABC data (spreadsheet):** the share sheet opens; open the file in Numbers.
4. [x] **FHIR** still works.
5. [x] **Weekly digest:** More → Weekly digests → open one → Share as PDF.
6. [x] **Export all data** (leave demo mode first), then **Import a backup** with that file: "0 new, 0 updated" or close to it.
7. [x] **Regenerate demo data** (demo sheet): the build finishes. The rebuilt demo has weekly digests.
8. [x] **Diagnostics:** More → About & disclaimers → Diagnostics. The earlier failures are listed under `report` or `engine`
       with a TypeError (the old format, without a step). If anything still fails, the new line reads like `report.pdf · render: TypeError: ...` and the same text
       appears in red in the `pnpm start` Terminal: please copy it to me (tap "Copy" on the Diagnostics list).
9. [x] Then continue with the Phase 6 hand-test list above (items 1-14).

### Re-test after the Phase 6 hand-test fixes (BUGS.md #12-#18), 2026-09-30
No rebuild: press `r` in the `pnpm start` Terminal. In demo mode, More → Reports & export, 30 days:
1. [x] **File names:** create the Clinician, School and Family PDFs and "Save to Files" each one: all three are saved, as
       `EmoLens-Sam-demo-Clinician-…-to-….pdf`, `…-School-…` and `…-Family-…`. Then ABC data and FHIR twice with
       different ranges: both saved. Export all data twice a minute apart (real profile): both saved.
2. [x] **Clinician PDF:** "How precisely known" shows values like 39%, 25%, 5% (the same numbers as Insights).
3. [x] **Page breaks:** in every PDF no heading sits alone at the bottom of a page ("Time of day" stays with its chart).
       A short section may now start on the next page, leaving white space: that's expected.
4. [x] **Heatmap:** the date labels above the squares are readable and don't touch (they may label every other week).
5. [x] **Effects:** no "About 0% lower chance"; small effects read "About the same chance …" (also in Spanish).
6. [x] **Worth watching:** a calendar tag shows as "calendar events tagged Transitions" (Spanish: "marcados como
       Transiciones"), in the PDF and on Insights. (Only if the demo lists a schedule item; Regenerate may change that.)
7. [x] **School PDF:** no "Where" column, no medication, sleep, therapy or home/relatives' places anywhere.

### Quick check of the Phase 6 follow-ups (2026-09-30)
No rebuild: press `r` in the `pnpm start` Terminal.
1. [ ] **Import twice:** More → Privacy & security → Export all data, then Import a backup with that same file. The
       message says "Everything in this backup is already on this phone. Nothing was duplicated." (Spanish: "Todo lo de
       esta copia de seguridad ya está en este teléfono. No se duplicó nada.")
2. [ ] **Demo details:** More → Demo mode → Regenerate demo data. On the Timeline, hard moments now show a place and
       different lengths; tap one to see what happened before, what it looked like and (sometimes) a short note. Some
       still say "details to add". Insights and Model Health look the same as before (the model doesn't use these details).
3. [ ] **Report rows:** Clinician PDF, 30 days: in the hard-moments table the date ("Sep 28"), the time ("3:05 PM") and
       the duration each stay on one line.

## Phase 7: Care Team, cloud and clinician portal

**Keys and passwords never go in the chat.** You type them yourself, in the Terminal or in the files named below. The
Supabase **secret** key (it used to be called "service_role") is never needed by you or the app: it stays inside
Supabase, where the edge functions use it.

### A. Install three tools (needed before anything cloud can be tested; about 20 minutes)
1. [ ] **Docker Desktop** runs the local copy of Supabase on your Mac (it needs about 10 GB of disk).
   - In Terminal: `brew install --cask docker-desktop` (or download "Docker Desktop for Mac with Apple silicon" from
     docker.com).
   - Open **Docker** from Applications. Accept the terms; you can skip signing in. Wait until the whale icon in the
     menu bar says **Engine running**.
   - Check: `docker info` prints details (not "command not found").
2. [ ] **Supabase CLI:** `brew install supabase/tap/supabase`, then check with `supabase --version`.
3. [ ] **Deno** (checks and tests the edge functions): `brew install deno`, then check with `deno --version`.

**Status 2026-09-30:** installed. One thing to tidy: your `~/.docker/bin/docker` link points into the Docker installer
disk image (`/Volumes/Docker/...`), so the `docker` command stops working once that disk image is ejected.
1. [ ] Eject "Docker" in Finder (the installer), and make sure Docker is in Applications.
2. [ ] In Docker Desktop → Settings → Advanced, choose **System (requires password)** for the command-line tools, then
       **Apply & restart**.
3. [ ] Check that `docker info` works in a new Terminal window.

### B. Run the local Supabase (every time you test Care Team on the Mac)
1. [ ] `cd ~/Downloads/emolens && supabase start`. The first time downloads the images (a few minutes).
2. [ ] `supabase status` shows:
   - **API URL** (`http://127.0.0.1:54321`)
   - **Publishable key** (a fixed local development key)
   - **Mailpit** (`http://127.0.0.1:54324`): every sign-in email lands there instead of a real inbox, so any made-up
     address works (`owner@test.local`, `teacher@test.local` …).
3. [ ] Put the local values in `apps/mobile/.env` and `apps/portal/.env.local` (the `.env.example` files next to them
   show the names). These two local values aren't secret. Restart Metro with `pnpm start --clear`.
4. [ ] `supabase stop` when you're done. Your test data is kept; only `supabase stop --no-backup` deletes it.

### C. Test two phones syncing with two iOS Simulators
1. [ ] **Start the servers.** Run `supabase start`, then `cd apps/mobile && pnpm start --clear` (Metro). The app talks to
   `http://127.0.0.1:54321`, which the Simulators can reach because they share your Mac's network.
2. [ ] **Make a second Simulator.** In a second Terminal:
   - `xcrun simctl list devices available` lists the iPhones you can use.
   - Boot a different one than you normally use, e.g. `xcrun simctl boot "iPhone 17"`, then `open -a Simulator`.
3. [ ] **Install the app on it.** `cd ~/Downloads/emolens/apps/mobile && npx expo run:ios --device "iPhone 17"`. This builds
   again; to reuse the existing build instead, `xcrun simctl install "iPhone 17" <path to EmoLens.app from Xcode's
   DerivedData>`. No new native code was added in Phase 7, so the app you already have is fine on the first Simulator.
4. [ ] **Connect both to Metro through `localhost`.** Run this for each Simulator (its name, or `booted`):
   `xcrun simctl openurl "iPhone 17" "exp+emolens://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"`.
   Do this also if a Simulator shows the development menu, or if the app still says "isn't connected to a server" after
   a reload: the development app reopens the *last* Metro address it used, and a Wi-Fi address from another network
   (e.g. `http://192.168.1.57:8081`) no longer reaches your Mac, so it keeps running an old copy of the app
   (docs/BUGS.md #20). Each Simulator has its own storage and Keychain, so they behave like two separate phones.
5. [ ] **Simulator A (you, the owner).** Start onboarding and choose **Create an account** with `owner@test.local`.
   - Open http://127.0.0.1:54324 (Mailpit) and type the 6-digit code.
   - Finish onboarding.
   - **Team → Turn on Care Team → Invite → Caregiver**, and note the code.
6. [ ] **Simulator B (a second caregiver).** Onboarding: choose **Join a care team**, sign in as `helper@test.local`
   (code from Mailpit), then type the invite code. B opens on Today with the child's data.
7. [ ] **Watch them sync:**
   - Log a hard moment on A. It appears on B's Timeline within a few seconds (or after Team → **Sync now**).
   - Edit it on B, and A updates.
   - Set **Your name** in Team on both, and the activity feed shows who logged what.

### D. Deploy (only after the local tests pass: I'll ask you when)
1. [ ] **Supabase project.**
   - Go to https://supabase.com, **Start your project**, and sign up (GitHub is easiest).
   - **New project**: name it `emolens` and pick the region nearest you.
   - Choose a strong **database password** and save it in your password manager. Don't paste it in the chat.
   - Wait until the project is ready, then copy its **Project ref** (Project Settings → General; it looks like
     `abcdefghijklmnop`).
2. [ ] **Log in and link.** In the Claude Code prompt type `! supabase login` (a browser window opens; approve it). Then
   type `! supabase link --project-ref <your ref>` and enter the database password in the Terminal when asked.
3. [ ] I then run `supabase db push` (creates the tables and security rules) and `supabase functions deploy`. Both use
   your login, not a key.
4. [ ] **Auth settings** (Dashboard → Authentication). I can push these from `supabase/config.toml` with
   `supabase config push`; please check them after:
   - Email OTP length 6.
   - The **Magic Link** email template contains `{{ .Token }}` (the app types the code; the portal can use either).
   - **Site URL** = your portal address; **Redirect URLs** include `https://<portal>.vercel.app/auth/confirm`.
   - **Email sending limits:** Supabase's built-in email sender only allows a few emails an hour and may only deliver to
     your project's team members. For testing with your own addresses that's enough (add a second address under
     Organization → Team if needed). To invite other people for real you'd connect your own email service (Settings →
     Auth → SMTP, e.g. Resend, which needs a domain); that is optional for the competition.
5. [ ] **Vercel (the portal).**
   - Sign up at https://vercel.com with GitHub.
   - In the Claude Code prompt: `! pnpm dlx vercel login`.
   - I run `vercel link` in `apps/portal`. You then type the two values yourself:
     - `! pnpm dlx vercel env add NEXT_PUBLIC_SUPABASE_URL production` (paste the Project URL from Supabase → Project
       Settings → API Keys when it asks, in the Terminal)
     - `! pnpm dlx vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production` (the **publishable** key,
       `sb_publishable_…`)
   - I then run `vercel deploy --prod` and give the portal's address to Supabase (`supabase secrets set PORTAL_URL=…`;
     not a secret).
6. [ ] **The app with the real project:** in `apps/mobile/.env`, put the production URL, the publishable key and
   `EXPO_PUBLIC_PORTAL_URL`, then run `pnpm start --clear`.

### D2. Deployed (2026-10-01)
- Supabase project `liczaptwohlgvykauupr` (us-east-2):
  - migrations pushed and the 7 edge functions deployed (`share-view` public, the rest need sign-in);
  - `PORTAL_URL` set;
  - auth: site URL and redirect URLs set to the portal, 6-digit codes, no extra confirmation email.
- **Checked:** all 27 tables have RLS on, with policies, privileges, triggers and Realtime tables identical to the local
  database that passed the 61 RLS tests. All 27 tables refuse the anonymous key. The only extra is your project's own
  `rls_auto_enable` (the "automatic RLS" setting).
- **Portal: https://emolens-portal.vercel.app.** Security headers are on, signed-out visitors go to the login page, and
  share links reach the real functions.

### D3. Still to decide: a custom email sender (needed for the phone app on the real project)
Supabase's built-in email sender, on the free plan:
- can't change the sign-in email, so it sends a **link only** and the app can't get its 6-digit code;
- only delivers to people on your Supabase organization's team;
- allows only a few emails an hour.

The portal works with the link. For the app to sign in to the real project (and to invite people who aren't on your
Supabase team), connect your own email sender:
1. [ ] Make an account at an email service (e.g. https://resend.com, free tier). Adding a domain you own lets it email
   anyone; without a domain it can only email your own address.
2. [ ] In Supabase: Authentication → Emails → SMTP Settings, enter the host, port, user and the service's API key
   **yourself in the dashboard** (never in the chat).
3. [ ] Tell me, and I'll push the email template with the code (`supabase config push`).

Until then, test the app against the **local** Supabase (section C). The production `apps/mobile/.env` can wait.

### D4. Connect GitHub to Vercel (needed to redeploy the portal, 2026-10-08)
Now that the code is in your private GitHub repo, Vercel's free plan only deploys commits it can link to you. It
blocked two deploys because your Vercel login (`sharmabakshath-9087`) isn't linked to your GitHub account `asharma2511`.
**Done 2026-10-08:** you linked GitHub, and the portal was redeployed with the date fix.
1. [x] https://vercel.com/account/settings/authentication → **Login Connections** → connect **GitHub** and sign in as
   `asharma2511`. (If Vercel says that GitHub account belongs to another Vercel account, tell me instead.)
2. [x] Tell me, and I'll redeploy (`vercel deploy --prod`). Until then the live portal is the version from 2026-10-01,
   without the "Made on" date fix. The two blocked deployments in the Vercel dashboard can be ignored.

### E. Please test by hand (local first; then once more after deploying)
**Status 2026-10-08:** all tests below passed locally (you reported 1, 2, 3, 4 and 7 on 2026-10-06; portal, clinician,
account and Spanish in the session before). Since then: "Made on" and expiry dates use the child's home time zone
(BUGS #22), and a removed member's phone always deletes its copy (DECISIONS #118). Both re-tests passed on 2026-10-08
("Made on Oct 8" on a School share link and the PDF; removal deletes by itself, OK returns to Welcome).
1. [ ] **Two Simulators** (section C): a hard moment and an edit both sync; each phone's Team shows both members with
   their roles.
2. [ ] **Offline:** `supabase stop`, log a meal on A and a note on B, then `supabase start`. Tap **Sync now** on both:
   everything arrives once (no duplicates). Team shows "Offline: changes will sync later" while stopped.
3. [ ] **Heads-ups across phones:** in demo-free data this needs a High block. Optional: on A (the forecasting phone), a
   heads-up created there shows on B if B has "Get heads-ups on this phone" on (More → Device role). Answering "How did
   it go?" on one phone removes the question from the other after syncing.
4. [ ] **Teacher:** on B, More → Privacy & security → Delete all data. Then join again as a teacher with a new teacher code.
   - B has no Medications, Places, Data sources or Reports in More.
   - B's Today shows "Today at school" instead of a forecast, and its Timeline has no sleep, medications or home visits.
   - Logging a hard moment at school on B appears on A.
5. [ ] **Remove a member:** on A, Team → Remove the teacher. At its next sync (open the app or wait a few seconds) B
   deletes its copy by itself and shows "You're no longer on …'s care team. Their information has been removed from
   this phone." There is no "keep" button; **OK** returns B to Welcome (DECISIONS #118).
   - If B kept a private copy in an earlier run, clear it with More → Privacy & security → Delete all data.
6. [ ] **Portal (local):** `cd apps/portal && pnpm dev`, then open http://localhost:3000.
   - Sign in as `owner@test.local` (the link or the code from Mailpit). Children → the child → Overview, Hard moments
     (filter, CSV download), Medications, Strategies, Report (Print → Save as PDF).
7. [ ] **Clinician:**
   - On A: Team → Invite → Clinician. In the portal, sign in as `doctor@test.local`, then **Join a care team** with the
     code.
   - The clinician sees the child and can add a note under Notes, and the note appears for the owner in the portal.
   - Typing a clinician code in the app instead shows the portal's address.
8. [ ] **Share links:**
   - On A: Team → Share links → New link (School, 30 days) → Copy, and open it in a private browser window. A banner
     says "Read-only report shared by …", and the report has no medications or sleep.
   - **Turn off** the link, then reload: "This link is no longer available."
9. [ ] **Account:** More → Account shows your email and role.
   - Sign out on B (a team member) removes the family's data from B.
   - **Delete account** on a test owner removes everything (check the portal: the child is gone).
10. [ ] **Spanish:** switch the language on A. The Team, invite, share and account screens are all in Spanish.

## Phase 8: AI features (Ask EmoLens, voice notes, document import, AI digest, session-prep drafts)

**Your Anthropic API key never goes in the chat** — and never in a command typed with the `!` prefix, because that puts
the command and its output into the chat. You type it yourself into the files or the dashboard named below.

### A. Get an Anthropic API key (about 10 minutes; pay per use)
This key is separate from your Claude Code login.
1. [ ] Go to https://console.anthropic.com and sign in (or sign up) with your email.
2. [ ] **Settings → Billing**: add a small amount of credit (e.g. $5). EmoLens uses the model `claude-sonnet-5-5`
       ($2 per million input tokens, $10 per million output tokens); one Ask EmoLens question cost **about 1.2 cents**
       in the live check (2026-10-13).
3. [ ] **Settings → Limits**: set a monthly spend limit (e.g. $10) so a bug can never run up a big bill.
4. [ ] **Settings → API Keys → Create Key**, name it `emolens`. Copy it (it starts with `sk-ant-`). The console
       shows it only once; if you lose it, delete it and create a new one.

### B. Use the key on your Mac (local testing)
1. [ ] In Finder or a code editor, create the file `~/Downloads/emolens/supabase/functions/.env` with exactly one line:
       `ANTHROPIC_API_KEY=sk-ant-...your key...`
       (no quotes, no spaces). Git ignores this file, so it is never committed. I never open it.
2. [ ] Restart the local Supabase so it reads the file: `cd ~/Downloads/emolens && supabase stop && supabase start`.
3. [ ] Tell me "key added". I check it works by calling an AI function (which prints only "ok" or an error code,
       never the key).

### C. Use the key in production (only when I ask, after the local tests pass)
1. [ ] Open https://supabase.com/dashboard → project **liczaptwohlgvykauupr** → **Edge Functions** → **Secrets**.
2. [ ] **Add new secret**: Key `ANTHROPIC_API_KEY`, Value = your key → **Save**. (The model name and the daily limit
       aren't secret; I set those.)

### D. Rebuild the app once (new native code: on-device speech-to-text, text recognition, photo picker)
1. [ ] Stop Metro, then `cd ~/Downloads/emolens/apps/mobile && npx expo run:ios` (5-15 minutes). It opens the new app
       in the Simulator.
2. [ ] The Simulator uses your Mac's microphone: allow it if macOS asks.
3. [ ] For document import: drag a photo of a printed or handwritten page (e.g. a school note) from Finder onto the
       Simulator window; it lands in the Simulator's Photos.

### E. Please test by hand (local Supabase; after B and D)
Start: `supabase start`, then `cd apps/mobile && pnpm start --clear`, and open EmoLens in the Simulator. Sign in
(More → Account) with any made-up address; the code is in Mailpit (http://127.0.0.1:54324).
1. [ ] **Consent:** More → AI features. Read the "What may be sent" and "Never sent" lists. Nothing AI works yet
       (Today shows "Turn on AI features"). Tap **I understand, turn on AI features**: More shows "On".
2. [ ] **Ask EmoLens (demo):** More → Demo mode. In the demo, More → AI features → turn on (the demo has its own
       switch). Insights → Ask EmoLens (or the bar on Today) → tap the chip "What helped most this month?" Then type
       **How many hard moments last week?** and compare the number with Timeline (last Monday to Sunday).
       Tap **Based on N entries** and open one. Copy an answer. Ask a follow-up ("And the week before?"). Then **Clear
       conversation** (trash icon).
3. [ ] **Spanish:** switch the language to Spanish and ask "¿Qué ayudó más este mes?": the answer is in Spanish.
4. [ ] **Voice note (English):** Today → Voice. The first time: **Download** (78 MB, shows progress). Record about
       10 seconds, e.g. "Big meltdown after school, about 20 minutes. Headphones helped. He ate apple slices for a
       snack." → Stop → check the text → **Find entries** → untick one card → **Save selected**. Only the ticked ones
       appear in Timeline, plus the note.
5. [ ] **Voice note with AI off:** turn AI features off, record a similar note: the review says "Found on this phone
       with simple word rules".
6. [ ] **School note:** Today → School note → **Choose a photo** (the one you dragged in) → check the text → Find
       entries → review → Save selected. The photo isn't kept anywhere in EmoLens.
7. [ ] **Weekly digest:** with AI on, More → Weekly digests → open one: an AI summary appears with the line "Written
       by AI from this week's numbers". With AI off, the old template sentences.
8. [ ] **Portal session prep:** `cd apps/portal && pnpm dev`, sign in as the clinician from Phase 7 (or invite a new
       one) → the child → Notes → **Draft session prep** (dates prefilled) → a draft labelled "AI draft: review and
       edit before use." appears → edit → **Save and mark final**. Signed in as the parent, there is no Draft button.
9. [ ] **Daily limit:** tell me, and I'll set the local limit to 2 so you can see the message, then put it back.
10. [ ] **Offline:** turn the Mac's Wi-Fi off and ask a question: "You're offline…". Turn Wi-Fi back on.
Tell me what you see for each, especially any wrong number in 2.

## Phase 10: submission polish (2026-10-15)
Everything below is JavaScript only: restart Metro with `pnpm start --clear` and reload; **no rebuild is needed for
Phase 10**. (#31 from Phase 8 still needs the one rebuild listed there.)

### A. Still open from Phase 8
1. [ ] Confirm the app opens normally after the BUGS #25 fix (it did in the Simulator's Metro check; you confirm).
2. [ ] Re-test the six Phase 8 fixes (BUGS #26-#31): "Meltdown at 4 PM, headphones helped" gives a hard-moment card
       and a strategy card (#26); the digest note when the AI summary fails (#27); the limit message gives a real
       reset time (#28); no `**` in Ask answers (#29); the daily-limit notice is calm, without Try again (#30); with
       Wi-Fi off, Ask says it needs an internet connection (#31, **after one app rebuild**).
3. [ ] Deploy Phase 8 to production (I'll run the commands when you say go): the AI migration, the functions
       (`ai-ask`, `ai-structure`, `ai-digest`, `ai-session-prep`, and `share-create` with the Phase 10 School check),
       the `ANTHROPIC_API_KEY` secret (you add it: Phase 8 C above), and a portal redeploy. The phone app still can't
       sign in to production until D3 (custom email sender) is done.

### B. Please test by hand (local)
1. [ ] **Sound check, background:** + → Sound check; while it counts down, go to the Home screen for 10 s, come back.
       Expect "The sound check stopped because EmoLens went to the background. Nothing was saved." and **Measure
       again** works. No red console error in Metro. Also: start logging a hard moment (the 60-second check runs),
       close the sheet at once: no console error. Optional: leave the Mac asleep with the Simulator open mid-check.
2. [ ] **Sound check text:** while measuring it says "Listening… 25 seconds left" (not "sound.listening").
3. [ ] **School report, only school time:** log a hard moment at 11 PM yesterday (Timeline or + → Hard moment, change
       the time). More → Reports → School: the "Only school time" switch is on → PDF: the 11 PM one is not in the
       table, and the cover says "This report includes only hard moments during school hours…". Switch it off → PDF
       → it's there (still no places). Same with Team → Share links → New link → School (Care Team on).
4. [ ] **Report chart and summary agree:** Clinician PDF: the summary says "Hard moments were most likely in the
       … block" and it matches the tallest bar in "Time of day". With a hard moment at 11 PM in the range, a note
       under the chart says it's outside waking hours. Repeat in Spanish (More → Language).
5. [ ] **Today header:** the date, greeting and the outlook box are easy to read (light and dark mode).
6. [ ] **Invite preview:** Team → Invite: tap Caregiver, Teacher, Clinician; each shows "what they'll see and do" and
       "what they'll never see"; the button says "Create code for Teacher". Read the Teacher list carefully: is it
       what you want to promise families?
7. [ ] **VoiceOver** (Settings → Accessibility → VoiceOver, or Simulator: Accessibility Inspector): swipe through
       Today, Insights, Log a hard moment and Reports; every button says what it does; the charts read a summary.
8. [ ] **Largest text size** (Settings → Accessibility → Display & Text Size → Larger Text, max): Today, Insights,
       Reports and Invite wrap instead of cutting off text.
9. [ ] **Spanish walkthrough:** More → Language → Español; Today, Insights, Timeline, Team, Reports, a PDF. Note any
       wording that sounds unnatural (for the native-speaker review).
10. [ ] **Demo-video dry run:** follow `docs/DEMO_SCRIPT.md` once with a timer; tell me any screen that doesn't match.

### C. Before submitting
1. [ ] Review `AIDisclosure.md` and make sure it accurately describes all development and in-app AI use.
2. [ ] Fill in the [brackets] in `docs/CONSENT_TEMPLATE.md` and get it signed before testing with real family data.
3. [ ] Read `docs/PRIVACY_REVIEW.md` "Still open" and decide if any must be fixed before submitting (item 1, teacher
       profile fields, is the most visible).
4. [ ] Read the two papers in `docs/ARCHITECTURE_EXPLAINED.md` §10 and check the citations.
5. [ ] Run the QA checklist (`docs/QA_CHECKLIST.md`) on a real iPhone if you have time; it's still unticked.
6. [ ] Stop the old portal dev server (running since Oct 13 on port 3000) before running `pnpm test:cloud` locally:
       the portal e2e test needs its own server. CI runs it on every push anyway.

## Data sources: ready-to-go check (2026-10-22)
Every source that needs no account was checked live on 2026-10-22 and answered: Open-Meteo weather, air quality and
pollen, Open Food Facts (barcodes) and RxNorm (medication names). Apple Health, Calendar, Location and the sound check
only need the permissions the app asks for during onboarding (or More → Data sources). Only these steps need you:
1. [ ] **Rotate the Anthropic API key** (it was printed into an agent session transcript on 2026-10-22 by mistake). In
   the Anthropic console, create a new key and delete the old one. Put the new one in `supabase/functions/.env`
   (`ANTHROPIC_API_KEY=`), and in production with `supabase secrets set ANTHROPIC_API_KEY=...` when Phase 8 is deployed.
2. [ ] **USDA food search** (optional; barcodes work without it): get a free key at
   https://fdc.nal.usda.gov/api-key-signup and put it on `EXPO_PUBLIC_USDA_FDC_API_KEY=` in `apps/mobile/.env`.
   Without it, typing a food name saves it as you typed it.
3. [ ] (Optional) `EXPO_PUBLIC_CONTACT_EMAIL=` in `apps/mobile/.env`: Open Food Facts asks apps for a contact address.
4. [ ] **Rebuild the app once** (`npx expo run:ios`, or EAS for a phone). The unused Bluetooth permissions were
   removed (the room sensor is future work), and the Health and Calendar permission texts were reworded. Both are
   native settings that only change with a rebuild.
5. [ ] In the iOS Simulator: add a few Sleep, Heart Rate and Steps entries in the Health app and a few events in the
   Calendar app, so those sources have data (Phase 4 section above).
6. [ ] Cloud sources (Care Team sync, AI features) in production still need the Phase 8 deploy (say "go" to the agent)
   and the custom email sender (D3) for phone sign-in.

## Place search hand test (2026-10-22, JavaScript only: `pnpm start --clear`, no rebuild)
1. [ ] More → Places → Add. Type "Lincoln Elementary" (or your school's name): matches appear under the box as you
   type. Tap one: the name and kind fill in and "Map location" says it's set. Save.
2. [ ] Type a street address ("233 S Wacker"): addresses appear; tap one.
3. [ ] Turn Wi-Fi off (Mac) and type: "Search isn't available right now…" appears; Return tries the phone's own lookup.
4. [ ] Onboarding step 10 (or a test install): Home → search box works the same.
5. [ ] Spanish: the box, messages and credit line are in Spanish.

## Clinician portal demo for the presentation (LOCAL Supabase only, 2026-10-24)
A synthetic child "Sam (demo)" (simulator default scenario, 120 days, the app's own demo builder and sync code) for
showing the portal. The script refuses to run against anything but the local stack; production is never touched.
1. [ ] `supabase start` (Docker running), then `cd apps/portal && pnpm dev` (http://localhost:3000).
2. [ ] To (re)make the demo child: `pnpm --filter @emolens/mobile seed:portal-demo` (about 15 s). It replaces the earlier
   "Sam (demo)" of parent@emolens.test; your other local children (Max, Jonathan) are not touched. The demo ends today,
   so re-run it on the morning of the presentation.
3. [ ] Sign in at http://localhost:3000/login as clinician@emolens.test (the code arrives in Mailpit,
   http://127.0.0.1:54324) → Children → Sam (demo). Pages: Overview, Hard moments, Medications, Strategies, Notes,
   Report.

