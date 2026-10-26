/**
 * The review step of voice notes and document import (SPEC 20.1 step 7, MUST): the proposed entries (from the AI
 * or the rule parser) become editable cards with a checkbox, and nothing is saved until the parent taps
 * "Save selected". Only ticked cards are saved, through the same functions as the normal log sheets.
 *
 * Names are matched to the family's own lists: medications (allowing small spelling differences), strategies and
 * places. A medication or strategy that isn't in the list can't be saved (the card says so). Each strategy used during
 * a hard moment is its own card ("Headphones · helped", BUGS #26), saved with that hard moment when both are ticked.
 */
import { ILLNESS_KINDS, type IllnessKind, type MealType, type MedicationRow, type PlaceRow, type StrategyRow } from '../db/rows';
import type { StructuredLog } from '@emolens/shared/schemas';
import type { ChildProfile, EpisodeType } from '@emolens/shared';
import { addDays, localDateOf, zonedToUtc } from '@emolens/engine';
import { logEpisode, type DuringOutcome } from '../db/repo/episodes';
import { logIllness, logMeal, logRoutineChange, logSleep, setNoteStructured } from '../db/repo/logs';
import { dosesBetween, logAsNeededDose, markDoseTaken, skipDose } from '../db/repo/meds';
import type { Repo } from '../db/repo/writer';
import { iso, ms } from '../db/time';
import { around } from '../db/repo/writer';
import { fuzzyFind, strategyPhrases, type Keywords } from './ruleParser';

interface Base { key: string; checked: boolean; }
export interface EpisodeProposal extends Base {
  kind: 'episode'; at: string; type: EpisodeType; intensity: number | null; durationMin: number | null;
  placeId: string | null; placeType: string | null; placeLabel: string | null; note: string | null;
}
/** A strategy tried during the hard moment of card `episodeKey`; `strategyId` null = not in the family's list. */
export interface StrategyProposal extends Base { kind: 'strategy'; episodeKey: string; strategyId: string | null; name: string; outcome: DuringOutcome; }
export interface DoseProposal extends Base { kind: 'dose'; at: string; medicationId: string | null; name: string; status: 'taken' | 'missed' | 'skipped'; }
export interface MealProposal extends Base { kind: 'meal'; at: string; mealType: MealType; items: string[]; }
export interface SleepProposal extends Base { kind: 'sleep'; start: string; end: string; nightWakings: number | null; }
export interface IllnessProposal extends Base { kind: 'illness'; at: string; illness: IllnessKind; severity: number; }
export interface RoutineProposal extends Base { kind: 'routine'; date: string; description: string; }
export type Proposal = EpisodeProposal | StrategyProposal | DoseProposal | MealProposal | SleepProposal | IllnessProposal | RoutineProposal;

export interface ReviewContext {
  profile: ChildProfile; now: number; keywords: Keywords;
  medications: MedicationRow[]; strategies: StrategyRow[]; places: PlaceRow[];
}

const LOCAL = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/;
const HHMM = /^(\d{1,2}):(\d{2})$/;

/** "2026-10-08T15:30" in the family's time zone → UTC ISO; missing or unreadable → now; never in the future. */
export function localToIso(local: string | null, ctx: ReviewContext): string {
  const m = local ? LOCAL.exec(local) : null;
  if (!m) return iso(ctx.now);
  const t = zonedToUtc(m[1], Number(m[2]) * 60 + Number(m[3]), ctx.profile.homeTz);
  return iso(Math.min(t, ctx.now));
}

const same = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** The family's strategy a spoken or written name refers to: the same name, an everyday word for it
 * ("headphones"), or a name it contains (4+ letters). */
export function matchStrategy(name: string, strategies: StrategyRow[], keywords: Keywords): StrategyRow | null {
  return strategies.find((x) => same(x.name, name))
    ?? strategies.find((x) => strategyPhrases(x.name, keywords).some((p) => same(p, name)))
    ?? strategies.find((x) => name.trim().length >= 4 && x.name.toLocaleLowerCase().includes(name.trim().toLocaleLowerCase()))
    ?? null;
}

