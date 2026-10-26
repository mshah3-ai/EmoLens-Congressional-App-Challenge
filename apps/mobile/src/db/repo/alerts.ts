/**
 * Alerts and the prediction-confirmation loop (SPEC 15). The three answers to "How did 2-4 pm go?":
 *  - happened   -> the block becomes `positive`; if no hard moment is logged in that block yet, a fast-path one is saved
 *                  at the block's midpoint (source 'alert_confirm', details later), so the answer is never lost;
 *  - stepped_in -> `intervened`: left out of the risk model (the "intervention trap"), credited to strategies instead;
 *  - calm       -> `negative_confirmed`.
 * The engine turns answers into labels (features/labels.ts); this file only stores them. The latest answer counts,
 * so an answer can be changed later (Timeline).
 */
import type { AlertResponseKind, ChildProfile } from '@emolens/shared';
import { isQualifyingEpisode } from '@emolens/engine';
import { all, one, type Executor } from '../types';
import { iso, ms, nowIso } from '../time';
import { mostUsedType } from './episodes';
import { around, type Repo } from './writer';

export interface AlertDbRow {
  id: string; child_id: string; block_start: string; prediction_id: string | null; scheduled_for: string;
  notification_id: string | null; confirm_notification_id: string | null; status: 'scheduled' | 'delivered' | 'cancelled' | 'suppressed';
  created_at: string;
}
export interface ResponseDbRow { id: string; alert_id: string; response: AlertResponseKind; responded_at: string; followup_done: number; }

/** Block end from the blocks table (1 or 3 hours on a DST day), else start + 2 h. */
const BLOCK_END = "COALESCE((SELECT b.block_end FROM blocks b WHERE b.child_id = a.child_id AND b.block_start = a.block_start), strftime('%Y-%m-%dT%H:%M:%fZ', a.block_start, '+2 hours'))";

export const getAlert = (ex: Executor, id: string) => one<AlertDbRow & { block_end: string }>(ex, `SELECT a.*, ${BLOCK_END} AS block_end FROM alerts a WHERE a.id = ?`, [id]);

export function alertsFrom(ex: Executor, childId: string, fromIso: string): Promise<AlertDbRow[]> {
  return all<AlertDbRow>(ex, 'SELECT * FROM alerts WHERE child_id = ? AND deleted_at IS NULL AND block_start >= ? ORDER BY block_start', [childId, fromIso]);
}

/** The answer that counts (the newest). */
export function latestResponse(ex: Executor, alertId: string): Promise<ResponseDbRow | null> {
  return one<ResponseDbRow>(ex, 'SELECT * FROM alert_responses WHERE alert_id = ? AND deleted_at IS NULL ORDER BY responded_at DESC LIMIT 1', [alertId]);
}

export interface PendingConfirm { id: string; block_start: string; block_end: string; scheduled_for: string; }

/**
 * Alerts whose block has ended and that nobody answered (SPEC 15.1: every unanswered confirmation also appears on
 * Today and in the end-of-day check). `sinceIso` limits how far back (block end).
 */
export function pendingConfirmations(ex: Executor, childId: string, now: number, sinceIso: string): Promise<PendingConfirm[]> {
  return all<PendingConfirm>(ex,
    `SELECT * FROM (SELECT a.id, a.block_start, a.scheduled_for, ${BLOCK_END} AS block_end FROM alerts a
       WHERE a.child_id = ? AND a.deleted_at IS NULL AND a.status IN ('scheduled', 'delivered') AND a.scheduled_for <= ?
         AND NOT EXISTS (SELECT 1 FROM alert_responses r WHERE r.alert_id = a.id AND r.deleted_at IS NULL))
     WHERE block_end <= ? AND block_end >= ? ORDER BY block_start`,
    [childId, iso(now), iso(now), sinceIso]);
}

/**
 * Saves an answer. For "A hard moment happened" it makes sure a hard moment exists in the block (fast path at the
 * block's midpoint if none was logged) and returns that episode's id so the app can open it for details.
 */
