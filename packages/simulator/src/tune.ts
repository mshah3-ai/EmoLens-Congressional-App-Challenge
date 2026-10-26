/**
 * Tuning search for SPEC 26.6 (Node only; docs/VALIDATION.md "Tuning log"). Runs the default scenario for every
 * candidate setting in a JSON file, on the same simulated families, and prints detection at days 90 and 120 (95%
 * intervals across families), the planted triggers found, the worst daily false likely/strong rate, and why planted
 * triggers were missed on day 90.
 *
 *   pnpm --filter @emolens/simulator exec tsx src/tune.ts --settings ../../docs/validation-data/tuning-2026-10-22/round1.json --families 50 --seeds 101,102 \
 *        [--days 120] [--out round1.out.json]
 *
 * Use seeds for searching that are NOT the confirmation seed. The confirmation run is the normal `sim` command.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { meanCI, type MeanCI } from './metrics';
import type { Scenario } from './scenario';
import { DIAG_DAY, type TuneResult, type TuneSetting, type TuneTask } from './tuneWorker';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LS = new Set(['likely', 'strong']);

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { out[argv[i].slice(2)] = argv[i + 1] ?? ''; i++; }
  return out;
}

async function runPool(tasks: TuneTask[], workers: number): Promise<Map<number, TuneResult>> {
  const pending = [...tasks];
  const out = new Map<number, TuneResult>();
  const pool = Array.from({ length: Math.min(workers, tasks.length) }, () =>
    new Worker(new URL('./tuneWorker.ts', import.meta.url), { execArgv: ['--import', 'tsx'] }));
  await Promise.all(pool.map((w) => new Promise<void>((resolve, reject) => {
    const next = () => { const t = pending.shift(); if (!t) { void w.terminate().then(() => resolve()); return; } w.postMessage(t); };
    w.on('message', (m: { taskId: number; result?: TuneResult; error?: string }) => {
      if (m.error) { reject(new Error(`task ${m.taskId}: ${m.error}`)); return; }
      out.set(m.taskId, m.result as TuneResult); next();
    });
    w.on('error', reject);
    next();
  })));
  return out;
}

export interface SettingReport {
  name: string; families: number; detection90: MeanCI; detection120: MeanCI;
  plantedFound90: Record<string, number>; plantedFound120: Record<string, number>; worstNullLikelyStrong: { value: number; day: number }; nullLikelyStrong90: number;
  nullPossible90: number; missed90: Record<string, Record<string, number>>; falseByFeature: Record<string, number>;
}

function report(setting: TuneSetting, rs: TuneResult[], days: number): SettingReport {
  const at = (d: number) => rs.map((r) => r.daily.find((x) => x.day === d)).filter((x): x is NonNullable<typeof x> => x != null);
  const mean = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.reduce((a, b) => a + b, 0) / v.length; };
  let worst = { value: 0, day: 0 };
  const falseByFeature: Record<string, number> = {};
  for (let d = 7; d <= days; d++) {
    const m = mean(at(d).map((x) => x.nullLikelyStrong));
    if (m > worst.value) worst = { value: m, day: d };
  }
  const planted = [...new Set(rs.flatMap((r) => r.diag.map((g) => g.key)))];
  const plantedFound90: Record<string, number> = {}, plantedFound120: Record<string, number> = {};
  const missed90: Record<string, Record<string, number>> = {};
  for (const k of planted) {
    const row = at(DIAG_DAY);
    plantedFound90[k] = row.filter((x) => LS.has(x.statuses[k])).length / row.length;
    const last = at(Math.min(120, days));
    plantedFound120[k] = last.filter((x) => LS.has(x.statuses[k])).length / last.length;
    // why missed: which rule blocked "likely" (counts of families)
    const why: Record<string, number> = {};
    for (const g of rs.flatMap((r) => r.diag.filter((x) => x.key === k && !LS.has(x.status)))) {
      const L = setting.status?.likely ?? {};
      const reason = g.status === 'not_enough_data' ? 'not enough data'
        : g.exposed < (L.exposed ?? 20) ? 'exposed < min' : g.exposedPos < (L.exposedPos ?? 5) ? 'exposed hard moments < min'
          : g.pHarm < (L.pHarm ?? 0.9) ? `P(raises) < ${L.pHarm ?? 0.9}` : g.or < (L.or ?? 1.3) ? 'OR < min' : `hysteresis/other (${g.status})`;
      why[reason] = (why[reason] ?? 0) + 1;
    }
    missed90[k] = why;
  }
  const nullKeys = Object.keys(rs[0].daily[0].statuses).filter((k) => !planted.includes(k));
  for (const r of rs) for (const d of r.daily) for (const k of nullKeys) if (LS.has(d.statuses[k])) falseByFeature[k] = (falseByFeature[k] ?? 0) + 1;
  const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
  const ci = (c: MeanCI) => ({ ...c, mean: c.mean == null ? null : r4(c.mean), lo: c.lo == null ? null : r4(c.lo), hi: c.hi == null ? null : r4(c.hi) });
  return {
    name: setting.name, families: rs.length,
    detection90: ci(meanCI(at(90).map((x) => x.detection))), detection120: ci(meanCI(at(Math.min(120, days)).map((x) => x.detection))),
    plantedFound90, plantedFound120, worstNullLikelyStrong: { value: r4(worst.value), day: worst.day },
    nullLikelyStrong90: r4(mean(at(90).map((x) => x.nullLikelyStrong))), nullPossible90: r4(mean(at(90).map((x) => x.nullPossible))),
    missed90, falseByFeature: Object.fromEntries(Object.entries(falseByFeature).sort((a, b) => b[1] - a[1]).slice(0, 6)),
  };
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2));
  const settings = JSON.parse(readFileSync(path.resolve(a.settings), 'utf8')) as TuneSetting[];
  const families = Number(a.families ?? 50), days = Number(a.days ?? 120);
  const seeds = (a.seeds ?? '101').split(',').map(Number);
  const workers = Number(a.workers ?? availableParallelism());
  const base = JSON.parse(readFileSync(path.join(pkgDir, 'scenarios', 'default.json'), 'utf8')) as Scenario;
  const tasks: TuneTask[] = [];
  settings.forEach((setting) => seeds.forEach((seed) => {
    for (let f = 0; f < families; f++) tasks.push({ taskId: tasks.length, scenario: { ...base, seed, families, days }, family: f, setting });
  }));
  const t0 = Date.now();
  console.log(`tuning: ${settings.length} settings x ${seeds.length} seeds x ${families} families x ${days} days, ${workers} workers`);
  const res = await runPool(tasks, workers);
  const reports = settings.map((s) => report(s, tasks.filter((t) => t.setting === s).map((t) => res.get(t.taskId) as TuneResult), days));
  for (const r of reports) {
    const f = (c: MeanCI) => `${c.mean?.toFixed(3)} (${c.lo?.toFixed(3)}-${c.hi?.toFixed(3)})`;
    console.log(`\n${r.name}: det90 ${f(r.detection90)}  det120 ${f(r.detection120)}  worst null L/S ${r.worstNullLikelyStrong.value.toFixed(4)} (day ${r.worstNullLikelyStrong.day})  null possible90 ${r.nullPossible90.toFixed(3)}`);
    console.log(`   found90 ${JSON.stringify(r.plantedFound90)}`);
    console.log(`   found120 ${JSON.stringify(r.plantedFound120)}`);
    console.log(`   missed90 ${JSON.stringify(r.missed90)}`);
    console.log(`   false L/S family-days ${JSON.stringify(r.falseByFeature)}`);
  }
  console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (a.out) writeFileSync(path.resolve(a.out), JSON.stringify({ families, days, seeds, settings, reports, seconds: (Date.now() - t0) / 1000 }, null, 1));
}

main().catch((err) => { console.error(err); process.exit(1); });
