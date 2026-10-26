/**
 * Checks a share-link snapshot before the portal draws it (SPEC 24.3, 24.4). The snapshot was made by the family's
 * phone, but the portal treats it as untrusted input: the shape must be right, the text must be text, and a School
 * snapshot must not contain medications, sleep or places outside school. The report template escapes every piece of
 * text as well, and the portal's Content-Security-Policy forbids scripts in the page, so even odd text is only text.
 */
import { z } from 'zod';
import type { ReportData } from './types';

const obj = z.record(z.string(), z.unknown());
const str = z.string().max(20_000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const episode = z.object({
  id: str, startedAt: z.number(), durationMin: z.number().nullable(), type: z.enum(['meltdown', 'shutdown', 'other']),
  intensity: z.number().int().min(1).max(5).nullable(), placeLabel: str.nullable(), placeType: str.nullable(),
  antecedentTags: z.array(str), antecedentNote: str.nullable(), behaviorTags: z.array(str),
  helped: z.array(z.object({ name: str, outcome: z.enum(['helped', 'not_helped', 'unsure']) })),
});

export const ShareSnapshotSchema = z.object({
  version: z.literal(1),
  nickname: str, tz: str, lang: z.enum(['en', 'es']), audience: z.enum(['clinician', 'school', 'family']),
  from: date, to: date, days: z.number(), generatedAt: z.number(), pageSize: z.enum(['letter', 'a4']),
  schoolOnly: z.boolean().optional(),
  summary: obj, previous: obj, timeOfDay: z.array(obj), episodes: z.array(episode), patterns: z.array(obj), watch: z.array(obj),
  medications: z.object({ list: z.array(obj), changes: z.array(obj) }).nullable().optional(),
  sleep: obj.nullable().optional(),
  strategies: z.array(z.object({ name: str, context: z.enum(['proactive', 'during']), successes: z.number(), failures: z.number(), unsure: z.number() })),
  forecast: z.object({ health: obj, alerts: obj }),
  notes: z.array(z.object({ id: str, at: z.number(), text: str })),
}).superRefine((s, ctx) => {
  if (s.audience === 'school' && (s.medications != null || s.sleep != null || s.episodes.some((e) => e.placeLabel != null || e.placeType != null))) {
    ctx.addIssue({ code: 'custom', message: 'a School snapshot must not contain medications, sleep or places' });
  }
});

/** The snapshot as report data, or null when it isn't a valid EmoLens snapshot. */
export function parseShareSnapshot(value: unknown): ReportData | null {
  const r = ShareSnapshotSchema.safeParse(value);
  return r.success ? (r.data as unknown as ReportData) : null;
}
