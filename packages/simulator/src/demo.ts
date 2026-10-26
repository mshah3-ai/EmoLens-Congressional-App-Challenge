/**
 * Demo mode helpers (spec 9.10). Pure TypeScript: the app imports this to build its demo profile.
 *
 * 1. `demoScenario` anchors the default scenario to the real calendar: the simulated family lives through every day up
 *    to YESTERDAY, and the generated world reaches into tomorrow (planned calendar, meals, weather forecast), so today's
 *    forecast in the app is a real forecast made by the real engine at the real time.
 * 2. `prepareDemoWorld` stores sound the way the phone app stores it today (phone sound checks without temperature;
 *    room sensors arrive in Phase 9), BEFORE simulating, so the simulation and the app see exactly the same data.
 * 3. `demoStrategyUses` adds calming-strategy uses, which the simulator does not model. They are made-up demo content
 *    (deterministic, clearly synthetic) so the Strategies screen has something to show.
 * 4. `demoEpisodeDetails` fills in what a parent types about each hard moment (where, what was going on, what it looked
 *    like, how long, a short note). The engine never reads these fields, and the numbers come from their own random
 *    streams, so the simulation, the model and docs/VALIDATION.md are unchanged.
 */
import { SUSPECTED_TRIGGERS, type Episode, type StrategyUse } from '@emolens/shared';
import { addDays, daysBetween, isoWeekday } from '@emolens/engine';
import { rngFor, uniformFor, type SimLog, type World } from './generate';
import type { AlertRow } from './simulate';
import { withOverrides, type Scenario } from './scenario';

/** The demo family (spec 9.10: "one synthetic family ... fixed seed"). */
export const DEMO_FAMILY = 0;
/** About this many days are lived through before today. */
export const DEMO_DAYS = 120;
/** Onboarding step 7 answers of the demo parent: "not enough sleep" (true) and "sugary foods" (a wrong belief). */
export const DEMO_SUSPECTED = ['sleep', 'sugar'];

export interface DemoPlan {
  scenario: Scenario;
  /** Days to live through: every day from the start date up to yesterday. */
  simulateDays: number;
}

/**
 * The default scenario anchored so the simulation ends yesterday. The start is moved back to a Monday (the generator
 * plans one appointment on a weekday of each week counted from the start), so 120-126 days are simulated.
 * `days` is smaller only in tests.
 */
export function demoScenario(base: Scenario, today: string, timeZone: string, days = DEMO_DAYS): DemoPlan {
  let start = addDays(today, -days);
  while (isoWeekday(start) !== 1) start = addDays(start, -1);
  const simulateDays = daysBetween(start, today);
  const parentSuspected = SUSPECTED_TRIGGERS.filter((t) => DEMO_SUSPECTED.includes(t.id)).flatMap((t) => t.keys);
  const scenario = withOverrides(base, { name: 'demo', families: 1, startDate: start, timeZone, days: simulateDays + 2, parentSuspected });
  return { scenario, simulateDays };
}

/** Sound as phone sound checks (no indoor temperature), exactly what the app's `sound_samples` table can hold. */
export function prepareDemoWorld(world: World): World {
  world.data.sound = world.data.sound.map((s) => ({ ...s, tempC: null, source: 'phone' as const }));
  return world;
}

/** Made-up chance that each default strategy (by index in DEFAULT_STRATEGIES) helps DURING a hard moment. */
const DURING_HELP: Record<number, number> = { 0: 0.82, 1: 0.74, 3: 0.62, 7: 0.7, 8: 0.45, 13: 0.5, 6: 0.35 };
/** Strategies the demo parent tries after a heads-up (proactive); their outcome is resolved by the app (spec 10.2). */
const PROACTIVE = [10, 9, 11, 6];

/**
 * Strategy uses for the demo: 1-2 "during" uses for most logged hard moments (Helped / Didn't help / Not sure), and a
 * proactive use for each alert the parent answered "We stepped in early" (outcome `pending`, then resolved by the same
 * rule the app uses for real families). `strategyIds[i]` is the database id of DEFAULT_STRATEGIES[i].
 */
