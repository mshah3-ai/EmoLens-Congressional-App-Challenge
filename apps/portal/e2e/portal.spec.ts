/**
 * Portal smoke tests (SPEC 30.3): sign in, the children list, a child's overview from the snapshot, what a teacher
 * can't open, the share page (works; revoked and expired links show the message), who sees "Draft session prep", and the
 * security headers.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { codeFor, inbox } from '../../../supabase/tests/integration/local';
import { FIXTURES } from './setup';

const fx = () => JSON.parse(readFileSync(FIXTURES, 'utf8')) as { who: Record<string, string>; childId: string; tokens: Record<string, string> };

async function login(page: Page, email: string) {
  await page.goto('/login');
  const seen = await inbox(email);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  await expect(page.getByTestId('login-code-form')).toBeVisible();
  await page.getByLabel('6-digit code').fill(await codeFor(email, seen));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/children$/);
}

test('signed out: every page goes to /login', async ({ page }) => {
  await page.goto(`/children/${fx().childId}`);
  await expect(page).toHaveURL(/\/login\?next=/);
});

test('a clinician signs in, sees the child and the overview computed on the family\'s phone', async ({ page }) => {
  await login(page, fx().who.clinician);
  await expect(page.getByTestId('children-list')).toContainText('Sam');
  await page.getByRole('link', { name: /Sam/ }).click();
  await expect(page.getByTestId('child-name')).toHaveText('Sam');
  await expect(page.getByTestId('kpis')).toContainText('5');
  await expect(page.getByTestId('snapshot-time')).toContainText('Computed on the family');
  await expect(page.getByTestId('patterns')).toContainText('Planned transitions');
  await page.getByRole('link', { name: 'Medications' }).click();
  await expect(page.getByTestId('medications-table')).toContainText('Medication A');
  await page.getByRole('link', { name: 'Report' }).click();
  await expect(page.getByTestId('report')).toContainText('EmoLens report for Sam');
});

test('a teacher: no medications, no snapshot, only school and own hard moments', async ({ page }) => {
  await login(page, fx().who.teacher);
  await page.goto(`/children/${fx().childId}`);
  await expect(page.getByRole('link', { name: 'Medications' })).toHaveCount(0);
  await expect(page.getByTestId('no-snapshot')).toBeVisible();
  await page.goto(`/children/${fx().childId}/medications`);
  await expect(page.getByTestId('not-shared')).toBeVisible();
  await page.goto(`/children/${fx().childId}/episodes`);
  await expect(page.getByTestId('episodes-table').locator('tbody tr')).toHaveCount(1); // the one at school
});

test('share links: the working one shows the report with the banner; revoked and expired ones say so', async ({ page }) => {
  const res = await page.goto(`/share/${fx().tokens.working}`);
  await expect(page.getByTestId('share-banner')).toContainText('Read-only report shared by Sam');
  await expect(page.getByTestId('report')).toContainText('EmoLens report for Sam');
  expect(res?.headers()['x-robots-tag']).toContain('noindex');
  for (const token of [fx().tokens.revoked, fx().tokens.expired, 'A'.repeat(43)]) {
    await page.goto(`/share/${token}`);
    await expect(page.getByTestId('share-unavailable')).toContainText('This link is no longer available.');
  }
});

test('session prep (Phase 8): only the clinician sees "Draft session prep"; the owner does not', async ({ page, browser }) => {
  await login(page, fx().who.clinician);
  await page.goto(`/children/${fx().childId}/notes`);
  await expect(page.getByTestId('session-prep')).toContainText('Draft session prep');
  await expect(page.getByTestId('session-prep').getByLabel('From')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  const owner = await (await browser.newContext()).newPage();
  await login(owner, fx().who.owner);
  await owner.goto(`/children/${fx().childId}/notes`);
  await expect(owner.getByText('Only clinicians can add notes.', { exact: false })).toBeVisible();
  await expect(owner.getByTestId('session-prep')).toHaveCount(0);
});

test('security headers on every page', async ({ page }) => {
  const res = await page.goto('/login');
  const h = res!.headers();
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['referrer-policy']).toBe('no-referrer');
  expect(h['content-security-policy']).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
});
