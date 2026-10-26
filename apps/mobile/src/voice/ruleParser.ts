/**
 * The on-device rule parser (SPEC 20.1, used when cloud AI is off): turns a voice note's text into proposed entries
 * with simple rules, no AI. It returns the same shape as the AI (StructuredLog), so the review screen treats both
 * the same way, and nothing is saved until the parent ticks the entries to keep.
 *
 * Rules, sentence by sentence:
 *  - hard moments: keywords ("meltdown", "shut down", "crisis", "se cerró"…) and intensity words ("mild" → 2,
 *    "big" → 4, "worst" → 5); "for 20 minutes" sets the duration;
 *  - times: "at 3" (1-6 means afternoon), "3:15", "at 3 pm", "around noon", "this morning" (09:00), "after school"
 *    (15:30), "at lunch" (12:00); "yesterday" moves to the day before. Without a time, the note's own time is used;
 *  - medications: the child's medication names, allowing small spelling differences (Levenshtein distance ≤ 2);
 *    "forgot" / "missed" → missed, "skipped" → skipped, otherwise taken;
 *  - foods: items the child ate recently; places: the names in the parent's own list;
 *  - strategies: the names in the parent's own list, each part of a name like "Quiet space / break area", and everyday
 *    words for the built-in ones ("headphones" → "Noise-reducing headphones").
 */
import { DEFAULT_STRATEGIES } from '@emolens/shared';
import type { StructuredLog } from '@emolens/shared/schemas';
import { addDays, formatHHMM, localDateOf, localMinuteOf } from '@emolens/engine';

export interface Keywords {
  meltdown: string[]; shutdown: string[]; other: string[];
  intensity: { words: string[]; value: number }[];
  times: { words: string[]; at: string }[];
  yesterday: string[]; timeLead: string[]; am: string[]; pm: string[];
  duration: RegExp; durationHours: RegExp;
  helped: string[]; notHelped: string[];
  missed: string[]; skipped: string[]; taken: string[];
  meals: { words: string[]; type: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink' }[];
  ate: string[];
  /** Everyday words for the built-in strategies, keyed by the strategy's English name in DEFAULT_STRATEGIES. */
  strategyAliases: Record<string, string[]>;
}

export interface ParseContext {
  now: number; tz: string; keywords: Keywords;
  medicationNames: string[]; strategyNames: string[]; placeLabels: string[]; recentFoods: string[];
}

const norm = (s: string) => s.normalize('NFC').toLocaleLowerCase();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WORD = '[\\p{L}\\p{M}\\p{N}_]';

/** Whole-word / whole-phrase match, for every alphabet (plain \b only knows A-Z). */
export function hasPhrase(text: string, phrase: string): boolean {
  return new RegExp(`(?<!${WORD})${escapeRe(norm(phrase))}(?!${WORD})`, 'u').test(norm(text));
}
const anyPhrase = (text: string, phrases: string[]) => phrases.some((p) => hasPhrase(text, p));

/** Number of single-letter edits between two words (insert, delete, change). */
export function levenshtein(a: string, b: string): number {
  const x = norm(a), y = norm(b);
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[y.length];
}

const wordsOf = (s: string) => norm(s).match(new RegExp(`${WORD}+`, 'gu')) ?? [];

/** A medication name in the sentence, allowing up to 2 spelling differences for names of 5+ letters. */
export function fuzzyFind(sentence: string, names: string[]): string | null {
  const words = wordsOf(sentence);
  for (const name of names) {
    const key = wordsOf(name)[0];
    if (!key) continue;
    if (hasPhrase(sentence, name)) return name;
    // compare the name's first word (e.g. "Melatonin" of "Melatonin 3 mg") with each spoken word
    const allowed = key.length >= 5 ? 2 : key.length >= 4 ? 1 : 0;
    if (allowed > 0 && words.some((w) => Math.abs(w.length - key.length) <= allowed && levenshtein(w, key) <= allowed)) return name;
  }
  return null;
}

/** The phrases that name a strategy: its name, each part of "A / B" with 2+ words, and the everyday words for a
 * built-in strategy (in either language, since the family's list keeps the language it was created in). */
export function strategyPhrases(name: string, k: Keywords): string[] {
  const parts = name.split(/\s*\/\s*|\s*\(.*\)\s*/u).map((p) => p.trim()).filter((p) => p.split(/\s+/u).length >= 2);
  const builtIn = DEFAULT_STRATEGIES.find((d) => norm(d.name.en) === norm(name) || norm(d.name.es) === norm(name));
  return [name, ...parts, ...(builtIn ? k.strategyAliases[builtIn.name.en] ?? [] : [])];
}

function strategiesIn(sentence: string, ctx: ParseContext): string[] {
  return ctx.strategyNames.filter((n) => anyPhrase(sentence, strategyPhrases(n, ctx.keywords)));
}

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?;])\s+|\n+/u).map((s) => s.trim()).filter(Boolean);
}

