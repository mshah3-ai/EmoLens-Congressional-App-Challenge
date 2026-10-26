# Prompts to paste into Claude Code, one phase at a time

Start each phase in a fresh session (type `/clear` first). Paste the prompt, answer Claude's questions,
and test what it tells you to test before moving on. Claude reads `CLAUDE.md` automatically.

## Very first session (setup check)
> Read CLAUDE.md, docs/PROGRESS.md and all of docs/SPEC.md. Then run `pnpm install` and the engine tests and tell me
> whether everything passes. Also initialize a git repository and make a first commit. Don't write new features yet.

## Finish Phase 0 + Phase 2
> Finish Phase 0 (lint setup, docs skeletons listed in SPEC Section 4). Then do Phase 2 exactly as described in
> docs/PROGRESS.md "Next": write the feature, label, alert and insight-status tests, fix any bugs they find, build the
> simulator and run the validation study, generate the figures, and write docs/VALIDATION.md with the real numbers.
> Use plan mode first and show me the plan.

## Phase 3: mobile foundation
> Do Phase 3 from SPEC Section 32 (encrypted database, onboarding, all manual logging, Timeline, settings, English and
> Spanish, design system, demo-mode shell). For the look, use the SPEC Section 28 design system and make it feel like a
> polished, friendly award-winning student app. Tell me exactly how to run it on my phone when you are done.

## Phase 4: integrations
> Do Phase 4 from SPEC Section 32. Before each integration, tell me what account, key or permission I need to set up.

## Phase 5: in-app forecasting
> Do Phase 5 from SPEC Section 32, including demo mode populated from the simulator.

## Phase 6: reports and exports
> Do Phase 6 from SPEC Section 32.

## Phase 7: cloud, care team, portal
> Do Phase 7 from SPEC Section 32. Walk me through creating the Supabase project and Vercel deployment step by step.

## Phase 8: AI features
> Do Phase 8 from SPEC Section 32. Use the current Claude model names from the official docs.

## Phase 9: room sensor
> Do Phase 9 from SPEC Section 32. Give me a shopping list and a wiring checklist I can follow with the parts in hand.

## Phase 10: polish
> Do Phase 10 from SPEC Section 32, then go through the whole Definition of Done checklist and tell me honestly what is
> not finished.

## Any time
> Explain how [file or feature] works in simple words, as if I have to explain it to a judge.