export function demoStrategyUses(world: World, log: SimLog, alerts: AlertRow[], strategyIds: string[]): StrategyUse[] {
  const r = rngFor(world.scenario.seed, world.family, 'demo-strategies');
  const during = Object.keys(DURING_HELP).map(Number);
  const uses: StrategyUse[] = [];
  for (const { episode } of log.episodes) {
    if (episode.id.endsWith('-fast') || r() < 0.2) continue; // fast-path saves and some busy days have no details
    const n = r() < 0.4 ? 2 : 1;
    const chosen = new Set<number>();
    while (chosen.size < n) chosen.add(during[Math.floor(r() * during.length)]);
    for (const i of chosen) {
      const u = r();
      const outcome = u < 0.1 ? 'unsure' : u < 0.1 + 0.9 * DURING_HELP[i] ? 'helped' : 'not_helped';
      uses.push({ id: `demo-use-${uses.length}`, strategyId: strategyIds[i], context: 'during', outcome, usedAt: episode.startedAt + 5 * 60_000, episodeId: episode.id });
    }
  }
  const alertIds = new Map(log.alerts.map((a) => [a.alert.blockStart, a.alert.id]));
  for (const a of alerts) {
    if (a.status !== 'created' || !(a.intervened || a.response === 'stepped_in')) continue;
    const alertId = alertIds.get(a.blockStart);
    if (!alertId || (a.response !== 'stepped_in' && a.response !== 'happened')) continue; // unanswered: nothing was recorded
    const i = PROACTIVE[Math.floor(r() * PROACTIVE.length)];
    uses.push({ id: `demo-use-${uses.length}`, strategyId: strategyIds[i], context: 'proactive', outcome: 'pending', usedAt: a.fireAt + 10 * 60_000, alertId });
  }
  return uses.sort((a, b) => a.usedAt - b.usedAt);
}

/** What the demo parent "typed" about one hard moment. */
export interface DemoEpisodeDetails {
  /** Simulator place id ('home', 'school', ...) where the child was, or null when away from tagged places. */
  placeId: string | null;
  placeType: string | null;
  antecedentTags: string[];
  behaviorTags: string[];
  durationMin: number | null;
  /** Index into the app's list of short demo notes (DEMO_NOTE_COUNT of them, in apps/mobile/src/demo/build.ts), or null. */
  noteIndex: number | null;
  detailsComplete: boolean;
}

/** How many short demo notes the app has (English and Spanish, EPISODE_NOTES in apps/mobile/src/demo/build.ts). */
export const DEMO_NOTE_COUNT = 8;

const MELTDOWN_BEHAVIOR = ['crying', 'yelling', 'dropping_to_floor', 'throwing', 'covering_ears', 'running_or_bolting'];
const SHUTDOWN_BEHAVIOR = ['withdrawing', 'not_responding', 'hiding', 'repetitive_movements'];
const HOUR = 3_600_000;

/**
 * Details for each logged hard moment, matching what was really going on in the simulated world at that time:
 *  - place: where the child was (from the place visits);
 *  - "what happened before" tags: `transition` near a planned transition or appointment, `tired` after a short night,
 *    `pain_or_sick` during an illness, `hungry` after a long gap since food, `loud_noise` when a sound check was loud,
 *    `crowd` at the store, `new_place` soon after arriving at the store or a relative's, plus everyday ones
 *    (`waiting`, `demand_or_task` at school; `screen_ended`, `sibling_or_peer_conflict` at home) and sometimes `unknown`;
 *  - behavior tags that fit the type (a meltdown looks different from a shutdown);
 *  - a duration (meltdowns about 5-45 min, shutdowns about 10-60 min) and, about 15% of the time, a short note.
 * Fast-path saves and the busy-day episodes in `noDetails` keep blank details, like a real parent's log.
 * Every number is drawn from a stream keyed by the episode id and a purpose that no other code uses, so adding this
 * changes nothing else in the demo or the validation study.
 */
