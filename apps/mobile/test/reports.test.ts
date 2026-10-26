/**
 * @jest-environment node
 * Reports and exports (SPEC 22, tests from SPEC 30.2), on a 30-day simulated family in a real SQLite database:
 *  - FHIR bundle structure: resource types, ids, every reference resolves inside the bundle, a new Patient id each time,
 *    no name unless asked, LOINC/UCUM on sleep, dose statuses;
 *  - ABC CSV: byte-order mark, exact header, quoting, and the automatic antecedents;
 *  - SVG generators return well-formed SVG with escaped text;
 *  - the PDF report: every section for a clinician; a school report has no medication, sleep, health or place-name data.
 */
import { DOMParser } from '@xmldom/xmldom';
import { SUSPECTED_TRIGGERS } from '@emolens/shared';
import { addDays, featureLabel, localDateOf } from '@emolens/engine';
import { DEMO_SUSPECTED } from '@emolens/simulator';
import { buildDemo } from '../src/demo/build';
import { getChild, toChildProfile } from '../src/db/repo/children';
import type { Repo } from '../src/db/repo/writer';
import { all } from '../src/db/types';
import '../src/i18n';
import { tFor } from '../src/reports/actions';
import { ABC_COLUMNS, buildAbcCsv, csvField, loadAbcRows } from '../src/reports/abc';
import { loadReportData, type ReportOptions } from '../src/reports/data';
import { EMOLENS_CODE_SYSTEM, LOINC, UCUM, buildFhirBundle, loadFhirInput, type FhirBundle, type FhirInput } from '../src/reports/fhir';
import { calendarHeatmap, countBarChart, esc, rateBarChart } from '@emolens/reports';
import { renderDigestHtml } from '../src/reports/templates/digest';
import { REPORT_SECTIONS, renderReportHtml, sectionsFor } from '@emolens/reports';
import { listDigests } from '../src/digest/generate';
import { testRepo } from './nodeDb';

jest.setTimeout(120_000);

const TZ = 'America/New_York';
const NOW = Date.parse('2026-09-29T15:10:00.000Z'); // Tuesday 11:10 in New York
const t = tFor('en');
let repo: Repo;
let profile: ReturnType<typeof toChildProfile>;
const TO = localDateOf(NOW, TZ);
const FROM = addDays(TO, -29);

beforeAll(async () => {
  repo = await testRepo();
  await buildDemo(repo, { lang: 'en', tz: TZ, now: NOW, days: 30, yieldToUi: false });
  profile = toChildProfile((await getChild(repo.db))!, SUSPECTED_TRIGGERS.filter((x) => DEMO_SUSPECTED.includes(x.id)).map((x) => x.id));
});

const opts = (o: Partial<ReportOptions> = {}): ReportOptions =>
  ({ from: FROM, to: TO, audience: 'clinician', noteIds: [], lang: 'en', now: NOW, pageSize: 'letter', ...o });

/** Parses XML/SVG and fails on any parser error or warning. */
function parseXml(s: string) {
  const problems: string[] = [];
  const doc = new DOMParser({ errorHandler: { warning: (m) => problems.push(m), error: (m) => problems.push(m), fatalError: (m) => problems.push(m) } })
    .parseFromString(s, 'image/svg+xml');
  expect(problems).toEqual([]);
  return doc;
}

// ---------------------------------------------------------------- FHIR

function checkBundle(b: FhirBundle) {
  expect(b.resourceType).toBe('Bundle');
  expect(b.type).toBe('collection');
  const urls = new Set(b.entry.map((e) => e.fullUrl));
  expect(urls.size).toBe(b.entry.length); // ids are unique
  for (const e of b.entry) {
    expect(e.fullUrl).toBe(`urn:uuid:${e.resource.id}`);
    expect(['Patient', 'Observation', 'MedicationStatement', 'MedicationAdministration']).toContain(e.resource.resourceType);
  }
  // every reference anywhere in the bundle points to a resource in it
  const refs: string[] = [];
  const walk = (x: unknown) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) { if (k === 'reference') refs.push(String(v)); else walk(v); }
  };
  walk(b.entry.map((e) => e.resource));
  expect(refs.length).toBeGreaterThan(0);
  for (const r of refs) expect(urls.has(r)).toBe(true);
}

