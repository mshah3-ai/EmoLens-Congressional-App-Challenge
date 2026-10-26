/**
 * The recompute job (SPEC 12.6). Keeps the `blocks` and `block_features` tables up to date:
 *  1. creates a row for every awake 2-hour block from the first logged day through tomorrow (lazily, SPEC 12.1);
 *  2. for blocks marked dirty (a log near them changed), recomputes their "actual" features with the ENGINE's
 *     feature builder and clears `dirty` (oldest first, at most 3,000 per run);
 *  3. refreshes every started block's label with the ENGINE's label rules (cheap, so all of them each run);
 *  4. resolves "We're trying this" outcomes once their block is labeled (SPEC 10.2, engine rule).
 * The stored features become the engine's feature cache, so a normal run only computes features for new blocks.
 * If the feature definitions or the settings they depend on change, the tables are rebuilt from scratch.
 */
import { FEATURE_VERSION, type ChildDataset, type LabelStatus } from '@emolens/shared';
import {
  addDays, awakeBlocksBetween, blockContaining, buildIndex, buildLabelIndex, computeFeatures, firstDataDate, labelBlock,
  localDateOf, resolveProactiveOutcome, type FeatureResult,
} from '@emolens/engine';
import { all } from '../db/types';
import { iso, ms, nowIso } from '../db/time';
import { parseJson } from '../db/rows';
import type { Repo } from '../db/repo/writer';

/** Most blocks whose features are recomputed in one run (SPEC 12.6). */
export const RECOMPUTE_CAP = 3000;

/**
 * Everything feature VALUES depend on besides the logged data. When it changes, every stored feature is stale
 * (SPEC 12.6: "Settings changes affecting features ... mark everything dirty"; FEATURE_VERSION change -> all dirty).
 */
export function featureFingerprint(ds: ChildDataset): string {
  const c = ds.child;
  return JSON.stringify([FEATURE_VERSION, c.homeTz, c.wakeStart, c.wakeEnd, c.schoolDays, c.modeledEpisodeTypes, c.minModeledIntensity,
    c.typicalSleepHours, ds.settings.noiseThresholdDb]);
}

export interface RecomputeResult {
  cache: Map<number, FeatureResult>;
  /** Blocks whose features were recomputed in this run. */
  recomputed: number;
  labelsChanged: number;
  outcomesResolved: number;
  /** Label of every started block (block start ms -> label). */
  labels: Map<number, LabelStatus>;
}

export async function recompute(repo: Repo, ds: ChildDataset, now: number, fingerprintChanged: boolean): Promise<RecomputeResult> {
  const child = ds.child;
  const childId = child.id;
  const tz = child.homeTz;
  const tomorrow = addDays(localDateOf(now, tz), 1);
  const blocks = awakeBlocksBetween(firstDataDate(ds, now), tomorrow, child);

  const existing = new Map((await all<{ block_start: string; label_status: LabelStatus; dirty: number }>(repo.db,
    'SELECT block_start, label_status, dirty FROM blocks WHERE child_id = ?', [childId])).map((r) => [ms(r.block_start), r]));
  const haveFeatures = new Set((await all<{ block_start: string }>(repo.db,
    'SELECT block_start FROM block_features WHERE child_id = ? AND mode = ? AND feature_version = ?', [childId, 'actual', FEATURE_VERSION]))
    .map((r) => ms(r.block_start)));

  const idx = buildIndex(ds);
  const li = buildLabelIndex(ds);
  const labels = new Map<number, LabelStatus>();
  let recomputed = 0, labelsChanged = 0, outcomesResolved = 0;
  const computedAt = nowIso();

  await repo.write(async (w) => {
    if (fingerprintChanged) {
      await w.ex.execute('DELETE FROM block_features WHERE child_id = ?', [childId]);
      await w.ex.execute('DELETE FROM blocks WHERE child_id = ?', [childId]);
      existing.clear();
      haveFeatures.clear();
    }
    for (const b of blocks) {
      const row = existing.get(b.start);
      if (!row) {
        await w.ex.execute('INSERT OR IGNORE INTO blocks (child_id, block_start, block_end, local_date, block_index, dirty) VALUES (?, ?, ?, ?, ?, 1)',
          [childId, iso(b.start), iso(b.end), b.localDate, b.index]);
      }
      if (b.start >= now) continue; // features of a block use only data from before it starts; future blocks wait
      const label = labelBlock(li, b, 'emolens', now);
      labels.set(b.start, label);
      const dirty = !row || row.dirty === 1 || !haveFeatures.has(b.start);
      const clearDirty = dirty && recomputed < RECOMPUTE_CAP;
      if (clearDirty) {
        const fr = computeFeatures(idx, b, { mode: 'actual' });
        await w.ex.execute(
          `INSERT INTO block_features (child_id, block_start, feature_version, mode, values_json, estimated_json, computed_at) VALUES (?, ?, ?, 'actual', ?, ?, ?)
           ON CONFLICT(child_id, block_start, mode) DO UPDATE SET feature_version = excluded.feature_version, values_json = excluded.values_json,
           estimated_json = excluded.estimated_json, computed_at = excluded.computed_at`,
          [childId, iso(b.start), FEATURE_VERSION, JSON.stringify(fr.values), JSON.stringify(fr.estimated), computedAt]);
        recomputed++;
      }
      if (!row || row.label_status !== label || clearDirty) {
        if (!row || row.label_status !== label) labelsChanged++;
        await w.ex.execute(
          `UPDATE blocks SET label_status = ?, label_updated_at = CASE WHEN label_status = ? THEN label_updated_at ELSE ? END,
           dirty = CASE WHEN ? THEN 0 ELSE dirty END WHERE child_id = ? AND block_start = ?`,
          [label, label, computedAt, clearDirty ? 1 : 0, childId, iso(b.start)]);
      }
    }

    // SPEC 10.2: a proactive "We're trying this" is resolved once its block is labeled (engine rule). A use linked to an
    // alert ("We're on it", "What did you try?") belongs to the alert's block, even if it was started just before it.
    const episodeTimes = ds.episodes.map((e) => e.startedAt);
    const alertBlock = new Map(ds.alerts.map((a) => [a.id, a.blockStart]));
    for (const use of ds.strategyUses) {
      if (use.context !== 'proactive' || use.outcome !== 'pending') continue;
      const start = (use.alertId ? alertBlock.get(use.alertId) : undefined) ?? blockContaining(use.usedAt, child)?.start;
      const labeled = start != null && (labels.get(start) ?? 'unknown') !== 'unknown';
      const outcome = resolveProactiveOutcome(use, episodeTimes, labeled, now);
      if (outcome !== 'pending') {
        await w.update('strategy_uses', use.id, { outcome });
        use.outcome = outcome;
        outcomesResolved++;
      }
    }
  });

  const cache = new Map<number, FeatureResult>();
  for (const r of await all<{ block_start: string; values_json: string; estimated_json: string }>(repo.db,
    `SELECT f.block_start, f.values_json, f.estimated_json FROM block_features f JOIN blocks b ON b.child_id = f.child_id AND b.block_start = f.block_start
     WHERE f.child_id = ? AND f.mode = 'actual' AND f.feature_version = ? AND b.dirty = 0`, [childId, FEATURE_VERSION])) {
    // `params` only feed the reason texts of forecasts, which are always computed fresh (forecast mode).
    cache.set(ms(r.block_start), { values: parseJson(r.values_json, {}), estimated: parseJson(r.estimated_json, []), params: { sleepDeficitHours: 0, transitions: 0 } });
  }
  return { cache, recomputed, labelsChanged, outcomesResolved, labels };
}
