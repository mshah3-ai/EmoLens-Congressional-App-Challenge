# CLAUDE.md: instructions for Claude Code in this repo

## What this is
EmoLens: a privacy-first pattern tracker for families of autistic children (Congressional App Challenge project).
**`docs/SPEC.md` is the single source of truth.** Read it fully before writing code. Follow its rules exactly
(Section 0 execution rules, Section 1 language rules, MUST/SHOULD/MAY).

## Hard rules
- Build in the phase order of SPEC Section 32. Do not start a phase until the previous phase's acceptance checks pass.
- Keep the project's actual AI use accurately described in the single central `AIDisclosure.md` file.
  Do not add boilerplate AI-authorship comments to individual files.
- TypeScript `strict: true`, no `any` except commented library boundaries.
- Engine logic lives ONLY in `packages/engine`. Never re-implement it in the app, portal or simulator.
- Never fabricate results. Simulator numbers in `docs/VALIDATION.md` must come from real runs.
- Anything needing a human (accounts, keys, devices, soldering) goes in `docs/HUMAN_TODO.md`; stop and tell the user.
- Any deviation from the spec (renamed library API, substitution) goes in `docs/DECISIONS.md`.
- Before using a third-party library, install it and read its current README (APIs change).
- After finishing each phase: run typecheck + lint + tests (and `bundle:check` if the app changed), update `docs/PROGRESS.md`, make a git commit, and
  STOP to give the student a short summary and what to test by hand.
- The student must be able to explain the code to judges: keep `docs/ARCHITECTURE_EXPLAINED.md` updated in plain English.

## Current status (see docs/PROGRESS.md for detail)
- Phase 0: DONE (except the LICENSE name, left as `<student name>` for the student to fill in).
- Phase 1: DONE. Engine math + 17 passing tests (packages/engine/test).
- Phase 2: DONE. 213 engine tests + 8 simulator tests pass; validation study in docs/VALIDATION.md (one target,
  day-45 skill share, is missed and explained there); TAU_GRID tuned to [0.75, 1.0, 1.5].
- Phase 3: DONE (code, tests, bundling). Mobile app in apps/mobile (Expo SDK 57); 27 mobile tests. Not yet run on a
  real phone (student follows docs/HUMAN_TODO.md "Phase 3"). Decisions #22-#38.
- Phase 4: DONE (weather, health, calendar, location/geofencing, sound check, food lookup, RxNorm, med reminders,
  background refresh, child device mode). Student's hand re-tests passed. Fitbit skipped (API shutting down,
  DECISIONS #40). Bugs #1-#10 in docs/BUGS.md fixed; 116 mobile tests. Decisions #40-#55.
- Phase 5: DONE (forecasting on the phone, alerts + confirmation loop, end-of-day check, Insights, trigger detail,
  strategies, Model Health, demo mode simulated on the phone: 11 s in the iOS Simulator). Student's hand test passed.
  Decisions #56-#70.