test('FHIR bundle from the demo: structure, references, sleep and dose codes', async () => {
  const input = await loadFhirInput(repo.db, profile, FROM, TO, t);
  expect(input.episodes.length).toBeGreaterThan(0);
  const b = buildFhirBundle(input, { includeNickname: false, now: NOW });
  checkBundle(b);
  const byType = (type: string) => b.entry.map((e) => e.resource).filter((r) => r.resourceType === type);
  expect(byType('Patient')).toHaveLength(1);
  expect(byType('Patient')[0].name).toBeUndefined();
  const episodes = byType('Observation').filter((o) => JSON.stringify(o.code).includes('distress-episode'));
  expect(episodes).toHaveLength(input.episodes.length);
  expect(JSON.stringify(episodes[0].code)).toContain(EMOLENS_CODE_SYSTEM);
  const sleep = byType('Observation').filter((o) => JSON.stringify(o.code).includes('93832-4'));
  expect(sleep).toHaveLength(input.sleep.length);
  const q = sleep[0].valueQuantity as { unit: string; system: string; code: string; value: number };
  expect(q).toMatchObject({ unit: 'h', system: UCUM, code: 'h' });
  expect(JSON.stringify(sleep[0].code)).toContain(LOINC);
  expect(byType('MedicationStatement').length).toBe(input.medications.length);
  for (const a of byType('MedicationAdministration')) expect(['completed', 'not-done']).toContain(a.status);
  expect(JSON.parse(JSON.stringify(b))).toEqual(b);
});

test('FHIR: a new Patient id every export; the nickname only when asked', async () => {
  const input = await loadFhirInput(repo.db, profile, FROM, TO, t);
  const a = buildFhirBundle(input, { includeNickname: false, now: NOW });
  const b = buildFhirBundle(input, { includeNickname: true, now: NOW });
  expect(a.entry[0].resource.id).not.toBe(b.entry[0].resource.id);
  expect(JSON.stringify(a)).not.toContain(profile.nickname);
  expect(b.entry[0].resource.name).toEqual([{ text: profile.nickname }]);
});

test('FHIR mapping on hand-built data: periods, components, dose statuses, birth year only', () => {
  const inp: FhirInput = {
    nickname: 'Sam', birthYear: 2017, tz: 'America/Chicago',
    episodes: [{ id: 'e1', startedAt: Date.parse('2026-09-20T15:00:00Z'), durationMin: 12, type: 'shutdown', intensity: 4, placeType: 'school', before: 'Transition', notes: null }],
    sleep: [{ sleepStart: Date.parse('2026-09-19T01:00:00Z'), sleepEnd: Date.parse('2026-09-19T10:30:00Z'), durationMin: 570 }],
    medications: [{ id: 'm1', name: 'Medication A', rxcui: '12345', strength: '5 mg', form: 'tablet', asNeeded: false, times: ['08:00'], activeFrom: '2026-01-01', activeTo: null }],
    doses: [
      { medicationId: 'm1', scheduledFor: Date.parse('2026-09-20T12:00:00Z'), takenAt: Date.parse('2026-09-20T12:10:00Z'), status: 'taken' },
      { medicationId: 'm1', scheduledFor: Date.parse('2026-09-21T12:00:00Z'), takenAt: null, status: 'missed' },
      { medicationId: 'm1', scheduledFor: Date.parse('2026-09-22T12:00:00Z'), takenAt: null, status: 'pending' },
    ],
    typeLabel: { meltdown: 'Meltdown', shutdown: 'Shutdown', other: 'Other' },
  };
  let n = 0;
  const b = buildFhirBundle(inp, { includeNickname: false, now: NOW, newId: () => `id-${++n}` });
  checkBundle(b);
  const [patient, ep, sleep, stmt, given, missed] = b.entry.map((e) => e.resource);
  expect(patient).toEqual({ resourceType: 'Patient', id: 'id-1', birthDate: '2017' });
  expect(ep.effectivePeriod).toEqual({ start: '2026-09-20T15:00:00.000Z', end: '2026-09-20T15:12:00.000Z' });
  expect(JSON.stringify(ep.component)).toContain('"valueInteger":4');
  expect(JSON.stringify(ep.component)).toContain('"valueString":"school"');
  expect(ep.note).toEqual([{ text: 'Transition' }]);
  expect((sleep.valueQuantity as { value: number }).value).toBe(9.5);
  expect(stmt).toMatchObject({ status: 'active', dosage: [{ text: '5 mg tablet at 08:00' }] });
  expect(JSON.stringify(stmt.medicationCodeableConcept)).toContain('"code":"12345"');
  expect(given).toMatchObject({ resourceType: 'MedicationAdministration', status: 'completed', effectiveDateTime: '2026-09-20T12:10:00.000Z' });
  expect(missed).toMatchObject({ status: 'not-done', statusReason: [{ text: 'Missed' }] });
  expect(b.entry).toHaveLength(6); // the pending dose is left out
});

