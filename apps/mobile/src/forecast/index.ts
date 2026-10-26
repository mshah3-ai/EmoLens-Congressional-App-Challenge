/**
 * When the forecast runs (SPEC 13.10), and everything that follows a run:
 *  - `updateForecast`: one full pass = recompute + fit + forecasts (run.ts), then alerts, morning outlook, new-pattern
 *    notices and the end-of-day reminder (alerts.ts). Used by the refresh pass (app start, return to the app, and the
 *    background task) and by "Refit now".
 *  - `requestForecast`: after the parent saves something, wait 2 s (so several quick saves count once), then run off the
 *    render path (`InteractionManager`) and refresh the screens.
 * The spec asks for a refit within 60 s of a label change; refitting on every recompute is simpler and faster than
 * that, and the fit is small (DECISIONS).
 */
import { InteractionManager } from 'react-native';
import { recordError } from '../db/repo/errors';
import { isTeacherPhone } from '../db/repo/settings';
import { useSession } from '../store/session';
import type { RunOptions } from './run';
import { updateForecast, type Update } from './update';

export { updateForecast, type Update } from './update';

let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<Update | null> | null = null;
let again = false;

/** Runs now for the open profile (one run at a time; a request during a run schedules one more). */
export async function forecastNow(opts: RunOptions = {}): Promise<Update | null> {
  if (running) { again = true; return running; }
  const { repo, profile, status, settings } = useSession.getState();
  if (status !== 'ready' || !repo || !profile || isTeacherPhone(settings)) return null;
  running = (async () => {
    try {
      return await updateForecast(repo, profile, opts);
    } catch (e) {
      await recordError(repo.db, 'forecast', e);
      return null;
    } finally {
      running = null;
      // Only refresh screens if the same database is still open (demo mode may have been switched meanwhile).
      if (useSession.getState().repo === repo) useSession.getState().bump();
      if (again) { again = false; requestForecast(0); }
    }
  })();
  return running;
}

/** Debounced run after a save (SPEC 10: "background recompute (debounced 2 s)"). */
export function requestForecast(delayMs = 2000): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    InteractionManager.runAfterInteractions(() => { void forecastNow(); });
  }, delayMs);
}

/** Tests: resolves when no run is in progress. */
export async function forecastIdle(): Promise<void> { while (running) await running; }

/**
 * Settings that change what the forecast says (language of the reasons, alert sensitivity and limits, quiet hours, the
 * child's wake window, school days, tracked types ...) take effect right away: refresh the forecast when they change.
 * The weekly digest time is here too: moving it to a moment that has already passed makes that week's digest now.
 */
const forecastKey = (s: ReturnType<typeof useSession.getState>) => JSON.stringify([
  s.isDemo, s.profile, s.settings.language, s.settings.alert_sensitivity, s.settings.max_alerts_per_day, s.settings.quiet_hours,
  s.settings.early_alerts_enabled, s.settings.morning_outlook, s.settings.end_of_day_time, s.settings.noise_threshold_db,
  s.settings.receive_alerts, s.settings.recency_half_life_days, s.settings.digest_day_time,
]);
let lastKey: string | null = null;
let lastRepo: unknown = null;
useSession.subscribe((s) => {
  // Opening a database (real <-> demo, or at start) is not a settings change: the refresh on open runs the forecast.
  if (s.status !== 'ready' || s.repo !== lastRepo) { lastKey = s.status === 'ready' ? forecastKey(s) : null; lastRepo = s.repo; return; }
  const key = forecastKey(s);
  if (lastKey != null && key !== lastKey) requestForecast(500);
  lastKey = key;
});
