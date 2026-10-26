# Privacy review (Phase 10, 2026-10-15)

What each person can see and do, how it is enforced, and **which automated test proves it**. Where no test proves
something, the table says **NOT TESTED**. This review also lists what was fixed during it and what is still open.

## How access is enforced
- **On the phone:** everything is stored in an encrypted database. Nothing goes to the cloud unless the owner turns on
  Care Team; the sync code (`apps/mobile/src/sync/tables.ts`, `SYNC_SPECS`) lists exactly which tables and columns go.
  Columns marked `localOnly` (place coordinates and radius, notification ids, audio paths) never leave.
- **In the cloud (Supabase):** row-level security (RLS) on **every** table (`supabase/migrations/20260930000002_rls.sql`).
  The rule `is_member(child, roles)` is true only for an **active** member with one of the roles, so a removed person
  loses access at once. Signed-out visitors (`anon`) have no table rights at all. Nobody signed in can delete rows
  (only "soft delete" by setting `deleted_at`). Memberships, invites, share links and the AI counter can only be
  written by the server's functions, never directly by an app.
- **Share links:** the token is random and only its fingerprint (hash) is stored; the `share-view` function returns
  the fixed snapshot until the link expires or is revoked.

## Tests referred to below
| Key | File | What kind of test |
|---|---|---|
| DB#n | `supabase/tests/database/rls.test.sql` (66 checks, pgTAP) | Real Postgres with the real RLS rules; `n` is the check's number |
| INT | `supabase/tests/integration/functions.test.ts` | Real local Supabase and the real server functions |
| 2PH | `supabase/tests/integration/twoPhones.test.ts` | Two copies of the app's real sync code against real local Supabase |
| DENO | `supabase/functions/_tests/shared.test.ts`, `ai.test.ts` | Unit tests of the server functions' checks |
| E2E | `apps/portal/e2e/portal.spec.ts` | The clinician portal in a real browser, against local Supabase |
| SCH, AIP, AIT, REM, SYNC, REPO, SHR, P7 | `apps/mobile/test/` `schoolPrivacy`, `aiPrivacy`, `aiTools`, `removal`, `sync`, `repo`, `sharedReport`, `phase7Screens` | Phone app tests (SYNC uses a simplified fake cloud, so it proves the phone side only) |
| RED | `packages/shared/test/redact.test.ts` | Nickname redaction, including property tests |
| REP | `packages/reports/test/reports.test.ts` | Report rules |

Key pgTAP checks: DB#1 every table has RLS · DB#3-4 teacher reads nothing about medications, sleep, health, places,
alerts, snapshots, clinician notes or links · DB#5 teacher sees hard moments at school and their own, not the one at
home · DB#6-11 teacher's strategy uses, notes, meals, strategies, school forecast, child · DB#12-18 teacher writes only
as themselves · DB#19-26 clinician reads, can't edit family data, writes only own notes, can't read links · DB#27-35
caregiver · DB#36-44 owner and links, invite hashes never readable, AI counter · DB#45-48 outsider reads 0 rows and
can't write · DB#49-51 removed member · DB#52 signed-out visitor reads nothing.

## Who can see and do what
R = read, W = add and edit (soft delete is an edit), "own" = rows that person created.

