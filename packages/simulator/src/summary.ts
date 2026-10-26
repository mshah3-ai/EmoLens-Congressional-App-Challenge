/**
 * Turns per-family results into the numbers reported in docs/VALIDATION.md: per-day means with 95%
 * intervals across families, acceptance-target checks (spec 26.6), coefficient recovery, alert
 * metrics, and the between-arm comparisons of each experiment. Pure TypeScript.
 */
import { auroc } from '@emolens/engine';
import { COEF_DAYS, FIRST_METRIC_DAY, type FamilyResult } from './simulate';
import { bootstrapMeanCI, meanCI, type MeanCI } from './metrics';
import type { Arm, Experiment } from './experiments';

export const MILESTONE_DAYS = [14, 30, 45, 60, 90, 113, 120];
const DAILY_FIELDS = ['detection', 'nullPossible', 'nullLikelyStrong', 'auroc7', 'skill7', 'expectedSkill7', 'oracleSkill7', 'meanPlantedBeta',
  'meanPlantedBetaRatio', 'learning', 'tau', 'labeledDays', 'alerts7'] as const;
type DailyField = typeof DAILY_FIELDS[number];

export interface DaySummary {
  day: number;
  stats: Record<DailyField, MeanCI>;
  /** Share of families whose 7-day skill score is > 0 (and the same with expected Brier). */
  skillPositiveShare: number | null;
  expectedSkillPositiveShare: number | null;
  /** Same share for the oracle forecaster (knows the true chance), on the same outcomes. */
  oracleSkillPositiveShare: number | null;
  /** AUROC with all families' predictions for the next 7 days pooled. */
  pooledAuroc7: number | null;
}

export interface ArmSummary {
  experiment: string; arm: string; label: string; families: number; days: number;
  scenario: Arm['scenario'];
  runtimeSec: number; engineMsPerFamilyDay: number;
  trueEpisodesPerWeek: MeanCI; loggedShare: number;
  byDay: DaySummary[];
  milestones: Record<string, DaySummary>;
  acceptance: {
    detectionDay90: MeanCI;
    maxNullLikelyStrong: { value: number | null; day: number | null };
    maxNullPossible: { value: number | null; day: number | null };
    skillPositiveShareDay45: number | null;
    expectedSkillPositiveShareDay45: number | null;
    oracleSkillPositiveShareDay45: number | null;
  };
  coefficients: { key: string; day: number; planted: boolean; n: number; meanTrue: number; meanBeta: number | null; bias: number | null; rmse: number | null }[];
  statusShares: Record<string, Record<number, Record<string, number>>>;
  alerts: {
    perWeek: MeanCI; created: number; suppressed: Record<string, number>;
    reportedHitRate: number | null; trueHitRate: number | null; steppedInShare: number | null; answeredShare: number | null;
  };
  calibration: { bin: number; binLo: number; binHi: number; n: number; meanP: number | null; meanPTrue: number | null; rate: number | null; rateLo: number | null; rateHi: number | null }[];
}

const r4 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
const roundCI = (c: MeanCI): MeanCI => ({ mean: r4(c.mean), lo: r4(c.lo), hi: r4(c.hi), n: c.n });

