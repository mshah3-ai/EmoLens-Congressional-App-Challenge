/**
 * Voice note / document text → proposed log entries (SPEC 20.1 step 6, 20.2):
 *  - cloud AI on → the ai-structure function (nickname removed first by aiCall), its answer checked with zod;
 *  - cloud AI off, or the AI unavailable → the on-device rule parser.
 * Either way the result goes to the review screen; nothing is saved here.
 */
import { StructuredLogSchema, type StructuredLog } from '@emolens/shared/schemas';
import { formatHHMM, localDateOf, localMinuteOf } from '@emolens/engine';
import type { CloudApi } from '../cloud/api';
import { recentFoods } from '../db/repo/logs';
import { listMedications } from '../db/repo/meds';
import { listStrategies } from '../db/repo/strategies';
import { all } from '../db/types';
import type { PlaceRow } from '../db/rows';
import { aiCall, type AiErrorCode, type AiGate } from '../ai/client';
import type { ToolEnv } from '../ai/tools';
import { KEYWORDS_EN } from './keywords.en';
import { KEYWORDS_ES } from './keywords.es';
import { parseVoiceNote } from './ruleParser';

export type TextKind = 'voice_note' | 'school_report' | 'other';
export interface Structured { log: StructuredLog; via: 'ai' | 'rules'; aiError: AiErrorCode | null; }

export async function structureText(text: string, kind: TextKind, env: ToolEnv, gate: AiGate, api?: CloudApi | null): Promise<Structured> {
  const { db } = env.repo;
  const id = env.profile.id, tz = env.profile.homeTz;
  const [meds, strategies, places, foods] = await Promise.all([
    listMedications(db, id), listStrategies(db, id),
    all<PlaceRow>(db, 'SELECT * FROM places WHERE child_id = ? AND deleted_at IS NULL', [id]), recentFoods(db, id, 30),
  ]);
  const lists = {
    medicationNames: meds.map((m) => m.name), strategyNames: strategies.filter((s) => s.active === 1).map((s) => s.name),
    placeLabels: places.map((p) => p.label), recentFoods: foods.map((f) => f.name),
  };
  let aiError: AiErrorCode | null = null;
  if (gate.enabled) {
    const now_local = `${localDateOf(env.now, tz)}T${formatHHMM(localMinuteOf(env.now, tz))}`;
    const res = await aiCall<{ log: unknown }>('ai-structure', {
      text, language: env.lang,
      context: { now_local, tz, medication_names: lists.medicationNames, strategy_names: lists.strategyNames, place_labels: lists.placeLabels,
        food_recent_items: lists.recentFoods, document_type: kind },
    }, env.profile.nickname, gate, api);
    if (res.ok) {
      const parsed = StructuredLogSchema.safeParse(res.data.log);
      if (parsed.success) return { log: parsed.data, via: 'ai', aiError: null };
      aiError = 'failed';
    } else aiError = res.error;
  }
  const log = parseVoiceNote(text, { now: env.now, tz, keywords: env.lang === 'es' ? KEYWORDS_ES : KEYWORDS_EN, ...lists });
  return { log, via: 'rules', aiError };
}