- Phase 6: DONE (PDF report with 3 audiences, ABC CSV, FHIR R4, export / import / restore, weekly digest). The student's
  hand test and re-tests passed (bugs #11-#18 fixed). Follow-ups: friendlier "nothing new" import message, realistic demo
  hard-moment details (model and VALIDATION unchanged), report dates/times don't wrap. Decisions #71-#88.
  Tests: engine 250, simulator 13, mobile 211.
- Phase 7: DONE (SPEC 32 acceptance met: RLS tests pass, two devices sync, portal shows a child, share link works
  and expires). Tested locally (`pnpm test:cloud`: RLS 61, integration 13, portal e2e 5) and DEPLOYED: Supabase
  project liczaptwohlgvykauupr (migrations, 7 functions, auth via `config push` with [remotes.production]); portal at
  https://emolens-portal.vercel.app (Vercel project emolens-portal, root apps/portal). Production RLS verified identical to
  local. Student's local hand tests passed (incl. portal, clinician, account, Spanish); bugs #20-#22 fixed; removal
  always deletes the copy (#118). Portal redeployed with the #22 fix (2026-10-08); re-tests of #22 and #118 passed.
  Open: custom SMTP (D3, DECISIONS #115). Phase 10 items: BUGS #23, #24. Vercel only deploys commits authored as the student (GitHub noreply email). Decisions #89-#119. Tests: engine 250, reports 5, simulator 13, portal 4, mobile 245.
  Docker CLI: /Applications/Docker.app/Contents/Resources/bin. Portal deploy: `pnpm dlx vercel deploy --prod` from the
  repo root.
- Phase 8: BUILT (2026-10-08). AI features: consent, Ask EmoLens (tools run on the phone), voice notes (whisper.rn,
  iPhone only), school-note photos, review screen, rule parser, AI digest summary, portal session prep. Model
  `claude-sonnet-5-5`. Automated acceptance passes (redaction property tests; tool loop on demo data). Live check against the
  real model PASSED (2026-10-13; key in supabase/functions/.env, never in chat; one question ≈ $0.012). Next: hand
  tests (HUMAN_TODO Phase 8 E), then deploy. Hand tests passed (2026-10-14); fixes BUGS #25-#31 (re-test pending). Decisions #120-#137. Tests: engine 250, shared 6, reports 5, simulator 13,
  portal 6, mobile 294, Deno 26, cloud 66 + 17. Still open: re-test #26-#31, deploy Phase 8 to production.
- Phase 9: DEFERRED (2026-10-15) to future work (room sensor; DECISIONS #138). Sound check covers room noise.
- Phase 10: BUILT (2026-10-15), submission polish (PROGRESS Session 28 has the honest Definition of Done table).
  Fixed BUGS #23, #24, #32-#34; privacy review (docs/PRIVACY_REVIEW.md), invite preview, policy and consent filled in;
  Spanish screen test; README, ARCHITECTURE_EXPLAINED §9-11, docs/DEMO_SCRIPT.md; AIDisclosure.md updated. Decisions
  #138-#143. Access log not built. Next: student hand tests (HUMAN_TODO "Phase 10"), Phase 8 re-tests and deploy.
  Tests: engine 252, shared 6, reports 7, simulator 13, portal 6, mobile 320, Deno 26, cloud 66 + 17.
- Validation tuning attempt (2026-10-22): best allowed setting confirmed 0.853 at day 90 on a new seed, short of
  the 0.86-0.87 goal; ADOPTED on 2026-10-24 at the student's request (likely: exposed 15, exposedPos 3, OR 1.25;
  DECISIONS #144). Study re-run: detection 0.841 @90, 0.894 @120, worst fake likely/strong 0.042. Simulator tests 15. Day-120 0.93 goal: not reachable within the 0.05 limit (#145).
- Polish (2026-10-22): no builder notes in app text, AI disclosure screen is a family note, Bluetooth permissions
  removed (#146; needs a rebuild). Place search with tappable suggestions via Photon (#147). Next DECISIONS #148,
  next BUGS #36.
- Paste-ready prompts for each phase: docs/PHASE_PROMPTS.md
- Backup: private GitHub repo https://github.com/asharma2511/emolens (remote `origin`, branch `main`). Push after commits.

## Commands
pnpm install
pnpm -r typecheck && pnpm -r lint && pnpm -r test
pnpm --filter @emolens/mobile bundle:check   # builds the real iOS + Android bundles (catches Node-only imports); in CI
pnpm --filter @emolens/engine test
pnpm --filter @emolens/mobile test
cd apps/mobile && pnpm start        # dev server for the installed development build
supabase start && pnpm test:cloud   # local Supabase + RLS, function, two-phone and portal tests
cd apps/portal && pnpm dev          # clinician portal at http://localhost:3000
pnpm --filter @emolens/mobile seed:portal-demo   # LOCAL Supabase only: synthetic "Sam (demo)" for the portal