| Data or action | Owner | Caregiver | Teacher | Clinician | Share-link viewer | Not a member, removed, signed out |
|---|---|---|---|---|---|---|
| Hard moments | R+W | R+W | R: at school or own; W: own | R | In the snapshot; School: only school time, no places | none |
| Strategy uses | R+W | R+W | R: own and those in visible school hard moments; W: own | R | Totals only | none |
| Strategies list | R+W | R+W | R | R | Names in the totals | none |
| Notes | R+W | R+W | R+W own only | R | Only notes the owner ticked | none |
| Meals | R+W | R+W | R+W own only | R | Not listed | none |
| Medications and doses | R+W | R+W | **none** | R | Clinician and Family links only | none |
| Sleep | R+W | R+W | **none** | R | Clinician and Family links only | none |
| Illness, routine changes, heads-ups, end-of-day checks | R+W | R+W | none | R | Summaries | none |
| Place names and kinds, visits | R+W | R+W | **none** | R | Clinician and Family links only | none |
| Place coordinates, calendar events, sound checks, weather, raw heart rate, model fits | phone only | never | never | never | never | never |
| Patterns and Model Health (daily snapshot) | R+W | R+W | **none** | R | In the snapshot (School: no sleep, medication, health or private-place patterns) | none |
| Today's school-hours outlook (levels, no reasons) | R+W | R+W | R | R | no | none |
| Clinician notes | R | R | none | R; W own only | no | none |
| Child profile | R; W | R | R (whole row, see gap 1) | R | Nickname | none |
| Team list | R | R | R (names, see gap 2) | R | no | removed: only their own removed row |
| Invite someone | yes | no | no | no | n/a | no |
| Remove someone | yes (not themselves) | no | no | no | n/a | no |
| Share links: make, turn off, list | yes | no | no | no | open with the link until it expires | only through a valid link |
| AI requests (Ask, notes, digest) | yes, after consent | yes | yes, from their own phone's data | portal session prep only | n/a | signed out: refused |
| Delete account | own children and everything about them | own memberships | same | same | n/a | refused |

