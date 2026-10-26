/**
 * @jest-environment node
 * Privacy (SPEC 7.1, 22.1): the School report for the demo family, in English and Spanish, over every date range,
 * must contain no medication name, the word "medication", nothing about sleep, no prescriber sentence, and no home or
 * other place outside school. The Clinician report of the same family must trip the same check (so the check works).
 * By default the School report and share link also contain only school-time hard moments (BUGS #23, end of file).
 */
import { SCHOOL_HOURS, SUSPECTED_TRIGGERS } from '@emolens/shared';
import { addDays, isoWeekday, localDateOf, localMinuteOf, zonedToUtc } from '@emolens/engine';
import { DEMO_SUSPECTED } from '@emolens/simulator';
import { buildDemo } from '../src/demo/build';
import { getChild, toChildProfile } from '../src/db/repo/children';
import type { Repo } from '../src/db/repo/writer';
import { all, one } from '../src/db/types';
import { iso } from '../src/db/time';
import { readSnapshot } from '../src/forecast/snapshot';
import '../src/i18n';
import { tFor } from '../src/reports/actions';
import { loadReportData } from '../src/reports/data';
import { parseShareSnapshot, renderReportHtml, schoolBlockIndices } from '@emolens/reports';
import { shareSnapshot } from '../src/sync/share';
import { findSchoolLeaks, type FamilyFacts } from './privacyChecks';
import { testRepo } from './nodeDb';

jest.setTimeout(120_000);

const TZ = 'America/Chicago';
const NOW = Date.parse('2026-09-30T20:00:00.000Z');
let repo: Repo;
let profile: ReturnType<typeof toChildProfile>;
let facts: FamilyFacts;

beforeAll(async () => {
  repo = await testRepo();
  await buildDemo(repo, { lang: 'en', tz: TZ, now: NOW, yieldToUi: false }); // the full 120-day demo
  profile = toChildProfile((await getChild(repo.db))!, SUSPECTED_TRIGGERS.filter((x) => DEMO_SUSPECTED.includes(x.id)).map((x) => x.id));
  facts = {
    medications: (await all<{ name: string }>(repo.db, 'SELECT name FROM medications')).map((m) => m.name),
    placesOutsideSchool: (await all<{ label: string }>(repo.db, "SELECT label FROM places WHERE type <> 'school'")).map((p) => p.label),
  };
  // the demo family really has these, so the check is meaningful
  expect(facts.medications.length).toBeGreaterThan(0);
  expect(facts.placesOutsideSchool).toEqual(expect.arrayContaining(['Home', "Grandma's"]));

  // Make the family realistic for this check: hard moments logged at home and at Grandma's, and an engine result in
  // which Grandma's is "worth watching" and the therapy and relatives' place patterns were found.
  const place = async (label: string) => (await one<{ id: string; type: string }>(repo.db, 'SELECT id, type FROM places WHERE label = ?', [label]))!;
  for (const [label, hoursAgo] of [['Home', 30], ["Grandma's", 54]] as const) {
    const p = await place(label);
    await repo.write((w) => w.insert('episodes', { child_id: profile.id, started_at: iso(NOW - hoursAgo * 3_600_000), duration_min: 15, type: 'meltdown',
      intensity: 3, place_id: p.id, place_type: p.type, antecedent_tags: '["transition"]', antecedent_note: null, behavior_tags: '[]', safety_concern: 0,
      notes: null, details_complete: 1, source: 'manual' }));
  }
  const snap = (await readSnapshot(repo.db, profile.id))!;
  const grandma = await place("Grandma's");
  snap.worthWatching.push({ id: `place:${grandma.id}`, kind: 'place', label: "Grandma's", nExposed: 30, kExposed: 9, pAbove: 0.97, median: 2.1, lo80: 1.4, hi80: 3.2, shown: true });
  const base = snap.insights.find((i) => i.key === 'planned_transitions') ?? snap.insights[0];
  for (const key of ['place_therapy_medical', 'place_other']) {
    snap.insights = snap.insights.filter((i) => i.key !== key);
    snap.insights.push({ ...base, key, status: 'likely', rawStatus: 'likely' });
  }
  await repo.db.execute('UPDATE engine_snapshots SET result_json = ? WHERE child_id = ?', [JSON.stringify(snap), profile.id]);
});

const report = async (audience: 'school' | 'clinician', lang: 'en' | 'es', days: number) => {
  const to = localDateOf(NOW, TZ);
  const data = await loadReportData(repo.db, profile, { from: addDays(to, -(days - 1)), to, audience, noteIds: [], lang, now: NOW, pageSize: 'letter' });
  return renderReportHtml(data, tFor(lang));
};

test.each([
  ['English, 14 days', 'en', 14], ['English, 30 days', 'en', 30], ['English, 90 days', 'en', 90],
  ['Spanish, 30 days', 'es', 30], ['Spanish, 90 days', 'es', 90],
] as const)('School report has nothing private: %s', async (_name, lang, days) => {
  const html = await report('school', lang, days);
  expect(html).toContain(tFor(lang)('report.audience.school'));
  expect(findSchoolLeaks(html, facts)).toEqual([]);
});

