/**
 * The shared last step of voice notes and document import (SPEC 20.1 steps 5-7, 20.2): save the text as a note
 * waiting for review, find entries in it (AI or word rules), and hand the proposed cards to the review screen.
 */
import { addSourcedNote } from '../db/repo/logs';
import { listMedications } from '../db/repo/meds';
import { listStrategies } from '../db/repo/strategies';
import { all } from '../db/types';
import { nowIso } from '../db/time';
import type { PlaceRow } from '../db/rows';
import type { AiGate } from '../ai/client';
import type { ToolEnv } from '../ai/tools';
import type { CloudApi } from '../cloud/api';
import type { ReviewDraft } from '../store/review';
import { KEYWORDS_EN } from './keywords.en';
import { KEYWORDS_ES } from './keywords.es';
import { buildProposals } from './review';
import { structureText, type TextKind } from './structure';

export async function prepareReview(text: string, source: 'voice' | 'document', kind: TextKind, audioPath: string | null,
  env: ToolEnv, gate: AiGate, api?: CloudApi | null): Promise<ReviewDraft> {
  const { repo, profile } = env;
  const noteId = await addSourcedNote(repo, profile.id, { text, notedAt: nowIso(), source, audioPath, structuredStatus: 'pending' });
  const s = await structureText(text, kind, env, gate, api);
  const [medications, strategies, places] = await Promise.all([
    listMedications(repo.db, profile.id), listStrategies(repo.db, profile.id),
    all<PlaceRow>(repo.db, 'SELECT * FROM places WHERE child_id = ? AND deleted_at IS NULL', [profile.id]),
  ]);
  return { noteId, source, via: s.via, aiError: s.aiError, proposals: buildProposals(s.log, {
    profile, now: env.now, keywords: env.lang === 'es' ? KEYWORDS_ES : KEYWORDS_EN, medications, strategies, places,
  }) };
}
