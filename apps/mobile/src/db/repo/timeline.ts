/**
 * Timeline (SPEC 9.3): every entry for one local day, newest first, plus full-text search.
 * Heads-ups (alerts) show with their answer; tapping one opens "How did it go?" so the answer can be changed (SPEC 15.4).
 * Sensor summaries join the Timeline in Phase 9.
 */
import { all, type Executor, type SqlValue } from '../types';
import type { DoseRow, EpisodeRow, IllnessRow, MealRow, NoteRow, RoutineRow, SleepRow, StrategyUseRow, VisitRow } from '../rows';
import { around, type DirtyRange, type Repo, type SyncTable } from './writer';
import type { CalendarEventRow } from '../../integrations/calendarStore';
import { alertsWithAnswers } from './alerts';

export type TimelineItem =
  | { kind: 'episode'; id: string; at: string; row: EpisodeRow }
  | { kind: 'strategy'; id: string; at: string; row: StrategyUseRow & { strategy_name: string } }
  | { kind: 'dose'; id: string; at: string; row: DoseRow & { med_name: string } }
  | { kind: 'meal'; id: string; at: string; row: MealRow }
  | { kind: 'sleep'; id: string; at: string; row: SleepRow }
  | { kind: 'visit'; id: string; at: string; row: VisitRow & { place_label: string | null } }
  | { kind: 'illness'; id: string; at: string; row: IllnessRow }
  | { kind: 'routine'; id: string; at: string; row: RoutineRow }
  | { kind: 'note'; id: string; at: string; row: NoteRow }
  | { kind: 'calendar'; id: string; at: string; row: CalendarEventRow }
  | { kind: 'sound'; id: string; at: string; row: SoundRow }
  | { kind: 'alert'; id: string; at: string; row: AlertTimelineRow };
export interface AlertTimelineRow { id: string; block_start: string; scheduled_for: string; response: 'happened' | 'stepped_in' | 'calm' | null; responded_at: string | null }
export type TimelineKind = TimelineItem['kind'];
export interface SoundRow { id: string; measured_at: string; level_db: number; duration_s: number; place_id: string | null; place_label: string | null }

export const TIMELINE_KINDS: TimelineKind[] = ['episode', 'alert', 'strategy', 'dose', 'meal', 'sleep', 'visit', 'illness', 'routine', 'note', 'calendar', 'sound'];

/** Kinds the parent can delete from the Timeline. Calendar events live in the calendar app, and sound checks are
 * device-only readings, so they are view-only here (calendar events can be ignored instead). */
export const DELETABLE: Partial<Record<TimelineKind, SyncTable>> = {
  episode: 'episodes', strategy: 'strategy_uses', dose: 'med_doses', meal: 'meals', sleep: 'sleep_entries',
  visit: 'place_visits', illness: 'illness_logs', routine: 'routine_changes', note: 'notes',
};

