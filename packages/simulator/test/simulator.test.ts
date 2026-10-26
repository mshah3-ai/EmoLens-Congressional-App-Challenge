/** Simulator tests: determinism, purity (no Node APIs in demo-mode code), no peeking at the future, and a CLI smoke run (spec 30.4). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DAY_MS } from '@emolens/shared';
import { addDays, isoWeekday } from '@emolens/engine';
import {
  DEMO_NOTE_COUNT, demoEpisodeDetails, demoScenario, demoStrategyUses, emptyLog, generateWorld, observedView, prepareDemoWorld, simulateFamily, simulateSteps, withOverrides,
  type Scenario,
} from '../src/index';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, '..');
const base = JSON.parse(readFileSync(path.join(pkg, 'scenarios/default.json'), 'utf8')) as Scenario;
const small = withOverrides(base, { days: 30, families: 2 });

test('same seed and family -> identical world; another family -> a different one', () => {
  const a = generateWorld(small, 0), b = generateWorld(small, 0), c = generateWorld(small, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(a.data)), JSON.parse(JSON.stringify(b.data)));
  assert.deepEqual(a.blocks.map((x) => x.pTrue), b.blocks.map((x) => x.pTrue));
  assert.notDeepEqual(a.blocks.map((x) => x.pTrue), c.blocks.map((x) => x.pTrue));
});

test('simulation is deterministic', () => {
  const a = simulateFamily(small, 0), b = simulateFamily(small, 0);
  assert.deepEqual(a.daily, b.daily);
  assert.deepEqual(a.alerts, b.alerts);
});

test('the day-by-day stepper gives exactly the same run and also returns the caregiver log', () => {
  const steps = simulateSteps(generateWorld(small, 0));
  const seen: number[] = [];
  let r = steps.next();
  while (!r.done) { seen.push(r.value); r = steps.next(); }
  assert.deepEqual(seen, Array.from({ length: 30 }, (_, i) => i + 1));
  const whole = simulateFamily(small, 0);
  assert.deepEqual(r.value.daily, whole.daily);
  assert.deepEqual(r.value.alerts, whole.alerts);
  assert.ok(r.value.log.episodes.length > 0 && r.value.log.closures.length > 0);
});

test('simulateDays stops early: the world reaches further than the days lived through', () => {
  const steps = simulateSteps(generateWorld(small, 0), { simulateDays: 10 });
  let r = steps.next(), n = 0;
  while (!r.done) { n++; r = steps.next(); }
  assert.equal(n, 10);
  const last = Math.max(...r.value.log.episodes.map((e) => e.episode.startedAt));
  assert.ok(last < generateWorld(small, 0).blocks.find((b) => b.day === 10)!.block.start);
});

test('demo plan: starts on a Monday, lives through every day up to yesterday, world reaches tomorrow', () => {
  for (const today of ['2026-09-29', '2026-10-05', '2027-01-03']) {
    const { scenario, simulateDays } = demoScenario(base, today, 'America/Chicago');
    const start = scenario.startDate as string;
    assert.equal(isoWeekday(start), 1);
    assert.equal(addDays(start, simulateDays), today);
    assert.equal(addDays(start, scenario.days - 1), addDays(today, 1));
    assert.ok(simulateDays >= 120 && simulateDays <= 126);
    assert.deepEqual(scenario.parentSuspected, ['sleep_deficit', 'night_wakings', 'high_sugar_recent']);
  }
});

test('demo world stores sound as phone checks, and demo strategy uses are deterministic', () => {
  const plan = demoScenario(withOverrides(base, { days: 40 }), '2026-09-29', 'America/New_York');
  const sc = withOverrides(plan.scenario, { startDate: '2026-08-10', days: 32 });
  const w = prepareDemoWorld(generateWorld(sc, 0));
  assert.ok(w.data.sound.every((s) => s.source === 'phone' && s.tempC == null));
  const steps = simulateSteps(w, { simulateDays: 30 });
  let r = steps.next();
  while (!r.done) r = steps.next();
  const ids = Array.from({ length: 17 }, (_, i) => `s${i}`);
  const a = demoStrategyUses(w, r.value.log, r.value.alerts, ids), b = demoStrategyUses(w, r.value.log, r.value.alerts, ids);
  assert.deepEqual(a, b);
  assert.ok(a.some((u) => u.context === 'during'));
  assert.ok(a.every((u) => ids.includes(u.strategyId)));
  assert.ok(a.filter((u) => u.context === 'proactive').every((u) => u.outcome === 'pending' && u.alertId));
});

test('demo hard-moment details: deterministic, match what was going on, and change nothing else', () => {
  const plan = demoScenario(withOverrides(base, { days: 90 }), '2026-09-29', 'America/Chicago');
  const w = prepareDemoWorld(generateWorld(plan.scenario, 0));
  const run = () => { const st = simulateSteps(w, { simulateDays: plan.simulateDays }); let r = st.next(); while (!r.done) r = st.next(); return r.value; };
  const res = run();
  const episodes = res.log.episodes.map((x) => x.episode);
  const before = JSON.stringify({ log: res.log, alerts: res.alerts, world: w.data });
  const noDetails = new Set(episodes.filter((_, i) => i % 5 === 0).map((e) => e.id));
  const a = demoEpisodeDetails(w, episodes, noDetails);
  assert.deepEqual([...a], [...demoEpisodeDetails(w, episodes, noDetails)]);
  // the world and the simulation are untouched, and simulating again gives the same log
  assert.equal(JSON.stringify({ log: res.log, alerts: res.alerts, world: w.data }), before);
  assert.equal(JSON.stringify(run().log), JSON.stringify(res.log));

  const HOUR = 3_600_000;
  const typical = w.child.typicalSleepHours * 60;
  const tags = new Set<string>();
  let notes = 0;
  const durations = new Set<number>();
  for (const e of episodes) {
    const d = a.get(e.id)!;
    const visit = w.data.visits.find((v) => v.arrivedAt <= e.startedAt && (v.departedAt == null || e.startedAt < v.departedAt));
    assert.equal(d.placeId, visit?.placeId ?? null);
    if (e.id.endsWith('-fast') || noDetails.has(e.id)) {
      assert.deepEqual([d.antecedentTags, d.behaviorTags, d.durationMin, d.noteIndex, d.detailsComplete], [[], [], null, null, false]);
      continue;
    }
    assert.ok(d.detailsComplete && d.antecedentTags.length > 0 && d.behaviorTags.length > 0);
    for (const t of d.antecedentTags) tags.add(t);
    const lo = e.type === 'shutdown' ? 10 : 5, hi = e.type === 'shutdown' ? 60 : 45;
    assert.ok(d.durationMin! >= lo && d.durationMin! <= hi && d.durationMin! % 5 === 0);
    durations.add(d.durationMin!);
    if (d.noteIndex != null) { notes++; assert.ok(d.noteIndex >= 0 && d.noteIndex < DEMO_NOTE_COUNT); }
    const shutdownOnly = ['withdrawing', 'not_responding', 'hiding', 'repetitive_movements'];
    assert.ok(d.behaviorTags.every((b) => shutdownOnly.includes(b) === (e.type === 'shutdown')));
    if (d.antecedentTags.includes('tired')) {
      const night = w.data.sleep.filter((s) => s.sleepEnd <= e.startedAt && e.startedAt - s.sleepEnd < 20 * HOUR).at(-1)!;
      assert.ok(night.durationMin < typical - 60);
    }
    if (d.antecedentTags.includes('pain_or_sick')) assert.ok(w.data.illness.some((i) => i.startedAt <= e.startedAt && (i.endedAt == null || e.startedAt < i.endedAt)));
    if (d.antecedentTags.includes('transition')) {
      assert.ok(w.data.calendar.some((c) => !c.allDay && (c.tags.includes('transition') || c.tags.includes('appointment')) && Math.abs(c.startAt - e.startedAt) <= 0.5 * HOUR));
    }
    if (d.antecedentTags.includes('crowd')) assert.equal(d.placeId, 'store');
    if (d.antecedentTags.includes('demand_or_task') || d.antecedentTags.includes('waiting')) assert.equal(d.placeId, 'school');
  }
  // realistic variety: several different reasons and lengths, and a note now and then
  for (const t of ['transition', 'tired']) assert.ok(tags.has(t), t);
  assert.ok(tags.size >= 5, [...tags].join());
  assert.ok(durations.size >= 4);
  assert.ok(notes > 0 && notes < episodes.length / 3);
});

test('with no planted effects every block has the base rate', () => {
  const w = generateWorld(withOverrides(small, { trueEffects: {}, todEffects: {} }), 0);
  for (const b of w.blocks) assert.ok(Math.abs(b.pTrue - base.baseRatePerBlock) < 1e-12);
  assert.equal(w.blocks.length, 30 * 8); // wake 06:30-21:00 -> 8 awake blocks a day
});

test('planted effects raise the true chance exactly as the engine features say', () => {
  const w = generateWorld(small, 0);
  const high = w.blocks.filter((b) => b.pTrue > 2 * base.baseRatePerBlock).length;
  assert.ok(high > 0);
  for (const k of Object.keys(base.trueEffects)) {
    const f = w.effects[k] / base.trueEffects[k];
    assert.ok(f >= 0.7 && f <= 1.3, `${k} family multiplier ${f}`);
  }
});

test('observedView never shows the app anything from after `now`', () => {
  const w = generateWorld(small, 0);
  const now = w.blocks[8 * 10].block.start + 3_600_000; // day 11, an hour into the first awake block
  const ds = observedView(w, emptyLog(), now);
  assert.ok(ds.sleep.length > 0 && ds.sleep.every((s) => s.sleepEnd <= now));
  assert.ok(ds.meals.every((m) => m.eatenAt <= now));
  assert.ok(ds.doses.every((d) => (d.scheduledFor as number) <= now));
  assert.ok(ds.visits.every((v) => v.arrivedAt <= now && (v.departedAt == null || v.departedAt <= now)));
  assert.ok(ds.illness.every((i) => i.startedAt <= now && (i.endedAt == null || i.endedAt <= now)));
  assert.ok(ds.sound.every((s) => s.start + s.minutes * 60_000 <= now));
  assert.ok(ds.weather.every((x) => x.time <= now + 2 * DAY_MS && x.isForecast === x.time > now));
  assert.equal(ds.heart.length, 0); // physiology is off in the default scenario
});

test('when alerts are never answered, EmoLens and naive labeling give identical results (common random numbers)', () => {
  const quiet = withOverrides(small, { days: 45, behavior: { alertResponseRate: 0 } });
  const e = simulateFamily(quiet, 0), n = simulateFamily(withOverrides(quiet, { labelPolicy: 'naive' }), 0);
  assert.deepEqual(e.daily, n.daily);
});

test('demo-mode code imports no Node-only modules', () => {
  for (const f of ['scenario.ts', 'generate.ts', 'simulate.ts', 'metrics.ts', 'summary.ts', 'experiments.ts', 'csv.ts', 'demo.ts', 'index.ts']) {
    const src = readFileSync(path.join(pkg, 'src', f), 'utf8');
    assert.ok(!/from ['"]node:/.test(src) && !/from ['"](fs|path|os|worker_threads)['"]/.test(src), `${f} imports a Node module`);
  }
});

test('CLI smoke run (2 families x 30 days) writes every output file', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'emolens-sim-'));
  execFileSync(process.execPath, ['--import', 'tsx', 'src/run.ts', '--families', '2', '--days', '30', '--out', out, '--experiments', 'E1,E2', '--workers', '2'],
    { cwd: pkg, stdio: 'pipe' });
  for (const exp of ['E1', 'E2']) {
    assert.ok(existsSync(path.join(out, exp, 'summary.json')), `${exp}/summary.json`);
    const arms = readdirSync(path.join(out, exp), { withFileTypes: true }).filter((d) => d.isDirectory());
    assert.ok(arms.length >= 1);
    for (const arm of arms) for (const f of ['daily_metrics.csv', 'coefficients.csv', 'alerts.csv', 'calibration.csv', 'summary.json']) {
      assert.ok(existsSync(path.join(out, exp, arm.name, f)), `${exp}/${arm.name}/${f}`);
    }
  }
  const daily = readFileSync(path.join(out, 'E1', 'default', 'daily_metrics.csv'), 'utf8').trim().split('\n');
  assert.equal(daily.length, 1 + 2 * (30 - 6)); // header + 2 families x days 7..30
});

test('--seed replaces the scenario seed (2026-10-22 confirmation run)', () => {
  const out = mkdtempSync(path.join(tmpdir(), 'emolens-sim-'));
  execFileSync(process.execPath, ['--import', 'tsx', 'src/run.ts', '--families', '1', '--days', '10', '--out', out, '--experiments', 'E1', '--workers', '1', '--seed', '7'],
    { cwd: pkg, stdio: 'pipe' });
  const s = JSON.parse(readFileSync(path.join(out, 'E1', 'default', 'summary.json'), 'utf8')) as { scenario: Scenario };
  assert.equal(s.scenario.seed, 7);
});

test('the tuning tool restores the shipped settings between candidates', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'emolens-tune-'));
  const settings = path.join(dir, 'settings.json'), out = path.join(dir, 'out.json');
  // the same baseline before and after a very different setting, on one worker: the two baselines must agree
  writeFileSync(settings, JSON.stringify([{ name: 'a' }, { name: 'loose', status: { likely: { pHarm: 0.5, exposed: 0, exposedPos: 0 } }, tauGrid: [0.5] }, { name: 'b' }]));
  execFileSync(process.execPath, ['--import', 'tsx', 'src/tune.ts', '--settings', settings, '--families', '2', '--days', '40', '--seeds', '5', '--workers', '1', '--out', out],
    { cwd: pkg, stdio: 'pipe' });
  type R = { name: string; detection120: unknown; worstNullLikelyStrong: unknown; falseByFeature: unknown };
  const [a, loose, b] = (JSON.parse(readFileSync(out, 'utf8')) as { reports: R[] }).reports;
  assert.deepEqual({ ...b, name: 'a' }, a);
  assert.notDeepEqual(loose.falseByFeature, a.falseByFeature);
});