/** Illness words (English and Spanish) → the app's illness kinds. */
const ILLNESS_WORDS: [IllnessKind, string[]][] = [
  ['fever', ['fever', 'temperature', 'fiebre']], ['cold', ['cold', 'cough', 'runny nose', 'resfriado', 'catarro', 'tos']],
  ['stomach', ['stomach', 'tummy', 'vomit', 'nausea', 'estómago', 'barriga', 'vómito']], ['constipation', ['constipat', 'estreñ']],
  ['dental', ['tooth', 'teeth', 'dental', 'diente', 'muela']], ['ear', ['ear', 'oído', 'oreja']], ['allergy', ['allerg', 'alergia']],
  ['injury', ['injur', 'hurt', 'fell', 'cut', 'bruise', 'golpe', 'herida', 'se cayó']], ['pain', ['pain', 'ache', 'headache', 'dolor']],
];
export function illnessKindOf(text: string): IllnessKind {
  const t = text.toLocaleLowerCase();
  if ((ILLNESS_KINDS as readonly string[]).includes(t)) return t as IllnessKind;
  return ILLNESS_WORDS.find(([, words]) => words.some((w) => t.includes(w)))?.[0] ?? 'other';
}

function sleepTimes(s: NonNullable<StructuredLog['sleep']>, ctx: ReviewContext): { start: string; end: string } | null {
  const today = localDateOf(ctx.now, ctx.profile.homeTz);
  const minutesOf = (v: string | null): { date: string | null; min: number } | null => {
    if (!v) return null;
    const full = LOCAL.exec(v);
    if (full) return { date: full[1], min: Number(full[2]) * 60 + Number(full[3]) };
    const hm = HHMM.exec(v.trim());
    return hm ? { date: null, min: Number(hm[1]) * 60 + Number(hm[2]) } : null;
  };
  const bed = minutesOf(s.bedtime_local), wake = minutesOf(s.wake_local);
  if (!bed || !wake) return null;
  const wakeDate = wake.date ?? today;
  const bedDate = bed.date ?? (bed.min > wake.min ? addDays(wakeDate, -1) : wakeDate);
  const start = zonedToUtc(bedDate, bed.min, ctx.profile.homeTz), end = zonedToUtc(wakeDate, wake.min, ctx.profile.homeTz);
  if (end <= start || end - start > 16 * 3_600_000) return null;
  return { start: iso(start), end: iso(Math.min(end, ctx.now)) };
}

export function buildProposals(log: StructuredLog, ctx: ReviewContext): Proposal[] {
  const out: Proposal[] = [];
  let n = 0;
  const key = () => `p${n++}`;
  const medNames = ctx.medications.map((m) => m.name);
  for (const e of log.episodes) {
    const place = e.place_label ? ctx.places.find((p) => same(p.label, e.place_label!)) ?? null : null;
    const episodeKey = key();
    out.push({ key: episodeKey, checked: true, kind: 'episode', at: localToIso(e.started_at_local, ctx), type: e.type, intensity: e.intensity, durationMin: e.duration_min,
      placeId: place?.id ?? null, placeType: place?.type ?? null, placeLabel: place?.label ?? e.place_label, note: e.antecedent_note });
    const seen = new Set<string>();
    for (const s of e.strategies) {
      const row = matchStrategy(s.name, ctx.strategies, ctx.keywords);
      const id = row?.id ?? `?${s.name.trim().toLocaleLowerCase()}`;
      if (!s.name.trim() || seen.has(id)) continue;
      seen.add(id);
      out.push({ key: key(), checked: row != null, kind: 'strategy', episodeKey, strategyId: row?.id ?? null, name: row?.name ?? s.name.trim(),
        outcome: s.helped === true ? 'helped' : s.helped === false ? 'not_helped' : 'unsure' });
    }
  }
  for (const d of log.med_doses) {
    const name = medNames.find((m) => same(m, d.medication_name)) ?? fuzzyFind(d.medication_name, medNames);
    const med = name ? ctx.medications.find((m) => m.name === name) ?? null : null;
    out.push({ key: key(), checked: med != null, kind: 'dose', at: localToIso(d.taken_at_local, ctx), medicationId: med?.id ?? null, name: med?.name ?? d.medication_name, status: d.status });
  }
  for (const m of log.meals) {
    if (m.items.length === 0) continue;
    out.push({ key: key(), checked: true, kind: 'meal', at: localToIso(m.eaten_at_local, ctx), mealType: m.meal_type, items: m.items });
  }
  if (log.sleep) {
    const t = sleepTimes(log.sleep, ctx);
    if (t) out.push({ key: key(), checked: true, kind: 'sleep', ...t, nightWakings: log.sleep.night_wakings });
  }
  for (const i of log.illness) {
    out.push({ key: key(), checked: true, kind: 'illness', at: iso(ctx.now), illness: illnessKindOf(i.kind), severity: i.severity ?? 2 });
  }
  if (log.routine_change?.trim()) {
    out.push({ key: key(), checked: true, kind: 'routine', date: localDateOf(ctx.now, ctx.profile.homeTz), description: log.routine_change.trim() });
  }
  return out;
}