## Proof for each row
| Row | Proved by |
|---|---|
| RLS everywhere; outsiders and signed-out visitors get nothing | DB#1, #45-48, #52; INT "a teacher gets no medications; a clinician can't add hard moments; an outsider sees nothing" |
| Hard moments | DB#5, #13-18, #20-22, #40; 2PH "a hard moment logged on B reaches A…" and "a teacher's phone gets no medications, sleep or home places; its school log reaches the owner"; E2E "a teacher: no medications, no snapshot, only school and own hard moments" |
| Strategy uses, strategies, notes, meals (teacher) | DB#6-9. Teacher **writes** to strategies, and teacher own-only writes to notes, meals and strategy uses: **NOT TESTED** (same rule as hard moments, DB#13-18) |
| Medications, doses | DB#3, #4, #12, #19, #23, #27, #30, #60; INT; 2PH teacher test; E2E clinician and teacher |
| Sleep, places, visits, illness, heads-ups | DB#4 (teacher none); 2PH (caregiver gets them, teacher doesn't). Clinician reading them: **NOT TESTED** (same rule as medications, DB#19) |
| Never leaves the phone | Coordinates: 2PH "a caregiver joins: … coordinates, notification ids and audio paths stay on A", SYNC, REPO "outbox … never place coordinates", AIT "place coordinates are never in any result". Weather location rounded to ~1 km: `integrations.test.ts`. Place search sends only the typed text and the same rounded area: `placeSearch.test.tsx` (2026-10-22). Calendar titles to AI only when switched on: AIT. Raw heart rate, sound, weather, model fits: **no test**, they simply have no cloud table and aren't in `SYNC_SPECS` |
| Snapshot, school outlook | DB#4, #10, #61-62; SYNC "the forecasting phone shares one insight snapshot a day and today's school-hours levels (no reasons)"; E2E teacher (`no-snapshot`). Caregiver/clinician writes: **NOT TESTED** |
| Clinician notes | DB#4, #24, #25; E2E "session prep … only the clinician sees 'Draft session prep'". Owner/caregiver reading them and editing own/others' notes: **NOT TESTED** |
| Team, invites, removal | DB#29, #33, #34, #39, #46, #49-51; INT "the owner invites; the code works once…", "only the owner can invite…", "guessing codes: 10 wrong tries in an hour…", "only the owner can remove; access ends at once…"; 2PH "removing the caregiver…"; REM and SYNC (the removed phone deletes its copy). A removed **clinician**: **NOT TESTED** |
| Invite preview matches the rules | P7 (preview for each role; Phase 10) |
| Share links | DB#26, #28, #35-38, #44; INT create/view/revoke, "an expired link, a made-up token and a malformed one all look the same"; E2E "share links: …"; DENO "share-create checks … School privacy" |
| School report and link | SCH (English and Spanish, 14/30/90 days; school-time only, BUGS #23); SHR "the portal refuses … a School one with private data"; INT "a School snapshot can't carry medications, sleep or places"; DENO (Phase 10: also no medication/place items in "worth watching" and no sleep/medication/health/private-place patterns); REP (the server's list matches the report's rules) |
| AI | AIP "no nickname in any AI request…, 20 random nicknames", "with AI off nothing is sent"; RED; DENO "the app cannot send its own system prompt or tools"; INT "signed-out callers are refused by every AI function", "over the daily limit (60 requests)…", "session prep is for the child's clinicians only"; DB#42-43, #63-66 |
| Delete account | INT "removes the children the person owns with every row about them, their memberships and the account". Share links, clinician notes, AI counter and profile being removed: **NOT TESTED** (removed by cascade) |

## What goes to the AI (only with AI features on)
The phone checks that AI is switched on and the person is signed in; the server holds the prompts, tools and key, never
logs request bodies, and allows 60 requests a day per person. **Only the child's nickname is replaced** with "[CHILD]"
(`packages/shared/src/redact.ts`). Sent: questions and the entries needed to answer them (including free-text notes),
medication names, food items, place **names**, patterns, forecasts with reasons, the text of voice and school notes
after review, the week's statistics; calendar titles only if switched on. Never sent: locations, audio, photos.

## Fixed during this review
1. **School reports and links showed late-night and weekend hard moments** (BUGS #23): now only school time by default.
2. **The server's School-link check was incomplete**: it checked medications, sleep and places on hard moments, but
   not "worth watching" or patterns, so a modified app could have published "Medication A" or "Grandma's" there. It
   now refuses those too (`supabase/functions/_shared/share.ts`; DENO and REP tests). Takes effect when the functions
   are deployed.
3. **Wording promised more than the app does:**
   - "never leaves this phone" for the home location, but a rounded location (~1 km) goes to the weather service;
   - "calendar events never leave", but titles can go to the AI when the parent switches that on;
   - a caregiver "can never delete the child's data", but caregivers can delete entries. Only the owner can delete the
     child's profile or the account.

   The texts now say exactly that, in English and Spanish.
4. **Invite preview:** before making a code, the owner sees what that role will and will never see, including that a
   teacher sees the team members' names and the notes on hard moments logged at school.
5. **Privacy policy and consent form** filled in (`PRIVACY_POLICY.md`, `CONSENT_TEMPLATE.md`).

## Still open (honest list)
1. **A teacher can read the whole child profile**, including usual sleep hours, wake times and birth year
   ("children: members read"). This is less than "sleep data" (no sleep logs), but the invite says teachers never see
   sleep. Fix: a teacher-only view of the profile with just the nickname and school days (new migration and an app
   change). Not done this week.
2. **A teacher can see the team list**, so they can tell whether a clinician is on the team. Now stated in the
   invite preview; not tested.
3. **Any signed-in account can use Ask EmoLens, note structuring and the AI digest** (60 a day), even without a child.
   That is a cost risk, not a data leak. Fix: require an active membership in those functions.
4. **Redaction covers only the nickname.** Surnames, siblings' names or school names typed into notes or place names
   reach the AI. The AI consent screen says notes are sent; parents should be told to use nicknames.
5. **A caregiver can write the daily snapshot and school outlook**, which changes what clinicians and teachers see
   (trusted role, by design; not tested).
6. **Entries someone logged for another family stay after they delete their own account** (they are the family's
   records). Not written in the privacy policy yet.
7. **"At school" is the place kind the phone set** on the hard moment; a teacher also sees parents' notes on those.
8. **Not tested:** realtime updates following RLS; sign-out wiping a non-owner's phone; the NOT TESTED cells above.
9. **Before any public release:** legal review (HIPAA, FERPA, COPPA, state health-data laws; `HUMAN_TODO.md`).
