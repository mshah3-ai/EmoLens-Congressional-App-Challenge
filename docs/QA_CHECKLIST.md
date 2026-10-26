# Manual device QA checklist

Items from SPEC 30.5. Each item is tested by hand on a real device before Phase 10 is marked done.
Record device, OS version, date and result.

| # | Check | iOS | Android | Notes |
|---|---|---|---|---|
| 1 | Notification actions: app in foreground | [ ] | [ ] | |
| 2 | Notification actions: app in background | [ ] | [ ] | |
| 3 | Notification actions: app killed | [ ] | [ ] | |
| 4 | Geofence enter/exit | [ ] | [ ] | |
| 5 | HealthKit sync (iOS) / Health Connect sync (Android) | [ ] | [ ] | |
| 6 | Calendar tagging | [ ] | [ ] | |
| 7 | BLE room sensor: pairing | n/a | n/a | Room sensor deferred (DECISIONS #138) |
| 8 | BLE room sensor: history sync | n/a | n/a | Room sensor deferred (DECISIONS #138) |
| 9 | BLE room sensor: reconnection | n/a | n/a | Room sensor deferred (DECISIONS #138) |
| 10 | Background task execution | [ ] | [ ] | |
| 11 | Offline logging, then later sync | [ ] | [ ] | |
| 12 | VoiceOver (iOS) / TalkBack (Android) walkthrough | [ ] | [ ] | |
| 13 | Largest font size | [ ] | [ ] | |
| 14 | Dark mode | [ ] | [ ] | |
| 15 | Spanish | [ ] | [ ] | |
| 16 | App lock | [ ] | [ ] | |
| 17 | Delete all data | [ ] | [ ] | |
| 18 | Weather: Home has a map location → Data sources shows Weather "Connected" | [ ] | [ ] | |
| 19 | Calendar: choose calendars → events tagged; re-tag one → kept after "Sync now" | [ ] | [ ] | |
| 20 | Sound check: 30 s reading saved; no audio file kept | [ ] | [ ] | |
| 21 | Barcode scan of a packaged food (real phone) | [ ] | [ ] | |
| 22 | Medication reminder arrives; Given / Skip update the dose | [ ] | [ ] | |
| 23 | Child device mode: status screen only; switch back works | [ ] | [ ] | |
| 24 | Heads-up 30 min before a High block; "How did it go?" 30 min after; each answer updates Today and Model Health | [ ] | [ ] | |
| 25 | End-of-day check in one tap; next-morning follow-up card | [ ] | [ ] | |
| 26 | Demo mode builds on the device (note the build time) and reopens instantly; Regenerate works | [ ] | [ ] | |
| 27 | PDF report for each audience (Clinician, School, Family) opens from the share sheet; School has no medications, sleep or place names | [ ] | [ ] | Note whether page numbers print (DECISIONS #74) |
| 28 | ABC CSV opens in Excel / Numbers with correct columns and accents | [ ] | [ ] | |
| 29 | FHIR file shares; no nickname unless switched on; official validator shows no errors (optional, docs/FHIR_VALIDATION.md) | [ ] | [ ] | |
| 30 | Weekly digest arrives after the digest time (notification opens it); Share as PDF works | [ ] | [ ] | |
| 31 | Export all data, then import the same file: nothing duplicated | [ ] | [ ] | |
| 32 | Restore from a backup on a fresh install brings the child back | [ ] | [ ] | |
| 33 | Care Team: two devices sync a new entry and an edit both ways (Realtime or Sync now) | [ ] | [ ] | docs/HUMAN_TODO.md Phase 7 C |
| 34 | Offline edits on two devices sync once, without duplicates, after reconnecting | [ ] | [ ] | |
| 35 | Teacher device: no medications / sleep / places; Today at school; logs sync to the parent | [ ] | [ ] | |
| 36 | Removed member's device is told and deletes its copy | [ ] | [ ] | |
| 37 | Portal: sign in by link and by code; child overview, hard moments + CSV, medications, report prints | [ ] | [ ] | |
| 38 | Clinician joins in the portal with a code; writes a note | [ ] | [ ] | |
| 39 | Share link: opens in a private window with the banner; School has no medications / sleep; revoke → "no longer available" | [ ] | [ ] | |
| 40 | Delete account removes the child from the cloud and the phone | [ ] | [ ] | |
| 41 | AI features: consent lists what is / isn't sent; nothing AI-related works until "I understand"; turning off works | [ ] | [ ] | Phase 8 |
| 42 | Ask EmoLens answers "How many hard moments last week?" with the same number as the Timeline; "Based on N entries" opens entries | [ ] | [ ] | |
| 43 | Voice note: first-time model download (size, progress), record, text on the phone, review, only ticked cards saved | [ ] | [ ] | iPhone only (DECISIONS #125) |
| 44 | Voice note with AI off uses the word rules; the recording is deleted unless "Keep audio" | [ ] | [ ] | |
| 45 | School note photo: text read on the phone, photo not kept, review | [ ] | [ ] | |
| 46 | Weekly digest shows the AI summary with its label; with AI off the template sentences | [ ] | [ ] | |
| 47 | Portal: clinician drafts session prep, edits, marks final; others don't see the button | [ ] | [ ] | |
| 48 | AI errors: offline, daily limit and "AI unavailable" each show a friendly message | [ ] | [ ] | |
| 49 | Performance (13.10): on a mid-range phone with a development build, About → Diagnostics shows the engine time of a full forecast run; fit < 300 ms (Mac: 12 ms per fit, 37 ms for the tau grid, `packages/engine/test/performance.test.ts`) | [ ] | [ ] | Phase 10 |
| 50 | Reduce Motion on: onboarding and toasts appear without sliding (DECISIONS #143) | [ ] | [ ] | Phase 10 |
| 51 | Delete all data with Location on: afterwards, arriving at a tagged place makes no visit (place alerts stopped) | [ ] | [ ] | Phase 10 |