/** A card can be saved only when it has what the log needs (a known medication, at least one food…). A strategy
 * card also needs its hard moment to be ticked: it is saved as part of that hard moment. */
export function canSave(p: Proposal, all: Proposal[] = []): boolean {
  switch (p.kind) {
    case 'strategy': {
      const episode = all.find((x) => x.key === p.episodeKey);
      return p.strategyId != null && episode != null && episode.checked;
    }
    case 'dose': return p.medicationId != null;
    case 'meal': return p.items.some((i) => i.trim());
    case 'routine': return p.description.trim().length > 0;
    default: return true;
  }
}

/** Saves the ticked cards; then marks the note accepted (something saved) or rejected. Returns how many were saved. */
export async function saveProposals(repo: Repo, profile: ChildProfile, proposals: Proposal[], noteId: string | null,
  source: 'voice' | 'document'): Promise<number> {
  let saved = 0;
  const tz = profile.homeTz;
  for (const p of proposals) {
    if (!p.checked || !canSave(p, proposals)) continue;
    switch (p.kind) {
      case 'strategy': continue; // saved with its hard moment below
      case 'episode': {
        const tried = proposals.filter((s): s is StrategyProposal => s.kind === 'strategy' && s.episodeKey === p.key && s.checked && canSave(s, proposals));
        await logEpisode(repo, profile, {
          type: p.type, startedAt: p.at, durationMin: p.durationMin, intensity: p.intensity, placeId: p.placeId, placeType: p.placeType,
          antecedentTags: [], antecedentNote: p.note, behaviorTags: [], safetyConcern: false, notes: null, detailsComplete: false, source,
          strategies: tried.map((s) => ({ strategyId: s.strategyId!, outcome: s.outcome })),
        });
        saved += tried.length; // each strategy card counts as a saved entry
        break;
      }
      case 'dose': {
        const date = localDateOf(ms(p.at), tz);
        const doses = (await dosesBetween(repo.db, profile.id, iso(zonedToUtc(date, 0, tz)), iso(zonedToUtc(addDays(date, 1), 0, tz))))
          .filter((d) => d.medication_id === p.medicationId && (d.status === 'pending' || d.status === 'missed'))
          .sort((a, b) => Math.abs(ms(a.scheduled_for!) - ms(p.at)) - Math.abs(ms(b.scheduled_for!) - ms(p.at)));
        const dose = doses[0] ?? null;
        if (p.status === 'taken') {
          if (dose) await markDoseTaken(repo, profile.id, dose, p.at);
          else await logAsNeededDose(repo, profile.id, p.medicationId!, p.at, null);
        } else if (dose && p.status === 'skipped') {
          await skipDose(repo, profile.id, dose);
        } else if (dose && p.status === 'missed') {
          await repo.write((w) => w.update('med_doses', dose.id, { status: 'missed', taken_at: null }, [around(profile.id, dose.scheduled_for!)]));
        } else continue; // nothing scheduled that day to mark missed or skipped
        break;
      }
      case 'meal':
        await logMeal(repo, profile.id, { eatenAt: p.at, mealType: p.mealType, items: p.items.filter((i) => i.trim()).map((name) => ({ name })), amount: null, notes: null });
        break;
      case 'sleep':
        await logSleep(repo, profile.id, { sleepStart: p.start, sleepEnd: p.end, nightWakings: p.nightWakings, quality: null });
        break;
      case 'illness':
        await logIllness(repo, profile.id, { kind: p.illness, severity: Math.min(3, Math.max(1, p.severity)), startedAt: p.at, ongoing: true, notes: null });
        break;
      case 'routine':
        await logRoutineChange(repo, profile.id, { localDate: p.date, startAt: null, description: p.description, severity: 2 }, iso(zonedToUtc(p.date, 0, tz)));
        break;
    }
    saved++;
  }
  if (noteId) await setNoteStructured(repo, noteId, saved > 0 ? 'accepted' : 'rejected');
  return saved;
}
