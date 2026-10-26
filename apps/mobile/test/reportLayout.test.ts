/**
 * @jest-environment node
 * Fixes from the Phase 6 hand test (2026-09-30), each checked on the demo family's real report:
 *  1. every export gets its own file name (iOS "Save to Files" refused a second file with the same name);
 *  2. "How precisely known" is shown once as a percent (39%, not 3900%), the same as on the app screens;
 *  3. no section heading is left alone at the bottom of a page (sections are kept together, tables start a page);
 *  4. the calendar heatmap's week labels don't overlap;
 *  5. an effect of about 1.0x reads "About the same chance", never "About 0% lower chance";
 *  6. calendar tags in "worth watching" show their label ("Transitions"), never the stored key in quotes.
 */
import { DOMParser } from '@xmldom/xmldom';
import { SUSPECTED_TRIGGERS, type Lang } from '@emolens/shared';
import { addDays, localDateOf } from '@emolens/engine';
import { DEMO_SUSPECTED } from '@emolens/simulator';
import { buildDemo } from '../src/demo/build';
import { getChild, toChildProfile } from '../src/db/repo/children';
import type { Repo } from '../src/db/repo/writer';
import { readSnapshot } from '../src/forecast/snapshot';
import '../src/i18n';
import { tFor } from '../src/reports/actions';
import { AUDIENCES, loadReportData, type Audience } from '../src/reports/data';
import { abcCsvName, backupJsonName, digestPdfName, fhirJsonName, reportPdfName } from '../src/reports/fileNames';
import { precisionPct, watchItemName } from '@emolens/reports';
import { safeFileName } from '../src/reports/share';
import { LABEL_CHAR_PX, calendarHeatmap } from '@emolens/reports';
import { renderReportHtml } from '@emolens/reports';
import en from '@emolens/shared/i18n/en.json';
import es from '@emolens/shared/i18n/es.json';
import { testRepo } from './nodeDb';

jest.setTimeout(120_000);

const TZ = 'America/Chicago';
const NOW = Date.parse('2026-09-30T20:00:00.000Z');
const TO = localDateOf(NOW, TZ);
let repo: Repo;
let profile: ReturnType<typeof toChildProfile>;

beforeAll(async () => {
  repo = await testRepo();
  await buildDemo(repo, { lang: 'en', tz: TZ, now: NOW, yieldToUi: false });
  profile = toChildProfile((await getChild(repo.db))!, SUSPECTED_TRIGGERS.filter((x) => DEMO_SUSPECTED.includes(x.id)).map((x) => x.id));
});

const html = async (audience: Audience, lang: Lang = 'en', days = 30) => renderReportHtml(await loadReportData(repo.db, profile,
  { from: addDays(TO, -(days - 1)), to: TO, audience, noteIds: [], lang, now: NOW, pageSize: 'letter' }), tFor(lang));

test('1. every export has its own file name (after cleaning), and PDF names include the audience', () => {
  const names: string[] = [];
  const ranges = [[addDays(TO, -13), TO], [addDays(TO, -29), TO], ['2026-09-29', '2026-09-30']];
  for (const lang of ['en', 'es'] as const) {
    for (const [from, to] of ranges) {
      for (const a of AUDIENCES) names.push(reportPdfName('Sam (demo)', tFor(lang)(`report.audience.${a}`), from, to));
      names.push(abcCsvName(from, to, lang), fhirJsonName(from, to, false, lang), fhirJsonName(from, to, true, lang));
    }
    names.push(digestPdfName('Sam (demo)', '2026-09-21', lang), digestPdfName('Sam (demo)', '2026-09-14', lang));
  }
  names.push(backupJsonName('2026-09-30', '14:32'), backupJsonName('2026-09-30', '14:40'));
  const cleaned = names.map(safeFileName);
  expect(new Set(cleaned).size).toBe(cleaned.length);
  expect(safeFileName(reportPdfName('Sam (demo)', 'School', '2026-09-01', '2026-09-30'))).toBe('EmoLens-Sam-demo-School-2026-09-01-to-2026-09-30.pdf');
  expect(safeFileName(reportPdfName('Sam (demo)', es.report.audience.clinician, '2026-09-01', '2026-09-30'))).toBe('EmoLens-Sam-demo-Profesional-clínico-2026-09-01-to-2026-09-30.pdf');
});

