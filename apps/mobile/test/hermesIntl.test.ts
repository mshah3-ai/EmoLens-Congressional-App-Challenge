/**
 * @jest-environment node
 * Bug (BUGS.md #11): on the phone, "Create PDF report" and "ABC data" always said "Couldn't create the file", while the
 * FHIR export worked. Cause: the phone's JavaScript engine (Hermes) has no `Intl.PluralRules`; the shared `fmt` called
 * it for plural forms ("1 planned transition"), and the PDF report (effect sentences) and the ABC export (automatic
 * antecedents) both use `fmt`; FHIR doesn't. The same call also made every forecast run on the phone fail.
 * Node has `Intl.PluralRules`, so the other tests couldn't see it. Here it is removed, like on Hermes, and every
 * feature that makes or shares a file, the forecast run and the demo build must still work.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SUSPECTED_TRIGGERS, fmt } from '@emolens/shared';
import { addDays, localDateOf } from '@emolens/engine';
import { DEMO_SUSPECTED } from '@emolens/simulator';
import { exportAll } from '../src/backup/export';
import { previewImport } from '../src/backup/import';
import { buildDemo } from '../src/demo/build';
import { getChild, toChildProfile } from '../src/db/repo/children';
import type { Repo } from '../src/db/repo/writer';
import { listDigests } from '../src/digest/generate';
import { updateForecast } from '../src/forecast/update';
import { readSnapshot } from '../src/forecast/snapshot';
import { shareAbcCsv, shareBackup, shareDigestPdf, shareFhirJson, shareReportPdf } from '../src/reports/actions';
import { testRepo } from './nodeDb';

jest.setTimeout(120_000);

const TZ = 'America/Chicago';
const intl = Intl as unknown as { PluralRules?: unknown };
const realPluralRules = intl.PluralRules;
let repo: Repo;
let profile: ReturnType<typeof toChildProfile>;

beforeAll(async () => {
  delete intl.PluralRules; // like Hermes on iOS: Intl has DateTimeFormat, NumberFormat and Collator, but no PluralRules
  repo = await testRepo();
  await buildDemo(repo, { lang: 'en', tz: TZ, days: 30, yieldToUi: false });
  profile = toChildProfile((await getChild(repo.db))!, SUSPECTED_TRIGGERS.filter((x) => DEMO_SUSPECTED.includes(x.id)).map((x) => x.id));
});
afterAll(() => { intl.PluralRules = realPluralRules; });
beforeEach(() => jest.clearAllMocks());

const today = () => localDateOf(Date.now(), TZ);
const files = (FileSystem as unknown as { __files: Map<string, string> }).__files;

test('Intl.PluralRules really is missing here, like on the phone', () => {
  expect(typeof (Intl as unknown as { PluralRules?: unknown }).PluralRules).toBe('undefined');
});

test('plural forms still work without Intl.PluralRules, in English and Spanish', () => {
  const tpl = '{n, plural, one {# planned transition} other {# planned transitions}}';
  expect(fmt(tpl, { n: 1 }, 'en')).toBe('1 planned transition');
  expect(fmt(tpl, { n: 2 }, 'en')).toBe('2 planned transitions');
  expect(fmt(tpl, { n: 0 }, 'en')).toBe('0 planned transitions');
  expect(fmt('{n, plural, one {# transición} other {# transiciones}}', { n: 1 }, 'es')).toBe('1 transición');
  expect(fmt('{n, plural, one {# transición} other {# transiciones}}', { n: 3 }, 'es')).toBe('3 transiciones');
});

test('the forecast run works (it failed on the phone since the plurals change)', async () => {
  const run = await updateForecast(repo, profile, { quiet: true });
  expect(run.result).not.toBeNull();
  const snap = await readSnapshot(repo.db, profile.id);
  expect(snap?.fitError).toBeNull();
  expect(snap?.insights.length).toBeGreaterThan(0);
});

test.each([
  ['2026-09-29..2026-09-30 (the custom range from the bug report)', '2026-09-29', '2026-09-30'],
  ['2 weeks', 'd-13', 'd'],
  ['30 days', 'd-29', 'd'],
  ['90 days', 'd-89', 'd'],
])('PDF report for every audience and the ABC file: %s', async (_name, a, b) => {
  const at = (x: string) => (x.startsWith('d') ? addDays(today(), Number(x.slice(1) || 0)) : x);
  const r = { from: at(a), to: at(b) };
  for (const audience of ['clinician', 'school', 'family'] as const) await shareReportPdf(repo.db, profile, 'en', r, audience, []);
  await shareReportPdf(repo.db, profile, 'es', r, 'clinician', []);
  await shareAbcCsv(repo.db, profile, 'en', r);
  await shareFhirJson(repo.db, profile, 'en', r, false);
  expect(Sharing.shareAsync).toHaveBeenCalledTimes(6);
});

test('digest "Share as PDF", "Export all data" and reading the backup back all work', async () => {
  const [digest] = await listDigests(repo.db, profile.id);
  expect(digest).toBeTruthy();
  await shareDigestPdf(profile, 'en', digest);
  await shareDigestPdf(profile, 'es', digest);
  await shareBackup(repo.db, TZ, 'en');
  const uri = String((Sharing.shareAsync as jest.Mock).mock.calls.at(-1)?.[0]);
  const text = files.get(uri) ?? '';
  expect((await previewImport(repo.db, text)).match).toBe('same');
  expect(JSON.parse(text).tables).toEqual(JSON.parse(JSON.stringify((await exportAll(repo.db)).tables)));
});

test('no app or engine code uses Intl features the phone lacks (PluralRules, RelativeTimeFormat, ListFormat, Segmenter, DisplayNames)', () => {
  const roots = [join(__dirname, '../src'), join(__dirname, '../app'), join(__dirname, '../../../packages/engine/src'), join(__dirname, '../../../packages/shared/src')];
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
  const offenders: string[] = [];
  for (const file of roots.flatMap(walk)) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\*|\/\/)/.test(line)) return; // comments may mention them
      if (/\bIntl\.(PluralRules|RelativeTimeFormat|ListFormat|Segmenter|DisplayNames)\b/.test(line)) offenders.push(`${file}:${i + 1}`);
    });
  }
  expect(offenders).toEqual([]);
});
