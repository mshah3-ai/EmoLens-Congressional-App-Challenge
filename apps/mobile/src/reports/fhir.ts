/**
 * FHIR R4 export (SPEC 22.4): a `Bundle` of type "collection" that health-record systems can read. FHIR is the
 * standard format for exchanging health data; it names the child "Patient" and "subject" (allowed only here, SPEC 1).
 *  - Patient: a random id for every export (so two exports can't be linked), no name unless the parent opts in, and the
 *    birth year only.
 *  - Observation per hard moment: EmoLens's own code system, the type / intensity / setting as components, and the
 *    "what was happening before" and notes text as a note.
 *  - Observation per night of sleep: LOINC 93832-4 "Sleep duration", in hours (UCUM "h").
 *  - MedicationStatement per medication (RxNorm code when known), MedicationAdministration per scheduled dose.
 * Every reference points to a resource inside the same bundle (`urn:uuid:` full URLs).
 */
import type { ChildProfile, EpisodeType } from '@emolens/shared';
import { localDateOf, rangeBounds } from '@emolens/engine';
import { uuidv4 } from 'uuidv7';
import { all, one, type Executor } from '../db/types';
import { iso, ms } from '../db/time';
import { parseJson, type MedSchedule } from '../db/rows';
import type { TFn } from '@emolens/reports';

export const EMOLENS_CODE_SYSTEM = 'https://emolens.app/fhir/CodeSystem/emolens';
export const LOINC = 'http://loinc.org';
export const UCUM = 'http://unitsofmeasure.org';
export const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';
/** LOINC 93832-4 "Sleep duration" (checked 2026-09-30 in NLM's LOINC service, DECISIONS #80). */
export const SLEEP_DURATION_LOINC = { code: '93832-4', display: 'Sleep duration' };

// Minimal FHIR R4 types: only the fields EmoLens writes.
interface Coding { system: string; code: string; display?: string; }
interface CodeableConcept { coding?: Coding[]; text?: string; }
interface Reference { reference: string; }
interface Period { start: string; end?: string; }
export interface FhirResource { resourceType: string; id: string; [field: string]: unknown; }
export interface FhirBundle {
  resourceType: 'Bundle'; id: string; type: 'collection'; timestamp: string;
  entry: { fullUrl: string; resource: FhirResource }[];
}

export interface FhirInput {
  nickname: string;
  birthYear: number | null;
  /** The child's home time zone (medications ending today are still active today). */
  tz: string;
  episodes: { id: string; startedAt: number; durationMin: number | null; type: EpisodeType; intensity: number | null; placeType: string | null;
    before: string; notes: string | null }[];
  sleep: { sleepStart: number; sleepEnd: number; durationMin: number }[];
  medications: { id: string; name: string; rxcui: string | null; strength: string | null; form: string | null; asNeeded: boolean; times: string[];
    activeFrom: string; activeTo: string | null }[];
  doses: { medicationId: string; scheduledFor: number | null; takenAt: number | null; status: 'pending' | 'taken' | 'late' | 'missed' | 'skipped' }[];
  /** Display names in the app's language. */
  typeLabel: Record<EpisodeType, string>;
}

const urn = (id: string) => `urn:uuid:${id}`;
const concept = (system: string, code: string, display?: string): CodeableConcept => ({ coding: [{ system, code, ...(display ? { display } : {}) }], ...(display ? { text: display } : {}) });

export function buildFhirBundle(inp: FhirInput, o: { includeNickname: boolean; now: number; newId?: () => string }): FhirBundle {
  const id = o.newId ?? uuidv4;
  const entry: FhirBundle['entry'] = [];
  const add = (resource: FhirResource) => entry.push({ fullUrl: urn(resource.id), resource });

  const patientId = id();
  add({
    resourceType: 'Patient', id: patientId,
    ...(o.includeNickname ? { name: [{ text: inp.nickname }] } : {}),
    ...(inp.birthYear ? { birthDate: String(inp.birthYear) } : {}),
  });
  const subject: Reference = { reference: urn(patientId) };

  for (const e of inp.episodes) {
    const period: Period = { start: iso(e.startedAt), ...(e.durationMin != null ? { end: iso(e.startedAt + e.durationMin * 60_000) } : {}) };
    const component: unknown[] = [
      { code: concept(EMOLENS_CODE_SYSTEM, 'episode-type', 'Episode type'), valueCodeableConcept: concept(EMOLENS_CODE_SYSTEM, e.type, inp.typeLabel[e.type]) },
    ];
    if (e.intensity != null) component.push({ code: concept(EMOLENS_CODE_SYSTEM, 'intensity', 'Intensity (1-5)'), valueInteger: e.intensity });
    if (e.placeType) component.push({ code: concept(EMOLENS_CODE_SYSTEM, 'setting', 'Setting'), valueString: e.placeType });
    const note = [e.before, e.notes ?? ''].filter(Boolean).join('\n');
    add({
      resourceType: 'Observation', id: id(), status: 'final',
      code: concept(EMOLENS_CODE_SYSTEM, 'distress-episode', 'Distress episode (caregiver-reported)'),
      subject, effectivePeriod: period, component,
      ...(note ? { note: [{ text: note }] } : {}),
    });
  }

  for (const s of inp.sleep) {
    add({
      resourceType: 'Observation', id: id(), status: 'final',
      code: concept(LOINC, SLEEP_DURATION_LOINC.code, SLEEP_DURATION_LOINC.display),
      subject, effectivePeriod: { start: iso(s.sleepStart), end: iso(s.sleepEnd) },
      valueQuantity: { value: Math.round((s.durationMin / 60) * 100) / 100, unit: 'h', system: UCUM, code: 'h' },
    });
  }

  const medConcept = new Map<string, CodeableConcept>();
  const today = localDateOf(o.now, inp.tz);
  for (const m of inp.medications) {
    const cc: CodeableConcept = m.rxcui ? { coding: [{ system: RXNORM, code: m.rxcui, display: m.name }], text: m.name } : { text: m.name };
    medConcept.set(m.id, cc);
    const dosage = [m.strength, m.form, m.asNeeded ? 'as needed' : m.times.length ? `at ${m.times.join(', ')}` : ''].filter(Boolean).join(' ');
    add({
      resourceType: 'MedicationStatement', id: id(),
      status: m.activeTo && m.activeTo < today ? 'completed' : 'active',
      medicationCodeableConcept: cc, subject,
      effectivePeriod: { start: m.activeFrom, ...(m.activeTo ? { end: m.activeTo } : {}) },
      ...(dosage ? { dosage: [{ text: dosage }] } : {}),
    });
  }

  for (const d of inp.doses) {
    if (d.status === 'pending') continue;
    const when = d.takenAt ?? d.scheduledFor;
    const cc = medConcept.get(d.medicationId);
    if (when == null || !cc) continue;
    add({
      resourceType: 'MedicationAdministration', id: id(),
      status: d.status === 'taken' || d.status === 'late' ? 'completed' : 'not-done',
      medicationCodeableConcept: cc, subject, effectiveDateTime: iso(when),
      ...(d.status === 'late' ? { note: [{ text: 'Given late' }] } : {}),
      ...(d.status === 'missed' || d.status === 'skipped' ? { statusReason: [{ text: d.status === 'missed' ? 'Missed' : 'Skipped' }] } : {}),
    });
  }

  return { resourceType: 'Bundle', id: id(), type: 'collection', timestamp: new Date(o.now).toISOString(), entry };
}

