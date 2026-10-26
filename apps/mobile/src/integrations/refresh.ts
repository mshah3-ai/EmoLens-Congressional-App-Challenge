/**
 * One refresh pass (SPEC 11.8): runs on app start, when the app comes back to the foreground, and in the background task.
 * Order: weather (if stale), health, calendar, places/geofences, then missed-dose upkeep, and finally the forecast
 * (recompute, refit, forecasts, alerts; SPEC 13.10). The whole pass has a time budget (25 s in the background); each step also has its
 * own time limit, and one failing source never stops the others. Failures are saved per source and shown as warnings.
 */
import { recordError } from '../db/repo/errors';
import { ensureDoseRows, markMissedDoses } from '../db/repo/meds';
import { getAllSettings, isTeacherPhone } from '../db/repo/settings';
import { updateForecast } from '../forecast/update';
import { getIntegrationState, recordSyncFailure, recordSyncSuccess } from './state';
import type { Integration, IntegrationId, SyncContext, SyncResult } from './types';

export interface RefreshReport {
  ran: IntegrationId[]; skipped: IntegrationId[]; failed: IntegrationId[]; timedOut: boolean;
  /** What each source that ran imported (new items only). */
  imported: Partial<Record<IntegrationId, SyncResult>>;
}

/** Rejects if `p` takes longer than `ms`. */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} took too long`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export async function runRefresh(base: Omit<SyncContext, 'settings'>, integrations: Integration[],
  opts: { budgetMs?: number; stepMs?: number; force?: boolean; forecast?: boolean } = {}): Promise<RefreshReport> {
  const budgetMs = opts.budgetMs ?? 25_000;
  const stepMs = opts.stepMs ?? 15_000;
  const deadline = Date.now() + budgetMs;
  const report: RefreshReport = { ran: [], skipped: [], failed: [], timedOut: false, imported: {} };
  const settings = await getAllSettings(base.repo.db);
  const ctx: SyncContext = { ...base, settings };

  for (const integration of integrations) {
    const remaining = deadline - Date.now();
    if (remaining <= 500) { report.timedOut = true; report.skipped.push(integration.id); continue; }
    const state = await getIntegrationState(base.repo.db, integration.id);
    const wanted = state.enabled && (opts.force || integration.isDue(ctx, state.lastSuccessAt));
    if (!wanted) { report.skipped.push(integration.id); continue; }
    const at = new Date(base.now).toISOString();
    try {
      // Not set up yet (e.g. weather before a home location exists): skip without counting it as a sync.
      const setup = integration.setupDetail ? await integration.setupDetail(ctx) : { ready: true };
      if (!setup.ready) { report.skipped.push(integration.id); continue; }
      const result = await withTimeout((async () => {
        if (!(await integration.isAvailable()) || !(await integration.hasPermission())) throw new Error('permission missing');
        return integration.sync(ctx);
      })(), Math.min(stepMs, remaining), integration.id);
      await recordSyncSuccess(base.repo.db, integration.id, at, result.foundData, result.notice);
      report.imported[integration.id] = result;
      report.ran.push(integration.id);
    } catch (e) {
      await recordSyncFailure(base.repo.db, integration.id, at, e);
      await recordError(base.repo.db, `sync:${integration.id}`, e);
      report.failed.push(integration.id);
    }
  }

  // Upkeep that doesn't need the network (SPEC 11.8: missed-dose status update).
  try {
    await ensureDoseRows(base.repo, base.profile, base.now);
    await markMissedDoses(base.repo, base.profile.id, base.now);
  } catch (e) {
    await recordError(base.repo.db, 'doses', e);
  }

  // The forecast uses everything just imported (SPEC 13.10: refit on app foreground and in the background task).
  if (opts.forecast !== false && !isTeacherPhone(settings) && Date.now() < deadline) {
    try {
      await updateForecast(base.repo, base.profile, { now: base.now });
    } catch (e) {
      await recordError(base.repo.db, 'forecast', e);
    }
  }
  return report;
}
