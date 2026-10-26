# EmoLens

**Understand the patterns behind the hard moments.**

EmoLens is a privacy-first phone app for families of autistic children. Parents log a hard moment (a meltdown or
shutdown) in two taps. EmoLens connects those moments with context the family already has: sleep, meals,
medications, the day's schedule, places, weather and noise. It then shows which things tend to come before a hard
moment, how sure it is, and what today might look like, so the family can plan ahead and share clear notes with the
child's care team.

> EmoLens is built to support autistic children and the people who love them, not to change who they are.
> EmoLens is **not** a medical device and does not diagnose, treat, or prevent any condition.

Built for the Congressional App Challenge. Full product specification: [`docs/SPEC.md`](docs/SPEC.md).

## What it does
- **Two-tap logging** of hard moments, with optional details (what happened before, what helped), plus meals, sleep,
  medications, illness, routine changes, notes, voice notes and photos of school notes.
- **Automatic context** (all optional): Apple Health / Health Connect (sleep, heart rate, steps), arrivals at tagged
  places, calendar events, weather, air quality and pollen, and a 30–60 second **sound check** of the room.
- **Patterns** (Insights): "Short sleep: likely linked" with how sure EmoLens is and the evidence behind it. Families
  can mark triggers they suspect; EmoLens checks them against the data instead of just agreeing.
- **Today's outlook**: the chance of a hard moment in each 2-hour block, with reasons and a range, and an optional
  heads-up before a high-risk block. After a heads-up the parent says what happened, which keeps the model honest.
- **Model Health**: how well the forecasts have actually done, compared with a simple guess.
- **Reports**: a PDF for a clinician, a school or the family; an ABC data spreadsheet; a FHIR health record. School
  reports leave out medications, sleep, health and places, and by default include only school-time hard moments.
- **Care Team** (optional account): invite a caregiver, teacher or clinician; each sees only what their role allows.
  Clinicians use a website portal. Read-only **share links** expire after 7 or 30 days.
- **AI features** (optional, off by default): "Ask EmoLens" questions answered from the family's own data, turning a
  voice note or school note into log entries (the parent reviews every one), and a written weekly summary.
- **English and Spanish**, light and dark mode, screen-reader labels, large-text support.
- **Demo mode**: about 120 simulated days for a made-up child, so every screen can be shown without real data.

## How the forecasting works (in one paragraph)
The day is split into 2-hour blocks. For each block EmoLens measures "features" from what was known *before* it
started (for example, "slept over an hour less than usual" or "a planned transition today"). A **Bayesian logistic
regression** model, fitted separately for each child on the phone, learns how much each feature changes the chance of
a hard moment. It starts from cautious guesses and **shrinks** weak evidence toward "no link", so it doesn't invent
patterns. A simulator generated 3,200 made-up families with known, planted triggers to test the exact same code: by
day 90 it found **84%** of the planted triggers (**89%** by day 120) while calling a non-trigger "likely" on at most
**4.2%** of days. The settings were tuned on separate practice families and confirmed on new ones. One
target (forecast skill in 80% of families by day 45) was missed: it reached **64.5%**, and the study explains why no
forecaster could reach 80% on that measure. Details: [`docs/VALIDATION.md`](docs/VALIDATION.md).

## Privacy
- Everything is stored **on the phone** in an encrypted database. Nothing leaves it unless the family turns on Care
  Team or AI features.
- Exact place locations, calendar events, sound checks, weather and raw heart-rate readings are never shared with the
  team. The weather service gets only a location rounded to about 1 km.
- Cloud access is enforced by database row-level security and tested automatically for every role.
- The AI never sees the child's nickname (it is replaced by "[CHILD]"), locations, audio or photos.
- No ads, no analytics, no tracking. Full details: [`docs/PRIVACY_POLICY.md`](docs/PRIVACY_POLICY.md) and
  [`docs/PRIVACY_REVIEW.md`](docs/PRIVACY_REVIEW.md).

## AI use and disclosure
AI was used to help troubleshoot and debug the project. The optional
Ask EmoLens chatbot and related AI features use Anthropic's Claude API, when enabled by the family.
See [`AIDisclosure.md`](AIDisclosure.md) for the complete disclosure.

## Tech stack
- **Phone app:** React Native with Expo (TypeScript), encrypted SQLite (op-sqlite with SQLCipher), i18next.
- **Engine:** plain TypeScript (`packages/engine`), shared by the app, the portal and the simulator.
- **Cloud (optional):** Supabase (Postgres with row-level security, Edge Functions in Deno).
- **Clinician portal:** Next.js on Vercel (`apps/portal`).
- **Tests:** Node's test runner, Jest, pgTAP, Deno and Playwright; CI on GitHub Actions.

## Repository map
| Folder | What it is |
|---|---|
| `apps/mobile` | The phone app |
| `apps/portal` | The clinician website |
| `packages/engine` | The statistics: features, model, forecasts, patterns |
| `packages/shared` | Shared types, constants and all app text (English and Spanish) |
| `packages/reports` | The report used by the phone's PDF, the portal and share links |
| `packages/simulator` | Made-up families for the validation study |
| `supabase` | Cloud database rules, server functions and their tests |
| `docs` | Spec, plain-English architecture guide, validation, privacy, decisions, bug log |

## Quick start (developers)
```bash
pnpm install
pnpm -r typecheck && pnpm -r lint && pnpm -r test
pnpm --filter @emolens/mobile bundle:check   # builds the real iOS and Android bundles
```
To run the phone app, follow `docs/HUMAN_TODO.md` → "Phase 3: run EmoLens on your phone". Cloud tests:
`supabase start && pnpm test:cloud`. Portal: `cd apps/portal && pnpm dev`. Full build, run and deploy instructions:
`docs/SPEC.md` Section 31.

## Documentation
- [`docs/ARCHITECTURE_EXPLAINED.md`](docs/ARCHITECTURE_EXPLAINED.md): how every part works, in plain English.
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md): the demo-video script.
- [`docs/VALIDATION.md`](docs/VALIDATION.md): the simulator study and its real results.
- [`docs/DECISIONS.md`](docs/DECISIONS.md): every change from the spec, and why.
- [`docs/BUGS.md`](docs/BUGS.md): bugs found by hand-testing, each with the test that guards it.
- [`docs/PROGRESS.md`](docs/PROGRESS.md): build log, phase by phase.

## Future work
- **Room sensor** (SPEC Section 25): an optional Bluetooth board measuring noise, light and temperature. Deferred
  (`docs/DECISIONS.md` #138); the phone's sound check already measures room noise, and nothing depends on the sensor.
- **Voice notes on Android** (on-device speech-to-text is iPhone-only for now, DECISIONS #125).
- **Teacher view of the child profile** with only the fields a school needs (`docs/PRIVACY_REVIEW.md`, open item 1).
- **Access log** showing the family who opened a report or share link, and when.
- **A study with real families**, after legal and ethics review: the validation so far uses simulated families only.
