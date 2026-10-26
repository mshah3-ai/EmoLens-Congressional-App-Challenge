/**
 * BUGS.md #11, second half: when a file feature fails, the real reason must be visible (About → Diagnostics and, while
 * developing, the dev terminal), labelled with the step that failed, and without personal data.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { completeOnboarding } from '../src/db/repo/onboarding';
import { listErrors, recordError, safeMessage } from '../src/db/repo/errors';
import { StepError, failureToastKey, rootError, step } from '../src/lib/steps';
import { freshDraft } from '../src/store/onboarding';
import { useSession } from '../src/store/session';
import { useToast } from '../src/ui/Toast';
import Reports from '../app/reports/index';
import Privacy from '../app/settings/privacy';
import en from '@emolens/shared/i18n/en.json';
import { testRepo } from './nodeDb';

test('step labels: the failing step is named, the innermost label wins, the original error is kept', async () => {
  const boom = new TypeError('Intl.PluralRules is not a constructor');
  const e = await step('render', () => step('fmt', () => { throw boom; })).catch((x: unknown) => x);
  expect(e).toBeInstanceOf(StepError);
  expect((e as StepError).step).toBe('fmt');
  expect((e as Error).message).toBe('fmt: TypeError: Intl.PluralRules is not a constructor');
  expect(rootError(e)).toBe(boom);
  expect(safeMessage(e)).toBe('fmt: TypeError: Intl.PluralRules is not a constructor');
  await expect(step('load', async () => 42)).resolves.toBe(42);
});

test('the toast: "sharing isn\'t available" only for that case, otherwise "Couldn\'t create the file"', () => {
  expect(failureToastKey(new StepError('share', new Error('sharing_unavailable')))).toBe('reports.shareUnavailable');
  expect(failureToastKey(new StepError('print', new Error('WebKit failed')))).toBe('reports.failed');
  expect(failureToastKey('weird')).toBe('reports.failed');
});

test('error messages never keep file paths or quoted text (they can contain the child\'s name or notes)', () => {
  const m = safeMessage(new Error('Could not move file:///var/mobile/Caches/EmoLens-Sam-2026-09-01.pdf to file:///x/y.pdf'));
  expect(m).toBe('Error: Could not move file://… to file://…');
  expect(safeMessage(new SyntaxError('Unexpected token s, "sam loves the park" is not valid JSON'))).toBe('SyntaxError: Unexpected token s, "…" is not valid JSON');
  expect(safeMessage(new Error('x'.repeat(500))).length).toBe(300);
});

test('while developing, recorded errors are also printed in the dev terminal', async () => {
  const repo = await testRepo();
  const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const env = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const printed: unknown[][] = [];
  try {
    await recordError(repo.db, 'report.pdf', new StepError('render', new TypeError('boom')));
    printed.push(...spy.mock.calls);
  } finally {
    process.env.NODE_ENV = env;
    spy.mockRestore();
  }
  expect(printed).toHaveLength(1);
  expect(String(printed[0][0])).toMatch(/^\[EmoLens\] report\.pdf: render: TypeError: boom/);
  expect((await listErrors(repo.db))[0]).toMatchObject({ area: 'report.pdf', message: 'render: TypeError: boom' });
});

describe('screens record the real reason', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    const repo = await testRepo();
    await completeOnboarding(repo, { ...freshDraft(), child: { ...freshDraft().child, nickname: 'Sam', homeTz: 'America/Chicago' } });
    await useSession.getState().useRepoForTests(repo);
  });
  const errors = () => listErrors(useSession.getState().repo!.db);

  test('"Create PDF report" failing to print: toast, and "report.pdf · print: ..." in Diagnostics', async () => {
    (Print.printToFileAsync as jest.Mock).mockRejectedValueOnce(new Error('Printing failed at file:///private/Print/1.pdf'));
    await renderRouter({ 'reports/index': Reports }, { initialUrl: '/reports' });
    await fireEvent.press(await screen.findByTestId('report-pdf'));
    await waitFor(async () => expect((await errors()).length).toBe(1));
    expect((await errors())[0]).toMatchObject({ area: 'report.pdf', message: 'print: Error: Printing failed at file://…' });
    expect(useToast.getState().message).toBe(en.reports.failed);
  });

  test('ABC data when the share sheet is unavailable: its own message, "report.csv · share: ..."', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
    await renderRouter({ 'reports/index': Reports }, { initialUrl: '/reports' });
    await fireEvent.press(await screen.findByTestId('report-csv'));
    await waitFor(async () => expect((await errors()).length).toBe(1));
    expect((await errors())[0]).toMatchObject({ area: 'report.csv', message: 'share: Error: sharing_unavailable' });
    expect(useToast.getState().message).toBe(en.reports.shareUnavailable);
  });

  test('"Export all data" failing to share: "backup.export · share: ..."', async () => {
    (Sharing.shareAsync as jest.Mock).mockRejectedValueOnce(new Error('presentation failed'));
    await renderRouter({ 'settings/privacy': Privacy }, { initialUrl: '/settings/privacy' });
    await fireEvent.press(await screen.findByTestId('backup-export'));
    await waitFor(async () => expect((await errors()).length).toBe(1));
    expect((await errors())[0]).toMatchObject({ area: 'backup.export', message: 'share: Error: presentation failed' });
  });
});