/** Reads the data for a FHIR export of from..to (local dates). */
export async function loadFhirInput(ex: Executor, profile: ChildProfile, from: string, to: string, t: TFn): Promise<FhirInput> {
  const [a, b] = rangeBounds(from, to, profile.homeTz);
  const range = [profile.id, iso(a), iso(b)];
  const [child, episodes, sleep, meds] = await Promise.all([
    one<{ birth_year: number | null }>(ex, 'SELECT birth_year FROM children WHERE id = ?', [profile.id]),
    all<{ id: string; started_at: string; duration_min: number | null; type: EpisodeType; intensity: number | null; place_type: string | null;
      antecedent_tags: string; antecedent_note: string | null; notes: string | null }>(ex,
      `SELECT id, started_at, duration_min, type, intensity, place_type, antecedent_tags, antecedent_note, notes FROM episodes
       WHERE child_id = ? AND deleted_at IS NULL AND started_at >= ? AND started_at < ? ORDER BY started_at`, range),
    all<{ sleep_start: string; sleep_end: string; duration_min: number }>(ex,
      'SELECT sleep_start, sleep_end, duration_min FROM sleep_entries WHERE child_id = ? AND deleted_at IS NULL AND sleep_end >= ? AND sleep_end < ? ORDER BY sleep_end', range),
    all<{ id: string; name: string; rxcui: string | null; strength: string | null; form: string | null; as_needed: number; schedule: string;
      active_from: string; active_to: string | null }>(ex,
      `SELECT id, name, rxcui, strength, form, as_needed, schedule, active_from, active_to FROM medications
       WHERE child_id = ? AND deleted_at IS NULL AND active_from <= ? AND (active_to IS NULL OR active_to >= ?)`, [profile.id, to, from]),
  ]);
  const ids = meds.map((m) => m.id);
  const doses = ids.length ? await all<{ medication_id: string; scheduled_for: string | null; taken_at: string | null; status: FhirInput['doses'][number]['status'] }>(ex,
    `SELECT medication_id, scheduled_for, taken_at, status FROM med_doses WHERE deleted_at IS NULL AND medication_id IN (${ids.map(() => '?').join(',')})
     AND COALESCE(taken_at, scheduled_for) >= ? AND COALESCE(taken_at, scheduled_for) < ? ORDER BY COALESCE(taken_at, scheduled_for)`, [...ids, iso(a), iso(b)]) : [];
  return {
    nickname: profile.nickname,
    birthYear: child?.birth_year ?? null,
    tz: profile.homeTz,
    episodes: episodes.map((e) => ({
      id: e.id, startedAt: ms(e.started_at), durationMin: e.duration_min, type: e.type, intensity: e.intensity, placeType: e.place_type,
      before: [parseJson<string[]>(e.antecedent_tags, []).map((x) => t(`tags.antecedent.${x}`)).join(', '), e.antecedent_note ?? ''].filter(Boolean).join('. '),
      notes: e.notes,
    })),
    sleep: sleep.map((s) => ({ sleepStart: ms(s.sleep_start), sleepEnd: ms(s.sleep_end), durationMin: s.duration_min })),
    medications: meds.map((m) => ({ id: m.id, name: m.name, rxcui: m.rxcui, strength: m.strength, form: m.form, asNeeded: !!m.as_needed,
      times: parseJson<MedSchedule>(m.schedule, { times: [], days: [] }).times, activeFrom: m.active_from, activeTo: m.active_to })),
    doses: doses.map((d) => ({ medicationId: d.medication_id, scheduledFor: d.scheduled_for ? ms(d.scheduled_for) : null,
      takenAt: d.taken_at ? ms(d.taken_at) : null, status: d.status })),
    typeLabel: { meltdown: t('episode.types.meltdown'), shutdown: t('episode.types.shutdown'), other: t('episode.types.other') },
  };
}