export async function timelineForDay(ex: Executor, childId: string, fromIso: string, toIso: string, localDate: string): Promise<TimelineItem[]> {
  const w = (col: string) => `child_id = ? AND deleted_at IS NULL AND ${col} >= ? AND ${col} < ?`;
  const p: SqlValue[] = [childId, fromIso, toIso];
  const [episodes, uses, doses, meals, sleep, visits, illness, routine, notes, calendar, sound, alerts] = await Promise.all([
    all<EpisodeRow>(ex, `SELECT * FROM episodes WHERE ${w('started_at')}`, p),
    all<StrategyUseRow & { strategy_name: string }>(ex,
      `SELECT u.*, s.name AS strategy_name FROM strategy_uses u JOIN strategies s ON s.id = u.strategy_id
        WHERE u.child_id = ? AND u.deleted_at IS NULL AND u.context = 'proactive' AND u.used_at >= ? AND u.used_at < ?`, p),
    all<DoseRow & { med_name: string }>(ex,
      `SELECT d.*, m.name AS med_name FROM med_doses d JOIN medications m ON m.id = d.medication_id
        WHERE m.child_id = ? AND d.deleted_at IS NULL AND d.status != 'pending'
          AND COALESCE(d.taken_at, d.scheduled_for) >= ? AND COALESCE(d.taken_at, d.scheduled_for) < ?`, p),
    all<MealRow>(ex, `SELECT * FROM meals WHERE ${w('eaten_at')}`, p),
    all<SleepRow>(ex, `SELECT * FROM sleep_entries WHERE ${w('sleep_end')}`, p),
    all<VisitRow & { place_label: string | null }>(ex,
      `SELECT v.*, pl.label AS place_label FROM place_visits v LEFT JOIN places pl ON pl.id = v.place_id
        WHERE v.child_id = ? AND v.deleted_at IS NULL AND v.arrived_at >= ? AND v.arrived_at < ?`, p),
    all<IllnessRow>(ex, `SELECT * FROM illness_logs WHERE ${w('started_at')}`, p),
    all<RoutineRow>(ex, 'SELECT * FROM routine_changes WHERE child_id = ? AND deleted_at IS NULL AND local_date = ?', [childId, localDate]),
    all<NoteRow>(ex, `SELECT * FROM notes WHERE ${w('noted_at')}`, p),
    // Calendar titles are shown only on this phone (SPEC 9.3); all-day events show at the start of the day.
    all<CalendarEventRow>(ex, 'SELECT * FROM calendar_events WHERE ignored = 0 AND start_at >= ? AND start_at < ?', [fromIso, toIso]),
    all<SoundRow>(ex, `SELECT s.*, pl.label AS place_label FROM sound_samples s LEFT JOIN places pl ON pl.id = s.place_id
      WHERE s.measured_at >= ? AND s.measured_at < ?`, [fromIso, toIso]),
    alertsWithAnswers(ex, childId, fromIso, toIso),
  ]);
  const items: TimelineItem[] = [
    ...episodes.map((row) => ({ kind: 'episode' as const, id: row.id, at: row.started_at, row })),
    ...uses.map((row) => ({ kind: 'strategy' as const, id: row.id, at: row.used_at, row })),
    ...doses.map((row) => ({ kind: 'dose' as const, id: row.id, at: row.taken_at ?? row.scheduled_for ?? '', row })),
    ...meals.map((row) => ({ kind: 'meal' as const, id: row.id, at: row.eaten_at, row })),
    ...sleep.map((row) => ({ kind: 'sleep' as const, id: row.id, at: row.sleep_end, row })),
    ...visits.map((row) => ({ kind: 'visit' as const, id: row.id, at: row.arrived_at, row })),
    ...illness.map((row) => ({ kind: 'illness' as const, id: row.id, at: row.started_at, row })),
    ...routine.map((row) => ({ kind: 'routine' as const, id: row.id, at: row.start_at ?? fromIso, row })),
    ...notes.map((row) => ({ kind: 'note' as const, id: row.id, at: row.noted_at, row })),
    ...calendar.map((row) => ({ kind: 'calendar' as const, id: row.id, at: row.all_day ? fromIso : row.start_at, row })),
    ...sound.map((row) => ({ kind: 'sound' as const, id: row.id, at: row.measured_at, row })),
    ...alerts.map((row) => ({ kind: 'alert' as const, id: row.id, at: row.scheduled_for, row })),
  ];
  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

const likeEscape = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Full-text search over notes, episode notes, antecedent notes, meal items and medication names (SPEC 9.3). */
export async function searchTimeline(ex: Executor, childId: string, query: string, limit = 60): Promise<TimelineItem[]> {
  const q = likeEscape(query.trim());
  if (q === '%%') return [];
  const esc = "ESCAPE '\\'";
  const [notes, episodes, meals, doses] = await Promise.all([
    all<NoteRow>(ex, `SELECT * FROM notes WHERE child_id = ? AND deleted_at IS NULL AND text LIKE ? ${esc} ORDER BY noted_at DESC LIMIT ?`, [childId, q, limit]),
    all<EpisodeRow>(ex, `SELECT * FROM episodes WHERE child_id = ? AND deleted_at IS NULL AND (notes LIKE ? ${esc} OR antecedent_note LIKE ? ${esc}) ORDER BY started_at DESC LIMIT ?`, [childId, q, q, limit]),
    all<MealRow>(ex, `SELECT * FROM meals WHERE child_id = ? AND deleted_at IS NULL AND (items LIKE ? ${esc} OR notes LIKE ? ${esc}) ORDER BY eaten_at DESC LIMIT ?`, [childId, q, q, limit]),
    all<DoseRow & { med_name: string }>(ex,
      `SELECT d.*, m.name AS med_name FROM med_doses d JOIN medications m ON m.id = d.medication_id
        WHERE m.child_id = ? AND d.deleted_at IS NULL AND d.status != 'pending' AND m.name LIKE ? ${esc}
        ORDER BY COALESCE(d.taken_at, d.scheduled_for) DESC LIMIT ?`, [childId, q, limit]),
  ]);
  const items: TimelineItem[] = [
    ...notes.map((row) => ({ kind: 'note' as const, id: row.id, at: row.noted_at, row })),
    ...episodes.map((row) => ({ kind: 'episode' as const, id: row.id, at: row.started_at, row })),
    ...meals.map((row) => ({ kind: 'meal' as const, id: row.id, at: row.eaten_at, row })),
    ...doses.map((row) => ({ kind: 'dose' as const, id: row.id, at: row.taken_at ?? row.scheduled_for ?? '', row })),
  ];
  return items.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}

function dirtyFor(item: TimelineItem, childId: string): DirtyRange[] {
  return item.at ? [around(childId, item.at)] : [];
}

/** Swipe-to-delete (soft delete). Deleting an episode also removes its "what helped" entries. */
export function deleteItem(repo: Repo, childId: string, item: TimelineItem): Promise<void> {
  const table = DELETABLE[item.kind];
  if (!table) return Promise.resolve();
  return repo.write(async (w) => {
    await w.softDelete(table, item.id, dirtyFor(item, childId));
    if (item.kind === 'episode') {
      // its "what helped" entries go with it, through the Writer so the change also syncs (Care Team)
      const uses = await all<{ id: string }>(w.ex, 'SELECT id FROM strategy_uses WHERE episode_id = ? AND deleted_at IS NULL', [item.id]);
      for (const u of uses) await w.softDelete('strategy_uses', u.id);
    }
  });
}

/** Undo within 5 seconds. */
export function restoreItem(repo: Repo, childId: string, item: TimelineItem): Promise<void> {
  const table = DELETABLE[item.kind];
  if (!table) return Promise.resolve();
  return repo.write(async (w) => {
    await w.restore(table, item.id, dirtyFor(item, childId));
    if (item.kind === 'episode') {
      const uses = await all<{ id: string }>(w.ex, 'SELECT id FROM strategy_uses WHERE episode_id = ? AND deleted_at IS NOT NULL', [item.id]);
      for (const u of uses) await w.restore('strategy_uses', u.id);
    }
  });
}
