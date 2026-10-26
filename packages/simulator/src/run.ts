/**
 * Command-line runner for the validation study (spec 26.5). Node only.
 *
 *   pnpm --filter @emolens/simulator sim --scenario default --families 200 --days 120 --out out \
 *        [--experiments E1,E2,E3,E4,E5,E6] [--workers 14] [--seed 20261022]
 *
 * Writes <out>/<experiment>/<arm>/{daily_metrics.csv, coefficients.csv, alerts.csv, calibration.csv, summary.json}
 * and <out>/<experiment>/summary.json (between-arm comparisons). Arms shared by several experiments
 * (e.g. the default scenario) are simulated once. Families run in parallel on worker threads.
 * `--seed` replaces the scenario files' seed (used for the 2026-10-22 confirmation run on a seed never used for tuning).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { alertsCsv, calibrationCsv, coefficientsCsv, dailyCsv } from './csv';
import { EXPERIMENT_IDS, buildExperiments, type Arm, type ExperimentId } from './experiments';
import type { Scenario } from './scenario';
import type { FamilyResult } from './simulate';
import { compareExperiment, summarizeArm, type ArmSummary } from './summary';
import type { WorkerTask } from './worker';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(here, '..');

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { out[argv[i].slice(2)] = argv[i + 1] ?? ''; i++; }
  }
  return out;
}

function loadScenario(name: string): Scenario {
  const file = name.endsWith('.json') ? path.resolve(name) : path.join(pkgDir, 'scenarios', `${name}.json`);
  return JSON.parse(readFileSync(file, 'utf8')) as Scenario;
}

async function runPool(tasks: WorkerTask[], workers: number, onDone: (t: WorkerTask, r: FamilyResult) => void): Promise<void> {
  const pending = [...tasks];
  const byId = new Map(tasks.map((t) => [t.taskId, t]));
  const pool = Array.from({ length: Math.min(workers, tasks.length) }, () =>
    new Worker(new URL('./worker.ts', import.meta.url), { execArgv: ['--import', 'tsx'] }));
  await Promise.all(pool.map((w) => new Promise<void>((resolve, reject) => {
    const next = () => {
      const t = pending.shift();
      if (!t) { void w.terminate().then(() => resolve()); return; }
      w.postMessage(t);
    };
    w.on('message', (msg: { taskId: number; result?: FamilyResult; error?: string }) => {
      if (msg.error) { reject(new Error(`task ${msg.taskId}: ${msg.error}`)); return; }
      onDone(byId.get(msg.taskId) as WorkerTask, msg.result as FamilyResult);
      next();
    });
    w.on('error', reject);
    next();
  })));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const families = Number(args.families ?? 200);
  const days = Number(args.days ?? 120);
  const outRoot = path.resolve(args.out ?? 'out');
  const workers = Number(args.workers ?? availableParallelism());
  const selected = (args.experiments ? args.experiments.split(',') : EXPERIMENT_IDS) as ExperimentId[];
  const seed = args.seed ? { seed: Number(args.seed) } : {};
  const base: Scenario = { ...loadScenario(args.scenario ?? 'default'), families, days, ...seed };
  const physiology: Scenario = { ...loadScenario(args.physiology ?? 'physiology'), families, days, ...seed };
  const experiments = buildExperiments(base, physiology).filter((e) => selected.includes(e.id));

  // unique scenarios across all arms
  const unique = new Map<string, Arm>();
  for (const e of experiments) for (const a of e.arms) { const k = JSON.stringify(a.scenario); if (!unique.has(k)) unique.set(k, a); }
  const keys = [...unique.keys()];
  const tasks: WorkerTask[] = [];
  keys.forEach((k, s) => { for (let f = 0; f < families; f++) tasks.push({ taskId: s * families + f, scenario: unique.get(k)!.scenario, family: f }); });

  console.log(`EmoLens simulator: ${experiments.map((e) => e.id).join(', ')} | ${keys.length} unique arms x ${families} families x ${days} days | ${workers} workers`);
  const t0 = Date.now();
  const results = new Map<string, FamilyResult[]>(keys.map((k) => [k, []]));
  const armTime = new Map<string, number>();
  let done = 0;
  await runPool(tasks, workers, (t, r) => {
    const k = JSON.stringify(t.scenario);
    results.get(k)!.push(r);
    done++;
    if (results.get(k)!.length === families) armTime.set(k, (Date.now() - t0) / 1000);
    if (done % Math.max(1, Math.floor(tasks.length / 20)) === 0 || done === tasks.length) {
      console.log(`  ${done}/${tasks.length} family runs (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
    }
  });
  for (const list of results.values()) list.sort((a, b) => a.family - b.family);

  for (const exp of experiments) {
    const dir = path.join(outRoot, exp.id);
    const byArm = new Map<string, FamilyResult[]>();
    const summaries = new Map<string, ArmSummary>();
    for (const arm of exp.arms) {
      const k = JSON.stringify(arm.scenario);
      const rs = results.get(k)!;
      byArm.set(arm.id, rs);
      const armDir = path.join(dir, arm.id);
      mkdirSync(armDir, { recursive: true });
      writeFileSync(path.join(armDir, 'daily_metrics.csv'), dailyCsv(rs));
      writeFileSync(path.join(armDir, 'coefficients.csv'), coefficientsCsv(rs));
      writeFileSync(path.join(armDir, 'alerts.csv'), alertsCsv(rs));
      writeFileSync(path.join(armDir, 'calibration.csv'), calibrationCsv(rs));
      const s = summarizeArm(exp.id, arm, rs, armTime.get(k) ?? 0);
      summaries.set(arm.id, s);
      writeFileSync(path.join(armDir, 'summary.json'), JSON.stringify(s, null, 1));
    }
    const comparison = compareExperiment(exp, byArm, summaries);
    writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({
      experiment: exp.id, question: exp.question, families, days, seed: base.seed,
      arms: exp.arms.map((a) => ({ id: a.id, label: a.label })), comparison,
    }, null, 1));
    console.log(`  wrote ${dir}`);
  }
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

main().catch((err) => { console.error(err); process.exit(1); });
