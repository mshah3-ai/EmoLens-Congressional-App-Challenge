# EmoLens privacy policy (draft)

> **Draft for the Congressional App Challenge prototype.** Written from SPEC Section 27 and checked against the app as
> built (Phase 10 privacy review, `docs/PRIVACY_REVIEW.md`). This is not legal advice. Before any public release it
> needs a lawyer's review (see `docs/HUMAN_TODO.md` "Legal review"): children's privacy (COPPA), school records
> (FERPA), health privacy (HIPAA, if a clinic deploys EmoLens), state consumer health-data laws, and app-store rules.

_Last updated: October 15, 2026 (draft)_

## 1. Who we are and who this app is for
EmoLens is a student project: a pattern tracker that helps families of autistic children notice what tends to come
before a hard moment. EmoLens accounts are for **adults (18+)**. A parent or guardian enters information about their
child. The app is **not directed to children** and asks for as little as possible about the child: a nickname, an
optional birth year, and no photos of the child or full name. EmoLens is not a medical device and does not diagnose,
treat or prevent any condition.

## 2. What we collect
Only what you choose to log or connect:

| Information | Where it is kept | Shared with your Care Team? | Can reach the AI provider (if you turn AI on)? |
|---|---|---|---|
| Hard moments, strategies, notes | Your phone (encrypted) | Yes | Yes, with the nickname replaced by "[CHILD]" |
| Medications and doses | Your phone | Yes, but never to teachers | Yes |
| Meals, sleep | Your phone | Yes (sleep never to teachers) | Yes |
| Heart rate, HRV, steps (Apple Health / Health Connect) | Your phone only | No | Only summaries |
| Place names and kinds, arrivals and departures | Your phone | Yes (names only, never to teachers) | Yes (names only) |
| Where your places are on a map | Your phone only | **Never** | **Never** |
| Calendar events | Your phone only | **Never** | Only if you switch on "share event titles" |
| Voice-note audio | Deleted after it is turned into text on your phone | Never | Never (only the text, after you review it) |
| School-note photos | Deleted right after the text is read on your phone | Never | Never (only the text, after you review it) |
| Sound checks, weather | Your phone only | Never | Only totals and averages |
| Patterns and forecasts | Your phone | A daily summary | Yes (summaries) |
| Your child's nickname | Your phone, and the cloud if Care Team is on | Yes | **Never** |
| Your email address | The cloud, only if you create an account | Team members see your display name | Never |

There is no room-sensor data: the optional room sensor is future work and was not built.

## 3. Where your data is stored
Everything you log is stored **on your phone** in an encrypted database. Nothing leaves the phone unless you create an
account and turn on **Care Team**, or turn on **AI features**.

With Care Team on, a copy of what your team needs is stored with our cloud provider, **Supabase** (database hosting),
so phones and the clinician portal can share it. Database rules (row-level security) decide what each person can read;
they are tested automatically (`docs/PRIVACY_REVIEW.md`).

To work, the phone also asks a few free public services for information. They receive only the search, never anything
about your child:
- **Open-Meteo** (weather, air quality, pollen): your home location **rounded to about 1 km** (2 decimal places);
- **Open Food Facts** and **USDA FoodData Central** (food lookup): the barcode or food name you search for;
- **RxNorm, U.S. National Library of Medicine** (medication names): the medication name you type;
- **Photon by komoot, with OpenStreetMap data** (place search when you add a place): the text you type in the search
  box and, once Home is set, your home location rounded to about 1 km, so nearby matches come first. The place you
  pick is saved only on your phone.

_(Before any public release: name the hosting region and list the providers' own policies.)_

## 4. What is shared, and with whom
- **Care Team members you invite, each only what their role allows.** Before you create an invite code, EmoLens shows
  what that role will and will never see.
  - **Caregivers** (another parent, a grandparent, a sitter) can log and see everything, but can't invite or remove
    people, make share links or delete your child's data.
  - **Teachers** can log hard moments, meals, notes and strategies at school, and see today's school-hours outlook
    (levels only, no reasons), strategies, hard moments logged at school and their own entries. They never see
    medications, sleep, health data, home or other places, patterns or reports.
  - **Clinicians** see what is synced, patterns and reports in the EmoLens portal, and can write their own notes. They
    can't change your logs.
- **You can remove anyone at any time.** Their access ends immediately, and their phone deletes its copy of your
  child's data at its next sync.
- **Share links you create:** a fixed, read-only copy of one report, readable by anyone with the link until it expires
  (7 or 30 days) or you turn it off. A **School** link (and School PDF) leaves out medications, sleep, health and
  places, and by default includes only hard moments during school hours or at school.
- **The AI provider (Anthropic), only if you turn on AI features** (More → AI features; you need an account). Requests
  go through EmoLens's server, so the app never holds an AI key. Sent: your questions and the log entries needed to
  answer them, medication names, food items, place names (never locations), patterns and forecasts, the text of voice
  notes and school notes you choose to turn into entries, and the week's statistics for the digest summary. Your
  child's nickname is always replaced by "[CHILD]" first. Never sent: locations, audio, photos, and calendar titles
  (unless you switch that on). Anthropic handles these requests under its own privacy policy. You can turn AI
  features off at any time; each person can make at most 60 AI requests a day.

## 5. What we never do
- No advertising, and no advertising or analytics companies' code in the app.
- No selling or renting of data, and no sharing beyond what is listed in section 4.
- No crash-reporting service. Errors are kept only on your phone (About → Diagnostics), with personal details removed.
- No recordings kept: sound checks measure loudness and throw the audio away at once.

## 6. How we protect your data
- The phone's database is encrypted (SQLCipher); its key is kept in the phone's secure storage (Keychain / Keystore).
  All network traffic uses encryption (TLS).
- Optional app lock with Face ID, Touch ID or the phone's passcode, which locks again after 5 minutes in the background.
- A privacy cover hides the app's content in the app switcher.
- Notifications never show medication names or place names.
- The server's functions never record what you send or receive. Invite codes and share-link tokens are stored only as
  scrambled fingerprints (hashes), so a database leak wouldn't reveal them.
- Automatic security checks of the code's libraries run on every change (`pnpm audit` in CI).

## 7. Your choices and deleting your data
- **Delete all data** (More → Privacy & security; type DELETE to confirm) erases everything on the phone: the database,
  recordings, keys, notifications and place alerts.
- **Delete account** (More → Account) erases everything you own in the cloud: your child's synced data, share links,
  invites and memberships. It then erases the phone's data.
- **If you're removed from a care team,** your phone deletes its copy of that family's data at its next sync. You
  can't keep a copy: it's the family's data.
- **Export:** you can save a backup file, a PDF report, an ABC data spreadsheet or a FHIR health record at any time.
- Every data source (Health, location, calendar, microphone) is optional and can be switched off in More → Data
  sources.

## 8. Changes to this policy
The date at the top shows the latest version. _(Not built yet: before any public release, the app must show a changed
policy and its date, and ask again before a new kind of data leaves the phone.)_

## 9. Contact
_Prototype: contact the student developer through the Congressional App Challenge submission. Before any public
release, add a real contact address here._
