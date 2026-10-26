/**
 * Refresh from the app: on start, when it returns to the foreground (at most every 5 minutes), and right after a
 * source is switched on. Also keeps medication reminders and geofences in step with the data.
 */
import { ensureDoseRows, listMedications } from '../db/repo/meds';
import { recordError } from '../db/repo/errors';
import { syncMedReminders, type ReminderSync } from '../notifications/medReminders';
import { useSession } from '../store/session';
import { healthProvider } from './health';
import { INTEGRATIONS, integrationById } from './registry';
import { runRefresh, type RefreshReport } from './refresh';
import type { IntegrationId } from './types';

let lastRun = 0;
let running: Promise<unknown> | null = null;
let healthWatching = false;

/** Runs a refresh and returns its report (null when skipped because one ran in the last 5 minutes). */
export async function refreshNow(opts: { force?: boolean; only?: IntegrationId[] } = {}): Promise<RefreshReport | null> {
  const { repo, profile, status } = useSession.getState();
  if (status !== 'ready' || !repo || !profile) return null;
  if (!opts.force && !opts.only && Date.now() - lastRun < 5 * 60_000) return null;
  if (running) { await running; if (!opts.only && !opts.force) return null; }
  lastRun = Date.now();
  const list = opts.only ? opts.only.map(integrationById) : INTEGRATIONS;
  const run = runRefresh({ repo, profile, now: Date.now() }, list, { budgetMs: 60_000, force: opts.force || !!opts.only });
  running = run;
  try { return await run; } finally { running = null; await useSession.getState().reload(); }
}

/**
 * Reschedules medication reminders from the saved medications. Also creates today's dose rows, so "Given" / "Skip" on
 * the first reminder of a medication added today has a dose to mark (BUGS.md #6). Null if it couldn't run.
 */
export async function refreshMedReminders(): Promise<ReminderSync | null> {
  const { repo, profile } = useSession.getState();
  if (!repo || !profile) return null;
  try {
    await ensureDoseRows(repo, profile);
    return await syncMedReminders(await listMedications(repo.db, profile.id), profile.homeTz);
  } catch (e) {
    await recordError(repo.db, 'med-reminders', e);
    return null;
  }
}

/** iOS: let Apple Health wake EmoLens when new sleep or heart-rate data arrives (SPEC 11.1). */
export async function watchHealthChanges(): Promise<void> {
  const { settings } = useSession.getState();
  if (healthWatching || !settings.integration_state.health?.enabled || !healthProvider.enableBackground) return;
  healthWatching = true;
  await healthProvider.enableBackground(() => { void refreshNow({ only: ['health'] }); }).catch(() => { healthWatching = false; });
}
