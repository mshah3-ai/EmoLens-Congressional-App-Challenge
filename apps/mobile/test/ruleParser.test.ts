/**
 * @jest-environment node
 *
 * The on-device voice-note rule parser (SPEC 20.1, Appendix B.5): times, hard-moment keywords and intensity, fuzzy
 * medication names (Levenshtein ≤ 2), foods, strategies and places, in English and Spanish.
 */
import { KEYWORDS_EN } from '../src/voice/keywords.en';
import { KEYWORDS_ES } from '../src/voice/keywords.es';
import { fuzzyFind, levenshtein, parseVoiceNote, timeIn, type ParseContext } from '../src/voice/ruleParser';

const TZ = 'America/Chicago';
const NOW = Date.parse('2026-10-08T23:40:00.000Z'); // Thursday 18:40 in Chicago
const ctx = (over: Partial<ParseContext> = {}): ParseContext => ({
  now: NOW, tz: TZ, keywords: KEYWORDS_EN,
  medicationNames: ['Melatonin', 'Guanfacine 1 mg'], strategyNames: ['Noise-reducing headphones', 'Quiet space / break area', 'Deep pressure'],
  placeLabels: ['School', "Grandma's house"], recentFoods: ['apple slices', 'pizza', 'juice'], ...over,
});

test.each([
  ['at 3', 15 * 60], ['at 3:15', 15 * 60 + 15], ['around 9 am', 9 * 60], ['at 11', 11 * 60], ['at 7 pm', 19 * 60], ['3:45', 15 * 60 + 45],
  ['this morning', 9 * 60], ['around noon', 12 * 60], ['after school', 15 * 60 + 30], ['at lunch', 12 * 60], ['at 12', 12 * 60],
])('time: "%s"', (phrase, minutes) => {
  expect(timeIn(`It happened ${phrase} today.`, KEYWORDS_EN)).toBe(minutes);
});

test('no time mentioned → null (the note time is used)', () => {
  expect(timeIn('He had a meltdown.', KEYWORDS_EN)).toBeNull();
  expect(timeIn('He had 3 meltdowns.', KEYWORDS_EN)).toBeNull();
});

test('levenshtein and fuzzy medication names', () => {
  expect(levenshtein('melatonin', 'melatonin')).toBe(0);
  expect(levenshtein('melatonin', 'melotonin')).toBe(1);
  expect(levenshtein('kitten', 'sitting')).toBe(3);
  const meds = ['Melatonin', 'Guanfacine 1 mg'];
  expect(fuzzyFind('gave him his melotonin', meds)).toBe('Melatonin');
  expect(fuzzyFind('forgot the guanfasine', meds)).toBe('Guanfacine 1 mg');
  expect(fuzzyFind('we went to the mall', meds)).toBeNull();
  expect(fuzzyFind('melody time', meds)).toBeNull(); // too far from "melatonin"
});

test('a typical note: meltdown after school with a duration, intensity, strategy and place; a missed dose; a snack', () => {
  const log = parseVoiceNote(
    "Big meltdown after school at School, it lasted for 20 minutes. The noise-reducing headphones helped. We forgot his melatonin last night. He ate apple slices and juice for a snack.",
    ctx());
  expect(log.episodes).toEqual([{
    started_at_local: '2026-10-08T15:30', type: 'meltdown', intensity: 4, duration_min: 20, place_label: 'School', antecedent_note: null,
    strategies: [{ name: 'Noise-reducing headphones', helped: true }],
  }]);
  expect(log.med_doses).toEqual([{ medication_name: 'Melatonin', status: 'missed', taken_at_local: null }]);
  expect(log.meals).toEqual([{ meal_type: 'snack', items: ['apple slices', 'juice'], eaten_at_local: null }]);
});

test('types and intensity words; yesterday moves the date; no time → the note time', () => {
  const log = parseVoiceNote('She shut down at 4. Yesterday was the worst meltdown. A mild hard moment.', ctx());
  expect(log.episodes.map((e) => [e.type, e.started_at_local, e.intensity])).toEqual([
    ['shutdown', '2026-10-08T16:00', null],
    ['meltdown', '2026-10-07T18:40', 5],
    ['other', '2026-10-08T18:40', 2],
  ]);
});

test('nothing loggable → empty lists (the text itself is kept as the note)', () => {
  expect(parseVoiceNote('We went to the park and it was a nice day.', ctx())).toEqual({
    episodes: [], med_doses: [], meals: [], sleep: null, illness: [], routine_change: null, notes: null,
  });
});

test('Spanish: crisis / se cerró, times, medication taken, strategy that did not help', () => {
  const log = parseVoiceNote(
    'Tuvo una crisis fuerte después de la escuela. Los auriculares no ayudaron. Le dimos la melatonina a las 8 de la noche. Ayer se cerró por la tarde.',
    ctx({ keywords: KEYWORDS_ES, strategyNames: ['auriculares'], medicationNames: ['Melatonina'] }));
  expect(log.episodes.map((e) => [e.type, e.started_at_local, e.intensity])).toEqual([
    ['meltdown', '2026-10-08T15:30', 4],
    ['shutdown', '2026-10-07T15:00', null],
  ]);
  expect(log.episodes[0].strategies).toEqual([{ name: 'auriculares', helped: false }]);
  expect(log.med_doses).toEqual([{ medication_name: 'Melatonina', status: 'taken', taken_at_local: '2026-10-08T20:00' }]);
});

// BUGS #26: parents name a strategy with everyday words, not the list's full name
test('strategies by everyday words: "headphones helped" → Noise-reducing headphones, in the same or the next sentence', () => {
  expect(parseVoiceNote('Meltdown at 4 PM, headphones helped.', ctx()).episodes).toEqual([{
    started_at_local: '2026-10-08T16:00', type: 'meltdown', intensity: null, duration_min: null, place_label: null, antecedent_note: null,
    strategies: [{ name: 'Noise-reducing headphones', helped: true }],
  }]);
  expect(parseVoiceNote('She shut down at 4. The quiet corner and ear defenders worked.', ctx()).episodes[0].strategies).toEqual([
    { name: 'Noise-reducing headphones', helped: true }, { name: 'Quiet space / break area', helped: true },
  ]);
  // a part of "A / B" names the strategy too, but a single shared word doesn't ("lunch break" isn't "break area")
  expect(parseVoiceNote('Meltdown at the break area.', ctx()).episodes[0].strategies).toEqual([{ name: 'Quiet space / break area', helped: null }]);
  expect(parseVoiceNote('Meltdown during the lunch break.', ctx()).episodes[0].strategies).toEqual([]);
  // a family's own strategy (not built in) still needs its name
  expect(parseVoiceNote('Meltdown, deep pressure helped.', ctx()).episodes[0].strategies).toEqual([{ name: 'Deep pressure', helped: true }]);
});

test('Spanish everyday words: "los audífonos ayudaron" → Audífonos que reducen el ruido', () => {
  const log = parseVoiceNote('Tuvo una crisis a las 4. Los audífonos ayudaron.',
    ctx({ keywords: KEYWORDS_ES, strategyNames: ['Audífonos que reducen el ruido', 'Pausa de movimiento (caminar, columpio, saltar)'] }));
  expect(log.episodes[0].strategies).toEqual([{ name: 'Audífonos que reducen el ruido', helped: true }]);
});
