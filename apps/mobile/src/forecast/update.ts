/**
 * One full forecast pass: recompute + fit + forecasts (run.ts), then alerts, morning outlook, new-pattern notices and the
 * end-of-day reminder (alerts.ts), the Care Team snapshot (sync/snapshot.ts), then the weekly digest once it is due
 * (digest/generate.ts). Kept free of the session
 * store so the demo builder and the background task can use it.
 */
import type { ChildProfile } from '@emolens/shared';
import { localDateOf } from '@emolens/engine';
import { cloudApi } from '../cloud/current';
import { setSettings } from '../db/repo/settings';
import { shareAfterForecast } from '../sync/snapshot';
import { ensureDigest } from '../digest/generate';
import { recordError } from '../db/repo/errors';
import type { Repo } from '../db/repo/writer';
import { syncAlerts, syncInfoNotifications, type AlertSync } from './alerts';
import { runForecast, type ForecastRun, type RunOptions } from './run';

export interface Update extends ForecastRun { alerts: AlertSync | null; }

export async function updateForecast(repo: Repo, profile: ChildProfile, opts: RunOptions & { quiet?: boolean } = {}): Promise<Update> {
  const now = opts.now ?? Date.now();
  const run = await runForecast(repo, profile, { ...opts, now });
  let alerts: AlertSync | null = null;
  if (run.result) {
    try {
      alerts = await syncAlerts(repo, profile, run.settings, run.snapshot, now);
      await syncInfoNotifications(repo, profile, run.settings, run.snapshot, now, opts.quiet);
    } catch (e) {
      await recordError(repo.db, 'alerts', e);
    }
    try {
      // Care Team: share today's patterns with the portal and the school-hours forecast with the teacher (SPEC 23.3)
      const shared = await shareAfterForecast(repo, profile, run.settings, run.snapshot, now, cloudApi(), run.settings.last_snapshot_date);
      if (shared.snapshot) await setSettings(repo.db, { last_snapshot_date: localDateOf(now, profile.homeTz) });
    } catch (e) {
      await recordError(repo.db, 'sync.snapshot', e);
    }
  }
  await ensureDigest(repo, profile, run.settings, run.result ? run.snapshot : null, now, { quiet: opts.quiet });
  return { ...run, alerts };
}