test('2. "How precisely known" is the engine number with one % sign, and no percentage in the report is over 100%', async () => {
  const snap = (await readSnapshot(repo.db, profile.id))!;
  const page = await html('clinician');
  const shown = snap.insights.filter((i) => ['strong', 'likely', 'possible', 'protective', 'no_clear_link'].includes(i.status));
  expect(shown.length).toBeGreaterThan(0);
  for (const i of shown) expect(page).toContain(`<td>${precisionPct(i.confidence)}</td>`);
  const pcts = [...page.matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
  expect(pcts.length).toBeGreaterThan(0);
  expect(Math.max(...pcts)).toBeLessThanOrEqual(100);
  expect(precisionPct(39)).toBe('39%');
  expect(precisionPct(0)).toBe('0%');
});

test('3. every heading starts a page (tables) or is kept together with its content; charts are never split', async () => {
  for (const a of AUDIENCES) {
    const page = await html(a);
    const doc = new DOMParser().parseFromString(page.replace(/^<!doctype html>/i, ''), 'text/html');
    const headings = Array.from(doc.getElementsByTagName('h2'));
    expect(headings.length).toBeGreaterThan(8);
    for (const h of headings) {
      const sec = h.parentNode as Element;
      expect([h.textContent, sec.nodeName.toLowerCase(), sec.getAttribute('class')]).toEqual([h.textContent, 'section', expect.stringMatching(/^(keep|break)$/)]);
      if (sec.getAttribute('class') === 'break') expect([h.textContent, sec.getElementsByTagName('table').length > 0 || h.textContent === tFor('en')('report.glossary')]).toEqual([h.textContent, true]);
      if (sec.getElementsByTagName('svg').length) expect(sec.getAttribute('class')).toBe('keep');
    }
  }
  expect(await html('clinician')).toMatch(/h2 \{[^}]*page-break-after: avoid/);
});

test('4. heatmap week labels never overlap (2 weeks, 30 days, 90 days, long labels)', () => {
  for (const [days, label] of [[14, (d: string) => d.slice(5)], [30, () => 'Sep 14'], [90, () => 'sept 14'], [30, () => '14 sept.']] as const) {
    const perDay = Array.from({ length: days }, (_, i) => ({ date: addDays(TO, i - days + 1), count: i % 3 }));
    const svg = calendarHeatmap(perDay, { title: 't', weekdayLabels: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], weekLabel: label });
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const labels = Array.from(doc.getElementsByTagName('text')).filter((t) => t.getAttribute('y') === '11')
      .map((t) => ({ x: Number(t.getAttribute('x')), w: (t.textContent ?? '').length * LABEL_CHAR_PX }));
    expect(labels.length).toBeGreaterThan(0);
    for (let i = 1; i < labels.length; i++) expect(labels[i].x - labels[i - 1].x).toBeGreaterThanOrEqual(labels[i - 1].w + 4);
  }
});

test('5. no "0% lower" in any report, in either language', async () => {
  for (const lang of ['en', 'es'] as const) {
    const page = await html('clinician', lang, 90);
    expect(page).not.toMatch(/About 0% lower|Alrededor de 0% menos/);
  }
});

test('6. calendar tags show their label, in both languages; the sentence has no quoted key', async () => {
  for (const [lang, dict] of [['en', en], ['es', es]] as const) {
    for (const key of Object.keys(en.watch.tags)) {
      const name = watchItemName({ kind: 'calendar_tag', label: key }, tFor(lang));
      expect(name).toBe((dict.watch.tags as Record<string, string>)[key]);
      expect(name).not.toBe(key);
      expect(name.charAt(0)).toBe(name.charAt(0).toLocaleUpperCase());
    }
    expect(dict.watch.calendar_tag_other).not.toMatch(/"\{\{item\}\}"/);
  }
  expect(watchItemName({ kind: 'food', label: 'pizza' }, tFor('en'))).toBe('pizza');

  // In a real report: a family where "transition" events stand out
  const snap = (await readSnapshot(repo.db, profile.id))!;
  snap.worthWatching.push({ id: 'tag:transition', kind: 'calendar_tag', label: 'transition', nExposed: 40, kExposed: 12, pAbove: 0.96, median: 1.8, lo80: 1.3, hi80: 2.6, shown: true });
  await repo.db.execute('UPDATE engine_snapshots SET result_json = ? WHERE child_id = ?', [JSON.stringify(snap), profile.id]);
  const page = await html('clinician');
  expect(page).toContain('calendar events tagged Transitions');
  expect(page).not.toMatch(/&quot;transition&quot;|"transition"/);
  expect(await html('clinician', 'es')).toContain('marcados como Transiciones');
});

test('7. the hard-moments table keeps each date, time and duration on one line (both languages, every audience)', async () => {
  for (const lang of ['en', 'es'] as const) {
    for (const a of AUDIENCES) {
      const page = await html(a, lang);
      expect(page).toContain('.nowrap { white-space: nowrap; }');
      const doc = new DOMParser().parseFromString(page.replace(/^<!doctype html>/, ''), 'text/html');
      const tables = Array.from(doc.getElementsByTagName('table'));
      const heads = (tb: (typeof tables)[number]) => Array.from(tb.getElementsByTagName('th')).map((th) => th.textContent);
      const episodes = tables.find((tb) => heads(tb)[0] === tFor(lang)('report.col.date'))!;
      expect(episodes).toBeTruthy();
      const rows = Array.from(episodes.getElementsByTagName('tr')).slice(1);
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        const cells = Array.from(r.getElementsByTagName('td'));
        expect([0, 1, 4].map((i) => cells[i].getAttribute('class'))).toEqual(['nowrap', 'nowrap', 'nowrap']);
        expect(cells[2].getAttribute('class')).toBeFalsy();
      }
    }
  }
});
