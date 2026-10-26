/**
 * @jest-environment node
 * The report is shared by the phone's PDF, the portal and share links (@emolens/reports). The portal translates with a
 * small translator instead of i18next; this checks both give byte-for-byte the same report, for every audience in both
 * languages, and that a share-link snapshot made on the phone passes the portal's checks (a School one without
 * medications, sleep or places).
 */
import { SUSPECTED_TRIGGERS } from '@emolens/shared';
import { DEMO_SUSPECTED } from '@emolens/simulator';
import { AUDIENCES, parseShareSnapshot, renderReportHtml, translator } from '@emolens/reports';
import { buildDemo } from '../src/demo/build';
import { getChild, toChildProfile } from '../src/db/repo/children';
import '../src/i18n';
import { tFor } from '../src/reports/actions';
import { loadReportData } from '../src/reports/data';
import { shareSnapshot } from '../src/sync/share';
import { testRepo } from './nodeDb';

jest.setTimeout(120_000);
const NOW = Date.parse('2026-09-30T20:00:00.000Z');

test('the portal translator gives exactly the same report as the app, every audience, English and Spanish', async () => {
  const repo = await testRepo();
  await buildDemo(repo, { lang: 'en', tz: 'America/Chicago', now: NOW, days: 30, yieldToUi: false });
  const profile = toChildProfile((await getChild(repo.db))!, SUSPECTED_TRIGGERS.filter((t) => DEMO_SUSPECTED.includes(t.id)).map((t) => t.id));
  for (const lang of ['en', 'es'] as const) {
    for (const audience of AUDIENCES) {
      const data = await loadReportData(repo.db, profile, { from: '2026-09-01', to: '2026-09-30', audience, noteIds: [], lang, now: NOW, pageSize: 'letter' });
      const a = renderReportHtml(data, translator(lang)), b = renderReportHtml(data, tFor(lang));
      expect(a).toBe(b);
      // no untranslated key anywhere (BUGS.md #19: the sleep tiles showed "common.hours")
      expect(b.match(/>[a-z]+\.[a-zA-Z_.]+</g)).toBeNull();

      const snap = await shareSnapshot(repo.db, profile, { from: '2026-09-01', to: '2026-09-30', audience, days: 7, noteIds: [], lang, now: NOW });
      const parsed = parseShareSnapshot(JSON.parse(JSON.stringify(snap)));
      expect(parsed).not.toBeNull();
      if (audience === 'school') expect(parsed).not.toHaveProperty('medications');
      // what the share page draws is the same report the parent would print
      expect(renderReportHtml(parsed!, translator(lang))).toBe(renderReportHtml({ ...data, ...(audience === 'school' ? { medications: undefined, sleep: undefined } : {}) }, tFor(lang)));
    }
  }
});

test('the portal refuses a snapshot that is not an EmoLens report, or a School one with private data', async () => {
  expect(parseShareSnapshot(null)).toBeNull();
  expect(parseShareSnapshot({ version: 1, nickname: 'x' })).toBeNull();
  const repo = await testRepo();
  await buildDemo(repo, { lang: 'en', tz: 'America/Chicago', now: NOW, days: 14, yieldToUi: false });
  const profile = toChildProfile((await getChild(repo.db))!, []);
  const school = JSON.parse(JSON.stringify(await shareSnapshot(repo.db, profile, { from: '2026-09-20', to: '2026-09-30', audience: 'school', days: 7, noteIds: [], lang: 'en', now: NOW })));
  expect(parseShareSnapshot(school)).not.toBeNull();
  expect(parseShareSnapshot({ ...school, sleep: { avgHours: 9 } })).toBeNull();
  expect(parseShareSnapshot({ ...school, medications: { list: [], changes: [] } })).toBeNull();
  if (school.episodes.length) {
    expect(parseShareSnapshot({ ...school, episodes: [{ ...school.episodes[0], placeLabel: 'Home' }] })).toBeNull();
  }
  expect(parseShareSnapshot({ ...school, nickname: 42 })).toBeNull();
});