export function demoEpisodeDetails(world: World, episodes: Episode[], noDetails: ReadonlySet<string>): Map<string, DemoEpisodeDetails> {
  const { data, child, settings } = world;
  const u = (id: string, purpose: string) => uniformFor(world.scenario.seed, world.family, 'demo-details', id, purpose);
  const typicalMin = child.typicalSleepHours * 60;
  const out = new Map<string, DemoEpisodeDetails>();
  for (const e of episodes) {
    const t = e.startedAt;
    const visit = data.visits.find((v) => v.arrivedAt <= t && (v.departedAt == null || t < v.departedAt)) ?? null;
    const placeId = visit?.placeId ?? null;
    const placeType = visit ? visit.placeType : null;
    const fast = e.id.endsWith('-fast');
    if (fast || noDetails.has(e.id)) {
      out.set(e.id, { placeId, placeType, antecedentTags: [], behaviorTags: [], durationMin: null, noteIndex: null, detailsComplete: false });
      continue;
    }
    const tags: string[] = [];
    const add = (tag: string, chance: number) => { if (u(e.id, `tag:${tag}`) < chance && !tags.includes(tag)) tags.push(tag); };
    if (data.calendar.some((c) => !c.allDay && (c.tags.includes('transition') || c.tags.includes('appointment')) && Math.abs(c.startAt - t) <= 0.5 * HOUR)) add('transition', 0.85);
    const lastNight = data.sleep.filter((s) => s.sleepEnd <= t && t - s.sleepEnd < 20 * HOUR).at(-1);
    if (lastNight && lastNight.durationMin < typicalMin - 60) add('tired', 0.8);
    if (data.illness.some((i) => i.startedAt <= t && (i.endedAt == null || t < i.endedAt))) add('pain_or_sick', 0.75);
    const lastMeal = data.meals.filter((m) => m.eatenAt <= t).at(-1);
    if (lastMeal && t - lastMeal.eatenAt > 4 * HOUR) add('hungry', 0.7);
    if (data.sound.some((s) => s.db != null && s.db >= settings.noiseThresholdDb && s.start <= t && t - s.start < HOUR)) add('loud_noise', 0.7);
    if (placeId === 'store') add('crowd', 0.6);
    if ((placeId === 'store' || placeId === 'relative') && visit && t - visit.arrivedAt < HOUR) add('new_place', 0.6);
    if (placeId === 'school') { add('waiting', 0.25); add('demand_or_task', 0.35); }
    if (placeId === 'home') { add('screen_ended', 0.2); add('sibling_or_peer_conflict', 0.15); }
    if (!tags.length) tags.push(u(e.id, 'unknown') < 0.6 ? 'unknown' : 'change_in_plans');

    const pool = e.type === 'shutdown' ? SHUTDOWN_BEHAVIOR : MELTDOWN_BEHAVIOR;
    const nBehavior = 1 + Math.floor(u(e.id, 'behavior-n') * 3);
    const behavior: string[] = [];
    for (let k = 0; behavior.length < nBehavior && k < 10; k++) {
      const b = pool[Math.floor(u(e.id, `behavior:${k}`) * pool.length)];
      if (!behavior.includes(b)) behavior.push(b);
    }
    const [lo, hi] = e.type === 'shutdown' ? [10, 60] : [5, 45];
    // skewed toward shorter ones, rounded to 5 minutes like a parent's estimate
    const durationMin = Math.max(lo, Math.round((lo + (hi - lo) * u(e.id, 'duration') ** 1.6) / 5) * 5);
    const noteIndex = u(e.id, 'note') < 0.15 ? Math.floor(u(e.id, 'note-which') * DEMO_NOTE_COUNT) : null;
    out.set(e.id, { placeId, placeType, antecedentTags: tags, behaviorTags: behavior, durationMin, noteIndex, detailsComplete: true });
  }
  return out;
}
