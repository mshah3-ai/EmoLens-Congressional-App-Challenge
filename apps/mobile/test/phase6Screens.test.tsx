/**
 * Phase 6 screens with real data (a 30-day simulated family in a real SQLite database; printing, sharing and the file
 * picker are the Jest fakes from setup.ts):
 *  - Reports: "Create PDF" prints the report HTML and opens the share sheet; the School audience lists no medications or
 *    sleep; the ABC file is a CSV with a byte-order mark.
 *  - Weekly digests: the list opens a digest with its summary; "Share as PDF" works.
 *  - The weekly digest is made once, only after Sunday 18:00 in the child's time zone, with one notification.
 *  - Privacy: "Export all data" shares a JSON backup, and importing that same file back adds nothing new.
 *  - A new phone: Welcome → "Restore from a backup" brings the child back and finishes onboarding.
 *  - The digest summary sentences (Appendix B.8) in English and Spanish.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as Notifications from 'expo-notifications';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { zonedToUtc } from '@emolens/engine';
import { buildDemo } from '../src/demo/build';
import { getChild, toChildProfile } from '../src/db/repo/children';
import { completeOnboarding } from '../src/db/repo/onboarding';
import { getAllSettings } from '../src/db/repo/settings';
import type { Repo } from '../src/db/repo/writer';
import { all } from '../src/db/types';
import { ensureDigest, listDigests } from '../src/digest/generate';
import { exportAll } from '../src/backup/export';
import { templateNarrative } from '../src/digest/narrative';
import { tFor } from '../src/reports/actions';
import { freshDraft } from '../src/store/onboarding';
import { useSession } from '../src/store/session';
import Reports from '../app/reports/index';
import Digest from '../app/digest/[weekStart]';
import Digests from '../app/settings/digests';
import Privacy from '../app/settings/privacy';
import Welcome from '../app/(onboarding)/index';
import Restore from '../app/(onboarding)/restore';
import en from '@emolens/shared/i18n/en.json';
import es from '@emolens/shared/i18n/es.json';
import { useToast } from '../src/ui/Toast';
import { testRepo } from './nodeDb';

jest.setTimeout(120_000);

const TZ = 'America/New_York';
const files = (FileSystem as unknown as { __files: Map<string, string> }).__files;
const shared = () => (Sharing.shareAsync as jest.Mock).mock.calls.map((c) => String(c[0]));
let repo: Repo;

beforeAll(async () => {
  repo = await testRepo();
  await buildDemo(repo, { lang: 'en', tz: TZ, days: 30, yieldToUi: false });
});
beforeEach(async () => {
  jest.clearAllMocks();
  await useSession.getState().useRepoForTests(repo);
});

test('Reports: the PDF is printed from the report HTML and shared; School leaves out medications and sleep', async () => {
  await renderRouter({ 'reports/index': Reports }, { initialUrl: '/reports' });
  await screen.findByTestId('reports-screen');
  await waitFor(() => expect(screen.getByTestId('report-range-text').props.children).toMatch(/hard moments?$/));
  expect(screen.getByTestId('report-sections').props.children).toContain('medications');

  await fireEvent.press(screen.getByTestId('report-pdf'));
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
  const html = (Print.printToFileAsync as jest.Mock).mock.calls[0][0].html as string;
  expect(html).toContain('EmoLens report for Sam (demo)');
  expect(shared()[0]).toMatch(/\.pdf$/);

  await fireEvent.press(screen.getByTestId('report-audience-school'));
  expect(screen.getByTestId('report-sections').props.children).not.toContain('medications');
  expect(screen.getByTestId('report-sections').props.children).not.toContain('sleep');
  await fireEvent.press(screen.getByTestId('report-pdf'));
  await waitFor(() => expect(Print.printToFileAsync).toHaveBeenCalledTimes(2));
  const school = (Print.printToFileAsync as jest.Mock).mock.calls[1][0].html as string;
  expect(school).not.toContain('Medication A');
  expect(school).not.toContain(`<h2>${en.report.medications}</h2>`);
  // each audience gets its own file name, so "Save to Files" keeps both (hand test, 2026-09-30)
  const [clinicianPdf, schoolPdf] = shared();
  expect(clinicianPdf).toMatch(/EmoLens-Sam-demo-Clinician-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.pdf$/);
  expect(schoolPdf).toMatch(/EmoLens-Sam-demo-School-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.pdf$/);
});

test('Reports: the ABC data file is a CSV with a byte-order mark; FHIR is JSON', async () => {
  await renderRouter({ 'reports/index': Reports }, { initialUrl: '/reports' });
  await fireEvent.press(await screen.findByTestId('report-csv'));
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(1));
  const csvUri = shared()[0];
  expect(csvUri).toMatch(/emolens-abc-.*\.csv$/);
  expect(files.get(csvUri)?.startsWith('\uFEFFdate,start_time,')).toBe(true);

  await fireEvent.press(screen.getByTestId('report-fhir'));
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(2));
  const bundle = JSON.parse(files.get(shared()[1]) ?? '{}');
  expect(bundle.resourceType).toBe('Bundle');
  expect(JSON.stringify(bundle)).not.toContain('Sam (demo)'); // the nickname switch is off by default
});

test('Weekly digests: the list opens a digest with its summary, and it shares as a PDF', async () => {
  const p = toChildProfile((await getChild(repo.db))!, []);
  const digests = await listDigests(repo.db, p.id);
  expect(digests.length).toBeGreaterThan(0);
  const latest = digests[0];
  await renderRouter({ 'settings/digests': Digests, 'digest/[weekStart]': Digest }, { initialUrl: '/settings/digests' });
  await fireEvent.press(await screen.findByTestId(`digest-row-${latest.weekStart}`));
  const narrative = await screen.findByTestId('digest-narrative');
  expect(narrative).toBeTruthy();
  expect(await screen.findByText(new RegExp(`^Sam \\(demo\\) had (no|\\d+) hard moments?`))).toBeTruthy();
  await fireEvent.press(screen.getByTestId('digest-share'));
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
  expect((Print.printToFileAsync as jest.Mock).mock.calls[0][0].html).toContain('EmoLens weekly digest for Sam (demo)');
});

test('the weekly digest is made once, only after Sunday 18:00 in the child\'s time zone, with one notification', async () => {
  const r = await testRepo();
  await completeOnboarding(r, { ...freshDraft(), child: { ...freshDraft().child, nickname: 'Alex', homeTz: TZ } });
  const child = toChildProfile((await getChild(r.db))!, []);
  await r.write((w) => w.insert('episodes', { child_id: child.id, started_at: '2026-09-16T19:00:00.000Z', duration_min: 10, type: 'meltdown', intensity: 3,
    place_id: null, place_type: null, antecedent_tags: '[]', antecedent_note: null, behavior_tags: '[]', safety_concern: 0, notes: null, details_complete: 1, source: 'manual' }));
  const settings = await getAllSettings(r.db);
  const sunday1800 = zonedToUtc('2026-09-20', 18 * 60, TZ);

  // Sunday 17:59: the week of Sep 14 isn't due yet (the week before had no data, so nothing is made)
  expect(await ensureDigest(r, child, settings, null, sunday1800 - 60_000)).toBeNull();
  expect(await listDigests(r.db, child.id)).toHaveLength(0);
  // 18:01: made, with one notification that opens it
  expect(await ensureDigest(r, child, settings, null, sunday1800 + 60_000)).toBe('2026-09-14');
  const call = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.find((c) => c[0].identifier === 'digest-2026-09-14');
  expect(call?.[0].content.body).toBe("Alex's weekly digest is ready.");
  expect(call?.[0].content.data.url).toBe('/digest/2026-09-14');
  // later runs don't make it again
  expect(await ensureDigest(r, child, settings, null, sunday1800 + 3_600_000)).toBeNull();
  const saved = await listDigests(r.db, child.id);
  expect(saved).toHaveLength(1);
  expect(saved[0].stats.episodes.total).toBe(1);
  expect(saved[0].narrative).toBeNull();
});

test('Privacy: "Export all data" shares a JSON backup; importing it back adds nothing new', async () => {
  await renderRouter({ 'settings/privacy': Privacy }, { initialUrl: '/settings/privacy' });
  await fireEvent.press(await screen.findByTestId('backup-export'));
  await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
  const uri = shared()[0];
  expect(uri).toMatch(/emolens-export-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
  const before = (await all(repo.db, 'SELECT id FROM episodes')).length;

  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({ canceled: false, assets: [{ uri, name: 'backup.json', lastModified: 0 }] });
  await fireEvent.press(screen.getByTestId('backup-choose'));
  expect(await screen.findByTestId('backup-preview')).toBeTruthy();
  expect(screen.getByText('Backup of Sam (demo)')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('backup-import'));
  await waitFor(() => expect(screen.queryByTestId('backup-preview')).toBeNull());
  expect((await all(repo.db, 'SELECT id FROM episodes')).length).toBe(before);
  // nothing new: a friendly sentence instead of "Imported: 0 new, 0 updated."
  expect(useToast.getState().message).toBe('Everything in this backup is already on this phone. Nothing was duplicated.');
  expect(es.backup.nothingNew).toBe('Todo lo de esta copia de seguridad ya está en este teléfono. No se duplicó nada.');
});

test('new phone: Welcome → "Restore from a backup" brings the child back and finishes onboarding', async () => {
  const text = JSON.stringify(await exportAll(repo.db));
  files.set('file:///cache/picked.json', text);
  const fresh = await testRepo();
  await useSession.getState().useRepoForTests(fresh);
  expect(useSession.getState().status).toBe('onboarding');

  await renderRouter({ '(onboarding)/index': Welcome, '(onboarding)/restore': Restore }, { initialUrl: '/' });
  await fireEvent.press(await screen.findByTestId('welcome-restore'));
  await screen.findByTestId('restore-screen');
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///cache/picked.json', name: 'picked.json', lastModified: 0 }] });
  await fireEvent.press(screen.getByTestId('backup-choose'));
  expect(await screen.findByText(en.backup.freshNote)).toBeTruthy();
  await fireEvent.press(screen.getByTestId('backup-import'));
  await waitFor(() => expect(useSession.getState().status).toBe('ready'));
  expect(useSession.getState().profile?.nickname).toBe('Sam (demo)');
  expect((await all(fresh.db, 'SELECT id FROM episodes')).length).toBe((await all(repo.db, 'SELECT id FROM episodes')).length);
});

test('digest summary sentences (Appendix B.8) in English and Spanish, with proper plurals', () => {
  const p = { weekStart: '2026-09-14', weekEnd: '2026-09-20' };
  const stats = {
    version: 1 as const, ...p,
    episodes: { total: 1, byType: { meltdown: 1, shutdown: 0, other: 0 }, avgIntensity: 3, totalDurationMin: 10, perDay: [], busiestDay: null,
      byTod: { morning: 0, midday: 0, afternoon: 1, evening: 0 } },
    prevWeekTotal: 3, avg4Weeks: 2.5, logging: { daysClosed: 1, streak: 1 },
    forecasts: { delivered: 0, happened: 0, steppedIn: 0, calm: 0, noAnswer: 0, hitRate: null, skill28: null },
    insights: { statuses: {}, changes: [{ key: 'sleep_deficit', from: 'possible' as const, to: 'likely' as const }], watchIds: [], newWatch: [] },
    strategies: { mostUsed: null, best: { strategyId: 's', name: 'Quiet space', successes: 2, total: 3 } },
    medications: { perMed: [], overall: null, changes: [] },
    sleep: { nights: 0, avgHours: null, refHours: 10 },
  };
  expect(templateNarrative(stats, tFor('en'), 'Sam', 'en')).toEqual([
    'Sam had 1 hard moment this week (2 fewer compared with last week).',
    'Most happened in the afternoon.',
    "EmoLens's pattern for shorter sleep is now a likely link.",
    'Quiet space helped 2 of 3 times.',
    'Thanks for logging on 1 of 7 days. Every entry sharpens the forecasts.',
  ]);
  expect(templateNarrative({ ...stats, prevWeekTotal: null }, tFor('es'), 'Sam', 'es')[0]).toBe('Sam tuvo 1 momento difícil esta semana.');
  expect(templateNarrative({ ...stats, episodes: { ...stats.episodes, total: 0 } }, tFor('en'), 'Sam', 'en')[0]).toBe('Sam had no hard moments this week.');
});