test('FHIR: a medication ending today is still active at 10:47 PM in Los Angeles (already tomorrow in UTC)', () => {
  const inp = (tz: string): FhirInput => ({
    nickname: 'Sam', birthYear: null, tz, episodes: [], sleep: [], doses: [],
    medications: [{ id: 'm1', name: 'Medication A', rxcui: null, strength: null, form: null, asNeeded: false, times: ['08:00'], activeFrom: '2026-09-01', activeTo: '2026-10-01' }],
    typeLabel: { meltdown: 'Meltdown', shutdown: 'Shutdown', other: 'Other' },
  });
  const status = (tz: string) => buildFhirBundle(inp(tz), { includeNickname: false, now: Date.parse('2026-10-02T05:47:00Z') }).entry[1].resource.status;
  expect(status('America/Los_Angeles')).toBe('active');
  expect(status('UTC')).toBe('completed');
});

// ---------------------------------------------------------------- ABC CSV

test('ABC CSV: BOM, exact header, one row per hard moment, automatic antecedents', async () => {
  const rows = await loadAbcRows(repo.db, profile, FROM, TO, t, 'en');
  const n = await all(repo.db, 'SELECT id FROM episodes WHERE deleted_at IS NULL AND started_at >= ?', [new Date(Date.parse(`${FROM}T04:00:00Z`)).toISOString()]);
  expect(rows).toHaveLength(n.length);
  const csv = buildAbcCsv(rows);
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  const lines = csv.slice(1).split('\r\n');
  expect(lines[0]).toBe('date,start_time,duration_min,setting,antecedent_auto,antecedent_caregiver,behavior,intensity,consequence_and_support,outcome,logged_by_role');
  expect(lines.at(-1)).toBe('');
  expect(rows[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(rows[0].start_time).toMatch(/^\d{2}:\d{2}$/);
  // the demo's planted patterns show up as automatic antecedents on some hard moments
  expect(rows.filter((r) => String(r.antecedent_auto).length > 0).length).toBeGreaterThan(0);
  expect(rows.every((r) => !/(Middays|Afternoons|Evenings) tend/.test(String(r.antecedent_auto)))).toBe(true);
});

test('ABC CSV quoting (RFC 4180): commas, quotes and line breaks', () => {
  expect(csvField('plain')).toBe('plain');
  expect(csvField('a, b')).toBe('"a, b"');
  expect(csvField('say "hi"')).toBe('"say ""hi"""');
  expect(csvField('two\nlines')).toBe('"two\nlines"');
  expect(csvField(null)).toBe('');
  expect(csvField(3)).toBe('3');
  const row = Object.fromEntries(ABC_COLUMNS.map((c) => [c, c === 'antecedent_caregiver' ? 'Loud, "busy" room' : ''])) as Parameters<typeof buildAbcCsv>[0][number];
  expect(buildAbcCsv([row]).split('\r\n')[1]).toBe(',,,,,"Loud, ""busy"" room",,,,,');
});

// ---------------------------------------------------------------- SVG

test('SVG generators return well-formed SVG and escape their text', () => {
  const days = Array.from({ length: 30 }, (_, i) => ({ date: addDays('2026-09-01', i), count: i % 4 }));
  const svgs = [
    calendarHeatmap(days, { title: 'Hard moments <per> day & night', weekdayLabels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], weekLabel: (d) => d }),
    rateBarChart([{ label: '8–10 am', rate: 0.2, lo: 0.1, hi: 0.35, caption: '2/10' }, { label: '<b>', rate: 0, lo: 0, hi: 0.1 }], { title: 'Time & day', format: (v) => `${Math.round(v * 100)}%` }),
    countBarChart([{ label: 'Mon', count: 2 }, { label: 'Tue & Wed', count: 0 }], { title: 'Per day' }),
    calendarHeatmap([], { title: 'empty', weekdayLabels: [], weekLabel: (d) => d }),
  ];
  for (const s of svgs) {
    const doc = parseXml(s);
    expect(doc.documentElement.nodeName).toBe('svg');
    expect(doc.getElementsByTagName('title').length).toBeGreaterThan(0);
  }
  expect(svgs[0]).toContain('Hard moments &lt;per&gt; day &amp; night');
  expect(svgs[1]).not.toContain('<b>');
  expect(esc(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

// ---------------------------------------------------------------- PDF report

test('clinician report: every section, the disclaimer, and well-formed charts', async () => {
  const data = await loadReportData(repo.db, profile, opts());
  expect(data.summary.total).toBeGreaterThan(0);
  expect(data.medications?.list.length).toBeGreaterThan(0);
  expect(data.sleep?.nights).toBeGreaterThan(0);
  const html = renderReportHtml(data, t);
  expect(html.startsWith('<!doctype html>')).toBe(true);
  expect(html).toContain(t('report.coverTitle', { name: profile.nickname }));
  expect(html).toContain(t('report.disclaimer'));
  for (const key of ['summary', 'calendar', 'timeOfDay', 'episodes', 'patterns', 'medications', 'sleep', 'strategies', 'forecast', 'glossary']) {
    expect([key, html.includes(`<h2>${esc(t(`report.${key}`))}</h2>`)]).toEqual([key, true]);
  }
  expect(html).toContain(`<h2>${esc(t('insights.worth'))}</h2>`);
  expect(html).toContain('size: letter');
  for (const svg of html.match(/<svg[\s\S]*?<\/svg>/g) ?? []) parseXml(svg);
  // no raw i18n keys left in the text
  expect(html).not.toMatch(/>\s*report\.[a-zA-Z]/);
});

test('school report: no medications, sleep, health or body-signal patterns, no place names', async () => {
  const data = await loadReportData(repo.db, profile, opts({ audience: 'school', pageSize: 'a4' }));
  expect(data.medications).toBeNull();
  expect(data.sleep).toBeNull();
  const hidden = ['sleep_deficit', 'night_wakings', 'missed_dose', 'late_dose', 'med_change_recent', 'illness', 'resting_hr_up'];
  expect(data.patterns.filter((p) => hidden.includes(p.key))).toEqual([]);
  expect(data.watch.filter((w) => w.kind === 'medication')).toEqual([]);
  expect(data.episodes.every((e) => e.placeLabel == null)).toBe(true);
  const html = renderReportHtml(data, t);
  expect(html).not.toContain('Medication A');
  expect(html).not.toContain(`<h2>${esc(t('report.medications'))}</h2>`);
  expect(html).not.toContain(`<h2>${esc(t('report.sleep'))}</h2>`);
  expect(html).not.toContain(featureLabel('sleep_deficit', 'en'));
  expect(html).not.toContain("Grandma");
  expect(html).toContain('size: A4');
  expect(sectionsFor('school')).toEqual(REPORT_SECTIONS.filter((s) => s !== 'medications' && s !== 'sleep'));
});

test('family report uses plain wording (no odds-ratio columns); notes appear only when picked', async () => {
  await repo.write((w) => w.insert('notes', { child_id: profile.id, noted_at: new Date(NOW - 3_600_000).toISOString(), text: 'Loved the <park> today & slept well', source: 'manual', audio_path: null, structured_status: 'none' }));
  const note = (await all<{ id: string }>(repo.db, 'SELECT id FROM notes'))[0];
  const without = renderReportHtml(await loadReportData(repo.db, profile, opts({ audience: 'family' })), t);
  expect(without).not.toContain('Loved the');
  expect(without).not.toContain(`<th>${esc(t('report.col.confidence'))}</th>`);
  const withNote = renderReportHtml(await loadReportData(repo.db, profile, opts({ audience: 'family', noteIds: [note.id] })), t);
  expect(withNote).toContain('Loved the &lt;park&gt; today &amp; slept well');
});

test('Spanish report: translated text, no English section names', async () => {
  const html = renderReportHtml(await loadReportData(repo.db, profile, opts({ lang: 'es' })), tFor('es'));
  expect(html).toContain('Informe de EmoLens de');
  expect(html).toContain('<html lang="es">');
  expect(html).not.toContain('<h2>Summary</h2>');
});

test('digest PDF: renders from saved digest numbers, charts well-formed', async () => {
  const digests = await listDigests(repo.db, profile.id);
  expect(digests.length).toBeGreaterThan(0);
  const html = renderDigestHtml(digests[0].stats, t, { nickname: profile.nickname, lang: 'en', size: 'letter' });
  expect(html).toContain(t('digest.pdfTitle', { name: profile.nickname }));
  for (const svg of html.match(/<svg[\s\S]*?<\/svg>/g) ?? []) parseXml(svg);
});