export async function answerAlert(repo: Repo, child: ChildProfile, alertId: string, response: AlertResponseKind, now = Date.now()):
  Promise<{ episodeId: string | null; confirmNotificationId: string | null }> {
  const alert = await getAlert(repo.db, alertId);
  if (!alert) throw new Error('alert not found');
  return repo.write(async (w) => {
    await w.insert('alert_responses', { alert_id: alertId, response, responded_at: iso(now) }, [around(child.id, alert.block_start)]);
    if (alert.status === 'scheduled' && ms(alert.scheduled_for) <= now) await w.update('alerts', alertId, { status: 'delivered' });
    let episodeId: string | null = null;
    if (response === 'happened') {
      const inBlock = await all<{ id: string; type: 'meltdown' | 'shutdown' | 'other'; intensity: number | null; started_at: string }>(w.ex,
        'SELECT id, type, intensity, started_at FROM episodes WHERE child_id = ? AND deleted_at IS NULL AND started_at >= ? AND started_at < ? ORDER BY started_at',
        [child.id, alert.block_start, alert.block_end]);
      const counted = inBlock.find((e) => isQualifyingEpisode({ child }, { id: e.id, startedAt: ms(e.started_at), durationMin: null, type: e.type, intensity: e.intensity }));
      if (counted) episodeId = counted.id;
      else {
        const mid = iso((ms(alert.block_start) + ms(alert.block_end)) / 2);
        episodeId = await w.insert('episodes', {
          child_id: child.id, started_at: mid, duration_min: null, type: await mostUsedType(w.ex, child), intensity: null,
          place_id: null, place_type: null, antecedent_tags: '[]', antecedent_note: null, behavior_tags: '[]', safety_concern: 0,
          notes: null, details_complete: 0, source: 'alert_confirm',
        }, [around(child.id, mid)]);
      }
    }
    return { episodeId, confirmNotificationId: alert.confirm_notification_id };
  });
}

export interface Followup { response_id: string; alert_id: string; block_start: string; scheduled_for: string; }

/** "We stepped in early" answers whose optional "What did you try?" card is still open (last 3 days). */
export function openFollowups(ex: Executor, childId: string, now: number): Promise<Followup[]> {
  return all<Followup>(ex,
    `SELECT r.id AS response_id, a.id AS alert_id, a.block_start, a.scheduled_for FROM alert_responses r JOIN alerts a ON a.id = r.alert_id
     WHERE a.child_id = ? AND r.deleted_at IS NULL AND r.response = 'stepped_in' AND r.followup_done = 0 AND a.block_start >= ?
       AND r.responded_at = (SELECT MAX(r2.responded_at) FROM alert_responses r2 WHERE r2.alert_id = a.id AND r2.deleted_at IS NULL)
     ORDER BY a.block_start DESC`,
    [childId, iso(now - 3 * 86_400_000)]);
}

/**
 * Closes the "What did you try?" card. Each chosen strategy becomes a proactive use linked to the alert, with outcome
 * `pending`; the recompute job resolves it (SPEC 10.2 / 15.4). An empty list just dismisses the card.
 */
export function finishFollowup(repo: Repo, childId: string, f: Followup, strategyIds: string[]): Promise<void> {
  // They stepped in after the heads-up: count the use from the heads-up time (never later than the block start).
  const usedAt = iso(Math.min(ms(f.scheduled_for) + 10 * 60_000, ms(f.block_start)));
  return repo.write(async (w) => {
    for (const sid of strategyIds) {
      await w.insert('strategy_uses', { child_id: childId, strategy_id: sid, context: 'proactive', episode_id: null, alert_id: f.alert_id, outcome: 'pending', used_at: usedAt },
        [around(childId, usedAt)]);
    }
    await w.update('alert_responses', f.response_id, { followup_done: 1 });
  });
}

/** Answers per alert for the Timeline (latest answer of each alert whose block starts in [from, to)). */
export function alertsWithAnswers(ex: Executor, childId: string, fromIso: string, toIso: string) {
  return all<{ id: string; block_start: string; scheduled_for: string; status: AlertDbRow['status']; response: AlertResponseKind | null; responded_at: string | null }>(ex,
    `SELECT a.id, a.block_start, a.scheduled_for, a.status,
       (SELECT r.response FROM alert_responses r WHERE r.alert_id = a.id AND r.deleted_at IS NULL ORDER BY r.responded_at DESC LIMIT 1) AS response,
       (SELECT r.responded_at FROM alert_responses r WHERE r.alert_id = a.id AND r.deleted_at IS NULL ORDER BY r.responded_at DESC LIMIT 1) AS responded_at
     FROM alerts a WHERE a.child_id = ? AND a.deleted_at IS NULL AND a.status IN ('scheduled', 'delivered') AND a.scheduled_for <= ?
       AND a.block_start >= ? AND a.block_start < ? ORDER BY a.block_start`,
    [childId, nowIso(), fromIso, toIso]);
}