export function summarizeArm(experiment: string, arm: Arm, results: FamilyResult[], runtimeSec: number): ArmSummary {
  const days = arm.scenario.days;
  const byDay: DaySummary[] = [];
  for (let day = FIRST_METRIC_DAY; day <= days; day++) {
    const rows = results.map((r) => r.daily.find((d) => d.day === day)).filter((d): d is NonNullable<typeof d> => d != null);
    const stats = Object.fromEntries(DAILY_FIELDS.map((f) => [f, roundCI(meanCI(rows.map((r) => r[f] as number | null)))])) as Record<DailyField, MeanCI>;
    const sk = rows.map((r) => r.skill7).filter((v): v is number => v != null);
    const esk = rows.map((r) => r.expectedSkill7).filter((v): v is number => v != null);
    const osk = rows.map((r) => r.oracleRealizedSkill7).filter((v): v is number => v != null);
    const pooled = results.flatMap((r) => r.preds.filter((p) => !p.intervened && p.blockDay > day - 1 && p.blockDay <= day - 1 + 7));
    byDay.push({
      day, stats,
      skillPositiveShare: sk.length ? r4(sk.filter((v) => v > 0).length / sk.length) : null,
      expectedSkillPositiveShare: esk.length ? r4(esk.filter((v) => v > 0).length / esk.length) : null,
      oracleSkillPositiveShare: osk.length ? r4(osk.filter((v) => v > 0).length / osk.length) : null,
      pooledAuroc7: r4(auroc(pooled.map((p) => p.p), pooled.map((p) => p.y))),
    });
  }
  const dayOf = (d: number) => byDay.find((x) => x.day === d);
  const maxOf = (f: DailyField) => {
    let value: number | null = null, day: number | null = null;
    for (const d of byDay) { const m = d.stats[f].mean; if (m != null && (value == null || m > value)) { value = m; day = d.day; } }
    return { value, day };
  };

  // coefficient recovery
  const coefficients: ArmSummary['coefficients'] = [];
  const keys = [...new Set(results.flatMap((r) => r.coefs.map((c) => c.key)))];
  for (const day of COEF_DAYS) for (const key of keys) {
    const cs = results.flatMap((r) => r.coefs.filter((c) => c.day === day && c.key === key && c.enabled && c.beta != null));
    if (!cs.length) continue;
    const err = cs.map((c) => (c.beta as number) - c.trueBeta);
    coefficients.push({
      key, day, planted: cs[0].planted === 1, n: cs.length, meanTrue: r4(cs.reduce((a, c) => a + c.trueBeta, 0) / cs.length) as number,
      meanBeta: r4(cs.reduce((a, c) => a + (c.beta as number), 0) / cs.length),
      bias: r4(err.reduce((a, b) => a + b, 0) / err.length), rmse: r4(Math.sqrt(err.reduce((a, b) => a + b * b, 0) / err.length)),
    });
  }

  // status shares of planted and parent-suspected features at milestone days
  const statusShares: ArmSummary['statusShares'] = {};
  const tracked = [...new Set([...Object.keys(arm.scenario.trueEffects), ...arm.scenario.parentSuspected])];
  for (const key of tracked) {
    statusShares[key] = {};
    for (const day of MILESTONE_DAYS) {
      const st = results.map((r) => r.daily.find((d) => d.day === day)?.statuses[key]).filter((s): s is NonNullable<typeof s> => s != null);
      if (!st.length) continue;
      const counts: Record<string, number> = {};
      for (const s of st) counts[s] = (counts[s] ?? 0) + 1;
      statusShares[key][day] = Object.fromEntries(Object.entries(counts).map(([s, c]) => [s, r4(c / st.length) as number]));
    }
  }

  // alerts
  const all = results.flatMap((r) => r.alerts);
  const created = all.filter((a) => a.status === 'created');
  const suppressed: Record<string, number> = {};
  for (const a of all) if (a.status === 'suppressed') suppressed[a.reason] = (suppressed[a.reason] ?? 0) + 1;
  const happened = created.filter((a) => a.response === 'happened').length, calm = created.filter((a) => a.response === 'calm').length;
  const answered = created.filter((a) => a.response !== '').length;
  const weeks = days / 7;

  // calibration pooled over families (predictions for day >= 30), with a binomial 95% interval on the observed rate
  const calibration: ArmSummary['calibration'] = [];
  for (const bin of [...new Set(results.flatMap((r) => r.calibration.map((c) => c.bin)))].sort((a, b) => a - b)) {
    const cs = results.flatMap((r) => r.calibration.filter((c) => c.bin === bin && c.n > 0));
    const n = cs.reduce((a, c) => a + c.n, 0);
    const w = (f: 'meanP' | 'meanPTrue' | 'rate') => (n ? cs.reduce((a, c) => a + (c[f] as number) * c.n, 0) / n : null);
    const rate = w('rate');
    const h = rate != null && n > 0 ? 1.96 * Math.sqrt((rate * (1 - rate)) / n) : null;
    const any = results[0].calibration.find((c) => c.bin === bin);
    calibration.push({ bin, binLo: any?.binLo ?? 0, binHi: any?.binHi ?? 1, n, meanP: r4(w('meanP')), meanPTrue: r4(w('meanPTrue')), rate: r4(rate),
      rateLo: r4(rate != null && h != null ? Math.max(0, rate - h) : null), rateHi: r4(rate != null && h != null ? Math.min(1, rate + h) : null) });
  }

  const totalEp = results.reduce((a, r) => a + r.episodes, 0);
  return {
    experiment, arm: arm.id, label: arm.label, families: results.length, days, scenario: arm.scenario,
    runtimeSec: Math.round(runtimeSec), engineMsPerFamilyDay: r4(results.reduce((a, r) => a + r.engineMs, 0) / (results.length * days)) as number,
    trueEpisodesPerWeek: roundCI(meanCI(results.map((r) => r.episodes / weeks))),
    loggedShare: r4(results.reduce((a, r) => a + r.loggedEpisodes, 0) / Math.max(1, totalEp)) as number,
    byDay,
    milestones: Object.fromEntries(MILESTONE_DAYS.filter((d) => dayOf(d)).map((d) => [String(d), dayOf(d) as DaySummary])),
    acceptance: {
      detectionDay90: dayOf(90)?.stats.detection ?? { mean: null, lo: null, hi: null, n: 0 },
      maxNullLikelyStrong: maxOf('nullLikelyStrong'),
      maxNullPossible: maxOf('nullPossible'),
      skillPositiveShareDay45: dayOf(45)?.skillPositiveShare ?? null,
      expectedSkillPositiveShareDay45: dayOf(45)?.expectedSkillPositiveShare ?? null,
      oracleSkillPositiveShareDay45: dayOf(45)?.oracleSkillPositiveShare ?? null,
    },
    coefficients, statusShares,
    alerts: {
      perWeek: roundCI(meanCI(results.map((r) => r.alerts.filter((a) => a.status === 'created').length / weeks))),
      created: created.length, suppressed,
      reportedHitRate: r4(happened + calm ? happened / (happened + calm) : null),
      trueHitRate: r4(created.length ? created.filter((a) => a.episode === 1).length / created.length : null),
      steppedInShare: r4(answered ? created.filter((a) => a.response === 'stepped_in').length / answered : null),
      answeredShare: r4(created.length ? answered / created.length : null),
    },
    calibration,
  };
}

