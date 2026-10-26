/** Hard moments (SPEC 10.1). */
import { blockContaining } from '@emolens/engine';
import type { ChildProfile, EpisodeType } from '@emolens/shared';
import { all, one, type Executor } from '../types';
import type { EpisodeRow, StrategyUseRow } from '../rows';
import { iso, ms, nowIso } from '../time';
import { around, type Repo, type Writer } from './writer';

export type DuringOutcome = 'helped' | 'not_helped' | 'unsure';

export interface EpisodeInput {
  type: EpisodeType;
  startedAt: string;
  durationMin: number | null;
  intensity: number | null;
  placeId: string | null;
  placeType: string | null;
  antecedentTags: string[];
  antecedentNote: string | null;
  behaviorTags: string[];
  safetyConcern: boolean;
  notes: string | null;
  detailsComplete: boolean;
  source: 'manual' | 'voice' | 'alert_confirm' | 'end_of_day' | 'document' | 'import';
  /** "What helped": strategy id -> outcome. Saved as strategy_uses with context 'during'. */
  strategies: { strategyId: string; outcome: DuringOutcome }[];
}

const columns = (childId: string, e: EpisodeInput) => ({
  child_id: childId,
  started_at: e.startedAt,
  duration_min: e.durationMin,
  type: e.type,
  intensity: e.intensity,
  place_id: e.placeId,
  place_type: e.placeType,
  antecedent_tags: JSON.stringify(e.antecedentTags),
  antecedent_note: e.antecedentNote,
  behavior_tags: JSON.stringify(e.behaviorTags),
  safety_concern: e.safetyConcern ? 1 : 0,
  notes: e.notes,
  details_complete: e.detailsComplete ? 1 : 0,
  source: e.source,
});

/**
 * SPEC 10.1: if an alert exists for the block containing the episode and nobody answered it yet,
 * answer it "happened" automatically (still editable). Alerts are created from Phase 5 on.
 */
async function autoAnswerAlert(w: Writer, child: ChildProfile, startedAt: string): Promise<void> {
  const block = blockContaining(ms(startedAt), child);
  if (!block) return;
  const alerts = await all<{ id: string }>(w.ex,
    `SELECT a.id FROM alerts a WHERE a.child_id = ? AND a.block_start = ? AND a.deleted_at IS NULL AND a.status != 'cancelled'
       AND NOT EXISTS (SELECT 1 FROM alert_responses r WHERE r.alert_id = a.id AND r.deleted_at IS NULL)`,
    [child.id, iso(block.start)]);
  for (const a of alerts) {
    await w.insert('alert_responses', { alert_id: a.id, response: 'happened', responded_at: nowIso() });
  }
}

async function writeDuringUses(w: Writer, childId: string, episodeId: string, e: EpisodeInput): Promise<void> {
  for (const s of e.strategies) {
    await w.insert('strategy_uses', {
      child_id: childId, strategy_id: s.strategyId, context: 'during', episode_id: episodeId, alert_id: null,
      outcome: s.outcome, used_at: e.startedAt,
    });
  }
}

export function logEpisode(repo: Repo, child: ChildProfile, e: EpisodeInput): Promise<string> {
  return repo.write(async (w) => {
    const id = await w.insert('episodes', columns(child.id, e), [around(child.id, e.startedAt)]);
    await writeDuringUses(w, child.id, id, e);
    await autoAnswerAlert(w, child, e.startedAt);
    return id;
  });
}

export function updateEpisode(repo: Repo, child: ChildProfile, id: string, e: EpisodeInput, previousStartedAt: string): Promise<void> {
  return repo.write(async (w) => {
    await w.update('episodes', id, columns(child.id, e), [around(child.id, previousStartedAt), around(child.id, e.startedAt)]);
    // Replace this episode's "what helped" list.
    const old = await all<{ id: string }>(w.ex, 'SELECT id FROM strategy_uses WHERE episode_id = ? AND deleted_at IS NULL', [id]);
    for (const u of old) await w.softDelete('strategy_uses', u.id);
    await writeDuringUses(w, child.id, id, e);
  });
}

export function getEpisode(ex: Executor, id: string): Promise<EpisodeRow | null> {
  return one<EpisodeRow>(ex, 'SELECT * FROM episodes WHERE id = ?', [id]);
}

export function episodeStrategyUses(ex: Executor, episodeId: string): Promise<StrategyUseRow[]> {
  return all<StrategyUseRow>(ex, 'SELECT * FROM strategy_uses WHERE episode_id = ? AND deleted_at IS NULL', [episodeId]);
}

/** The fast path preselects the most-used type (SPEC 10.1); before any logs, the first tracked type. */
export async function mostUsedType(ex: Executor, child: ChildProfile): Promise<EpisodeType> {
  const r = await one<{ type: EpisodeType }>(ex,
    'SELECT type, COUNT(*) AS n FROM episodes WHERE child_id = ? AND deleted_at IS NULL GROUP BY type ORDER BY n DESC, type LIMIT 1', [child.id]);
  return r?.type ?? child.modeledEpisodeTypes[0] ?? 'meltdown';
}

/** Episodes saved on the fast path that still need details (shown as a Today card). */
export function episodesNeedingDetails(ex: Executor, childId: string, sinceIso: string): Promise<EpisodeRow[]> {
  return all<EpisodeRow>(ex,
    'SELECT * FROM episodes WHERE child_id = ? AND deleted_at IS NULL AND details_complete = 0 AND started_at >= ? ORDER BY started_at DESC', [childId, sinceIso]);
}
