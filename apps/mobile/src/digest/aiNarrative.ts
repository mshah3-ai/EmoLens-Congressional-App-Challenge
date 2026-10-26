/**
 * The weekly digest's AI summary (SPEC 21, Appendix A.4). With AI features on, the week's statistics (numbers and
 * pattern names only, nickname replaced by [CHILD]) go to ai-digest, and the 120-180 word answer is saved in
 * digests.narrative, still with [CHILD]; the screen puts the nickname back. If the AI isn't available, the template
 * sentences are shown as before (DECISIONS #76).
 */
import type { ChildProfile, Lang } from '@emolens/shared';
import type { CloudApi } from '../cloud/api';
import { one } from '../db/types';
import type { Repo } from '../db/repo/writer';
import { aiCall, type AiErrorCode, type AiGate } from '../ai/client';

export async function writeAiNarrative(repo: Repo, profile: ChildProfile, weekStart: string, lang: Lang, gate: AiGate,
  api?: CloudApi | null): Promise<{ ok: true; narrative: string } | { ok: false; error: AiErrorCode | 'missing' }> {
  const row = await one<{ id: string; stats_json: string }>(repo.db, 'SELECT id, stats_json FROM digests WHERE child_id = ? AND week_start = ?', [profile.id, weekStart]);
  if (!row) return { ok: false, error: 'missing' };
  const res = await aiCall<{ narrative: string }>('ai-digest', { stats: JSON.parse(row.stats_json) as Record<string, unknown>, language: lang },
    profile.nickname, gate, api);
  if (!res.ok) return res;
  const narrative = res.data.narrative.trim();
  await repo.db.execute('UPDATE digests SET narrative = ? WHERE id = ?', [narrative, row.id]);
  return { ok: true, narrative };
}