/** Per-family value of a daily field on a given day (null if missing). */
function familyValue(results: FamilyResult[], family: number, day: number, f: 'meanPlantedBeta' | 'auroc7' | 'detection' | 'skill7' | 'expectedSkill7'): number | null {
  const r = results.find((x) => x.family === family);
  const v = r?.daily.find((d) => d.day === day)?.[f];
  return v == null ? null : v;
}

/** Paired difference a - b across families with a seeded bootstrap 95% interval. */
export function pairedDiff(a: FamilyResult[], b: FamilyResult[], day: number, f: 'meanPlantedBeta' | 'auroc7' | 'detection' | 'skill7' | 'expectedSkill7', seed: number): MeanCI {
  const diffs: number[] = [];
  for (const r of a) {
    const x = familyValue(a, r.family, day, f), y = familyValue(b, r.family, day, f);
    if (x != null && y != null) diffs.push(x - y);
  }
  return roundCI(bootstrapMeanCI(diffs, seed));
}

/** Between-arm comparisons reported for each experiment. */
export function compareExperiment(exp: Experiment, results: Map<string, FamilyResult[]>, summaries: Map<string, ArmSummary>): Record<string, unknown> {
  const days = exp.arms[0].scenario.days;
  const lastDay = days;
  const evalDays = [30, 60, 90, lastDay].filter((d, i, a) => d <= days && a.indexOf(d) === i);
  const get = (id: string) => results.get(id) ?? [];
  if (exp.id === 'E2') {
    const out: Record<string, unknown> = {};
    for (const ip of [0.3, 0.5, 0.8]) {
      const e = get(`emolens_ip${ip}`), n = get(`naive_ip${ip}`);
      if (!e.length || !n.length) continue;
      out[`ip${ip}`] = {
        meanPlantedBetaDiff_emolens_minus_naive: Object.fromEntries(evalDays.map((d) => [d, pairedDiff(e, n, d, 'meanPlantedBeta', 1000 + d)])),
        auroc7Diff_emolens_minus_naive: Object.fromEntries(evalDays.filter((d) => d <= days - 7).map((d) => [d, pairedDiff(e, n, d, 'auroc7', 2000 + d)])),
        detectionDiff_emolens_minus_naive: Object.fromEntries(evalDays.map((d) => [d, pairedDiff(e, n, d, 'detection', 3000 + d)])),
      };
    }
    return out;
  }
  // generic: key metrics of every arm side by side
  const table = exp.arms.map((a) => {
    const s = summaries.get(a.id);
    const at = (d: number) => s?.byDay.find((x) => x.day === d);
    return {
      arm: a.id, label: a.label,
      detection: Object.fromEntries(evalDays.map((d) => [d, at(d)?.stats.detection.mean ?? null])),
      nullPossible: Object.fromEntries(evalDays.map((d) => [d, at(d)?.stats.nullPossible.mean ?? null])),
      nullLikelyStrong: Object.fromEntries(evalDays.map((d) => [d, at(d)?.stats.nullLikelyStrong.mean ?? null])),
      maxNullLikelyStrong: s?.acceptance.maxNullLikelyStrong ?? null,
      pooledAuroc7: Object.fromEntries(evalDays.filter((d) => d <= days - 7).map((d) => [d, at(d)?.pooledAuroc7 ?? null])),
      skill7: Object.fromEntries(evalDays.filter((d) => d <= days - 7).map((d) => [d, at(d)?.stats.skill7.mean ?? null])),
      expectedSkill7: Object.fromEntries(evalDays.filter((d) => d <= days - 7).map((d) => [d, at(d)?.stats.expectedSkill7.mean ?? null])),
    };
  });
  const out: Record<string, unknown> = { arms: table };
  if (exp.id === 'E6' && get('with_physiology').length && get('without_physiology').length) {
    out.pairedExpectedSkillDiff_with_minus_without = Object.fromEntries(evalDays.filter((d) => d <= days - 7)
      .map((d) => [d, pairedDiff(get('with_physiology'), get('without_physiology'), d, 'expectedSkill7', 4000 + d)]));
    out.pairedAurocDiff_with_minus_without = Object.fromEntries(evalDays.filter((d) => d <= days - 7)
      .map((d) => [d, pairedDiff(get('with_physiology'), get('without_physiology'), d, 'auroc7', 5000 + d)]));
  }
  return out;
}