test('the check catches leaks: the Clinician report of the same family trips it', async () => {
  const leaks = findSchoolLeaks(await report('clinician', 'en', 90), facts);
  expect(leaks).toEqual(expect.arrayContaining([
    expect.stringMatching(/^medication name/), expect.stringMatching(/^the word "medication"/), expect.stringMatching(/^sleep/),
    expect.stringMatching(/^place name: "Grandma's"/), expect.stringMatching(/^a kind of place outside school/),
  ]));
});

// BUGS #23: even a date and a time can tell the school about home life. By default a School report and a School share
// link contain only hard moments during school hours on school days, or logged at school; every number agrees.
describe('School: only school time (BUGS #23)', () => {
  const MARK = { late: 'MARKER-LATE-NIGHT', weekend: 'MARKER-SATURDAY', atSchool: 'MARKER-AT-SCHOOL', inClass: 'MARKER-IN-CLASS' };
  const at = (date: string, hhmm: string) => zonedToUtc(date, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), TZ);
  beforeAll(async () => {
    const school = (await one<{ id: string }>(repo.db, "SELECT id FROM places WHERE type = 'school'"))!;
    const add = (startedAt: number, note: string, placeId: string | null, placeType: string | null) => repo.write((w) => w.insert('episodes', {
      child_id: profile.id, started_at: iso(startedAt), duration_min: 12, type: 'meltdown', intensity: 3, place_id: placeId, place_type: placeType,
      antecedent_tags: '[]', antecedent_note: note, behavior_tags: '[]', safety_concern: 0, notes: null, details_complete: 1, source: 'manual' }));
    await add(at('2026-09-23', '23:00'), MARK.late, null, null); // Wednesday, 11 PM at home
    await add(at('2026-09-26', '10:00'), MARK.weekend, null, null); // Saturday morning
    await add(at('2026-09-24', '16:30'), MARK.atSchool, school.id, 'school'); // after hours, but at school
    await add(at('2026-09-24', '10:00'), MARK.inClass, null, null); // Thursday, school hours
  });
  const load = (audience: 'school' | 'clinician', lang: 'en' | 'es', schoolOnly?: boolean) =>
    loadReportData(repo.db, profile, { from: '2026-09-17', to: '2026-09-30', audience, noteIds: [], lang, now: NOW, pageSize: 'letter', schoolOnly });

  test.each(['en', 'es'] as const)('the School report (%s) leaves out the 11 PM and Saturday hard moments everywhere, and its numbers agree', async (lang) => {
    const data = await load('school', lang);
    expect(data.schoolOnly).toBe(true);
    const html = renderReportHtml(data, tFor(lang));
    expect(html).not.toContain(MARK.late);
    expect(html).not.toContain(MARK.weekend);
    expect(html).toContain(MARK.atSchool);
    expect(html).toContain(MARK.inClass);
    expect(html).toContain(tFor(lang)('report.schoolOnlyNote'));
    for (const e of data.episodes) {
      const m = localMinuteOf(e.startedAt, TZ);
      const weekday = isoWeekday(localDateOf(e.startedAt, TZ));
      expect(e.antecedentNote === MARK.atSchool || (profile.schoolDays.includes(weekday) && m >= SCHOOL_HOURS.start && m < SCHOOL_HOURS.end)).toBe(true);
    }
    // the summary, calendar and chart count the same hard moments as the table
    expect(data.summary.total).toBe(data.episodes.length);
    expect(data.summary.perDay.reduce((n, d) => n + d.count, 0)).toBe(data.episodes.length);
    expect(data.summary.perDay.find((d) => d.date === '2026-09-26')?.count).toBe(0);
    expect(data.timeOfDay.every((r) => schoolBlockIndices().includes(r.index))).toBe(true);
  });

  test('turned off, the School report includes them (still with no places); other audiences are unchanged', async () => {
    const off = renderReportHtml(await load('school', 'en', false), tFor('en'));
    expect(off).toContain(MARK.late);
    expect(off).toContain(MARK.weekend);
    expect(findSchoolLeaks(off, facts)).toEqual([]);
    const clinician = await load('clinician', 'en');
    expect(clinician.schoolOnly).toBeUndefined();
    expect(renderReportHtml(clinician, tFor('en'))).toContain(MARK.late);
  });

  test('the School share-link snapshot follows the same rule', async () => {
    const snap = JSON.stringify(await shareSnapshot(repo.db, profile, { from: '2026-09-17', to: '2026-09-30', audience: 'school', days: 7, noteIds: [], lang: 'en', now: NOW }));
    expect(snap).not.toContain(MARK.late);
    expect(snap).not.toContain(MARK.weekend);
    expect(snap).toContain(MARK.inClass);
    const parsed = parseShareSnapshot(JSON.parse(snap))!;
    expect(parsed.schoolOnly).toBe(true);
    expect(renderReportHtml(parsed, tFor('en'))).not.toContain(MARK.late);
    const off = JSON.stringify(await shareSnapshot(repo.db, profile, { from: '2026-09-17', to: '2026-09-30', audience: 'school', days: 7, noteIds: [], lang: 'en', now: NOW, schoolOnly: false }));
    expect(off).toContain(MARK.late);
  });
});
