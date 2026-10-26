/**
 * @emolens/reports tests (Node): the audience rules, the translator's plural and fallback rules, and the snapshot
 * check. The full report (every section, both languages) is tested in the app on the demo family
 * (apps/mobile/test/reports.test.ts, schoolPrivacy.test.ts, sharedReport.test.ts).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleReport, dateYearAt, parseShareSnapshot, renderReportHtml, translator, type ReportInputs, type ReportOptions } from '../src/index';

const emptyHealth = { n: 0, brier: null, brierBaseline: null, skill: null, auroc: null, logLoss: null, reliability: [] };
const inputs = (): ReportInputs => ({
  profile: { id: 'c1', nickname: 'Sam', homeTz: 'America/Chicago', typicalSleepHours: 10 },
  episodes: [
    { id: 'e1', startedAt: Date.parse('2026-09-10T15:00:00Z'), durationMin: 10, type: 'meltdown', intensity: 3, placeId: 'p-home', placeType: 'home',
      antecedentTags: ['transition'], antecedentNote: null, behaviorTags: ['crying'] },
    { id: 'e2', startedAt: Date.parse('2026-09-11T15:00:00Z'), durationMin: 20, type: 'shutdown', intensity: 2, placeId: 'p-school', placeType: 'school',
      antecedentTags: [], antecedentNote: null, behaviorTags: [] },
  ],
  places: [{ id: 'p-home', label: 'Home', type: 'home' }, { id: 'p-school', label: 'Lincoln Elementary', type: 'school' }],
  uses: [{ strategyId: 's1', name: 'Quiet space', context: 'during', outcome: 'helped', episodeId: 'e1' }],
  timeOfDay: [],
  patterns: [],
  watch: [{ id: 'med:m1', kind: 'medication', label: 'Medication A', nExposed: 10, kExposed: 5, pAbove: 0.9, median: 1.5, lo80: 1.1, hi80: 2, shown: true }] as ReportInputs['watch'],
  health: emptyHealth as unknown as ReportInputs['health'],
  alerts: { delivered: 0, answered: 0, happened: 0, steppedIn: 0, calm: 0, unanswered: 0, hitRate: null } as unknown as ReportInputs['alerts'],
  medications: { meds: [{ id: 'm1', name: 'Medication A', strength: '5 mg', form: null, rxcui: null, asNeeded: false, times: ['08:00'], activeFrom: '2026-08-01', activeTo: null }],
    doses: [], changes: [] },
  sleep: [{ sleepEnd: Date.parse('2026-09-10T12:00:00Z'), durationMin: 540 }],
  notes: [],
});
const opts = (audience: ReportOptions['audience']): ReportOptions => ({ from: '2026-09-01', to: '2026-09-30', audience, noteIds: [], lang: 'en', now: Date.parse('2026-09-30T20:00:00Z'), pageSize: 'letter' });

test('School: no medications, sleep, places or medication items; Clinician: everything', () => {
  const school = assembleReport(inputs(), opts('school'));
  assert.equal(school.medications, null);
  assert.equal(school.sleep, null);
  assert.ok(school.episodes.every((e) => e.placeLabel == null && e.placeType == null));
  assert.equal(school.watch.length, 0);
  const html = renderReportHtml(school, translator('en'));
  for (const word of ['Medication A', 'Home', 'Lincoln Elementary', '5 mg']) assert.ok(!html.includes(word), word);

  const clinician = assembleReport(inputs(), opts('clinician'));
  assert.equal(clinician.medications?.list[0].name, 'Medication A');
  assert.equal(clinician.episodes[0].placeLabel, 'Home');
  assert.deepEqual(clinician.episodes[0].helped, [{ name: 'Quiet space', outcome: 'helped' }]);
  assert.equal(clinician.strategies[0].successes, 1);
  assert.equal(clinician.summary.total, 2);
});

test('translator: placeholders, plural forms by count (numbers and text), Spanish, English fallback, unknown key', () => {
  const en = translator('en'), es = translator('es');
  assert.equal(en('common.minutes', { count: 1 }), '1 min');
  assert.equal(en('report.hoursValue', { value: '9.0' }), '9.0 h');
  assert.equal(es('report.coverTitle', { name: 'Sam' }), es('report.coverTitle', { name: 'Sam' }));
  assert.notEqual(es('report.summary'), en('report.summary'));
  assert.equal(en('no.such.key'), 'no.such.key');
});

test('snapshot check: accepts a real report, refuses junk', () => {
  const data = assembleReport(inputs(), opts('family'));
  assert.ok(parseShareSnapshot({ version: 1, ...JSON.parse(JSON.stringify(data)) }));
  assert.equal(parseShareSnapshot({ ...data }), null); // no version
  assert.equal(parseShareSnapshot('<script>'), null);
});

// 10:47 PM on Oct 1 in Los Angeles is already 05:47 on Oct 2 in UTC (BUGS #22).
const LATE_EVENING_LA = Date.parse('2026-10-02T05:47:00Z');

test('dateYearAt: the date in the given time zone, not in UTC', () => {
  assert.equal(dateYearAt('en', LATE_EVENING_LA, 'America/Los_Angeles'), 'Oct 1, 2026');
  assert.equal(dateYearAt('es', LATE_EVENING_LA, 'America/Los_Angeles'), '1 oct 2026');
  assert.equal(dateYearAt('en', Date.parse('2026-10-02T03:30:00Z'), 'America/New_York'), 'Oct 1, 2026'); // 11:30 PM
  assert.equal(dateYearAt('en', LATE_EVENING_LA, 'UTC'), 'Oct 2, 2026');
  assert.equal(dateYearAt('en', Date.parse('2026-10-01T16:00:00Z'), 'Asia/Tokyo'), 'Oct 2, 2026'); // 1 AM next day
});

test('"Made on" is the home date: a report made at 10:47 PM in Los Angeles says Oct 1, also in its share link', () => {
  const made = (lang: 'en' | 'es') => assembleReport({ ...inputs(), profile: { ...inputs().profile, homeTz: 'America/Los_Angeles' } },
    { ...opts('school'), from: '2026-09-02', to: '2026-10-01', lang, now: LATE_EVENING_LA });
  const en = renderReportHtml(made('en'), translator('en'));
  assert.ok(en.includes('Made on Oct 1, 2026'), 'English report');
  assert.ok(!en.includes('Oct 2, 2026'), 'no UTC date anywhere');
  assert.ok(renderReportHtml(made('es'), translator('es')).includes('1 oct 2026'), 'Spanish report');
  // the share link stores the data as JSON; the portal renders it on a server that runs in UTC
  const shared = parseShareSnapshot({ version: 1, ...JSON.parse(JSON.stringify(made('en'))) });
  assert.ok(shared);
  assert.ok(renderReportHtml(shared, translator('en')).includes('Made on Oct 1, 2026'), 'shared report');
});

test('BUGS #24: "most likely" names the chart\'s tallest bar, and hard moments outside waking hours get a note (en + es)', () => {
  const late = (id: string, day: number) => ({ id, startedAt: Date.parse(`2026-09-${day}T04:00:00Z`), durationMin: 5, type: 'meltdown' as const,
    intensity: 2, placeId: null, placeType: null, antecedentTags: [], antecedentNote: null, behaviorTags: [] }); // 11 PM in Chicago
  const row = (index: number, k: number, n: number) => ({ index, k, n, rate: n ? k / n : 0, lo80: 0, hi80: 1 });
  const i = { ...inputs(), episodes: [...inputs().episodes, late('l1', 12), late('l2', 13), late('l3', 14)],
    // waking blocks 8 AM-8 PM; the 2-4 PM block has the highest share
    timeOfDay: [row(4, 0, 10), row(5, 2, 10), row(6, 1, 10), row(7, 3, 6), row(8, 0, 10), row(9, 0, 10)] };
  const en = renderReportHtml(assembleReport(i, opts('family')), translator('en'));
  assert.ok(en.includes('Hard moments were most likely in the 2–4 pm block'), 'names the tallest bar');
  assert.ok(!en.includes('Most often') && !en.includes('in the evening'), 'never names a time the chart lacks');
  assert.ok(en.includes('3 hard moments happened outside waking hours, so they aren'));
  const es = renderReportHtml(assembleReport(i, { ...opts('family'), lang: 'es' }), translator('es'));
  assert.ok(es.includes('en la franja de 14–16 h'));
  assert.ok(es.includes('3 momentos difíciles ocurrieron fuera de las horas despierto'));
  // all inside waking hours: no note
  const inside = renderReportHtml(assembleReport({ ...inputs(), timeOfDay: i.timeOfDay }, opts('family')), translator('en'));
  assert.ok(!inside.includes('outside waking hours'));
});

test("the share-create function's School pattern list matches the report's School rules", async () => {
  const { readFileSync } = await import('node:fs');
  const { FEATURE_BY_KEY } = await import('@emolens/shared');
  const src = readFileSync(new URL('../../../supabase/functions/_shared/share.ts', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('SCHOOL_HIDDEN_PATTERN_KEYS = ['), src.indexOf('];', src.indexOf('SCHOOL_HIDDEN_PATTERN_KEYS = [')));
  const server = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  const hidden = Object.values(FEATURE_BY_KEY).filter((f) => ['sleep', 'medication', 'health', 'physiology'].includes(f.group)).map((f) => f.key);
  assert.deepEqual(server, [...hidden, 'place_therapy_medical', 'place_other'].sort());
});