/** The clock time a sentence mentions, as minutes after midnight, or null. */
export function timeIn(sentence: string, k: Keywords): number | null {
  const s = norm(sentence);
  const lead = k.timeLead.map((w) => escapeRe(norm(w))).join('|');
  const m = s.match(new RegExp(`(?<!${WORD})(?:${lead})\\s+(\\d{1,2})(?::(\\d{2}))?(?!\\d)`, 'u')) ?? s.match(/(?<!\d)(\d{1,2}):(\d{2})(?!\d)/u);
  if (m) {
    let h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (h > 23 || min > 59) return null;
    const after = s.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 20);
    const pm = k.pm.some((w) => after.trimStart().startsWith(norm(w)));
    const am = k.am.some((w) => after.trimStart().startsWith(norm(w)));
    if (pm && h < 12) h += 12;
    else if (!am && h >= 1 && h <= 6) h += 12; // "at 3" during the child's day means the afternoon
    if (am && h === 12) h = 0;
    return h * 60 + min;
  }
  for (const t of k.times) if (anyPhrase(sentence, t.words)) {
    const [h, mi] = t.at.split(':').map(Number);
    return h * 60 + mi;
  }
  return null;
}

/** "YYYY-MM-DDTHH:MM" in the family's time zone. */
function localStampOf(date: string, minutes: number): string {
  return `${date}T${formatHHMM(minutes)}`;
}

export function parseVoiceNote(text: string, ctx: ParseContext): StructuredLog {
  const k = ctx.keywords;
  const today = localDateOf(ctx.now, ctx.tz);
  const nowMin = localMinuteOf(ctx.now, ctx.tz);
  const dayOf = (s: string) => (anyPhrase(s, k.yesterday) ? addDays(today, -1) : today);
  const out: StructuredLog = { episodes: [], med_doses: [], meals: [], sleep: null, illness: [], routine_change: null, notes: null };

  for (const s of sentencesOf(text)) {
    const time = timeIn(s, k);
    const date = dayOf(s);
    // hard moments
    const type = anyPhrase(s, k.meltdown) ? 'meltdown' : anyPhrase(s, k.shutdown) ? 'shutdown' : anyPhrase(s, k.other) ? 'other' : null;
    if (type) {
      const intensity = [...k.intensity].reverse().find((i) => anyPhrase(s, i.words))?.value ?? null;
      const dm = norm(s).match(k.duration);
      const duration = dm ? Number(dm[1]) : k.durationHours.test(norm(s)) ? 60 : null;
      const helped = anyPhrase(s, k.notHelped) ? false : anyPhrase(s, k.helped) ? true : null;
      out.episodes.push({
        started_at_local: localStampOf(date, time ?? nowMin), type, intensity, duration_min: duration,
        place_label: ctx.placeLabels.find((p) => hasPhrase(s, p)) ?? null, antecedent_note: null,
        strategies: strategiesIn(s, ctx).map((name) => ({ name, helped })),
      });
    } else {
      // a strategy mentioned without a hard moment in the same sentence belongs to the previous one, if any
      const last = out.episodes[out.episodes.length - 1];
      const strategies = strategiesIn(s, ctx);
      if (last && strategies.length > 0) {
        const helped = anyPhrase(s, k.notHelped) ? false : anyPhrase(s, k.helped) ? true : null;
        for (const name of strategies) if (!last.strategies.some((x) => x.name === name)) last.strategies.push({ name, helped });
      }
    }
    // medications
    const med = fuzzyFind(s, ctx.medicationNames);
    if (med) {
      const status = anyPhrase(s, k.missed) ? 'missed' : anyPhrase(s, k.skipped) ? 'skipped' : 'taken';
      out.med_doses.push({ medication_name: med, status, taken_at_local: status === 'taken' && time != null ? localStampOf(date, time) : null });
    }
    // foods eaten recently, grouped per sentence into one meal
    const items = ctx.recentFoods.filter((f) => f.trim() && hasPhrase(s, f));
    if (items.length > 0 && (anyPhrase(s, k.ate) || k.meals.some((m) => anyPhrase(s, m.words)))) {
      const mealType = k.meals.find((m) => anyPhrase(s, m.words))?.type ?? 'snack';
      out.meals.push({ meal_type: mealType, items, eaten_at_local: time != null ? localStampOf(date, time) : null });
    }
  }
  return out;
}
