/**
 * Saves calendar events into `calendar_events` (titles stay on this phone and are never synced; SPEC 11.3, 27.1).
 * Separate from calendar.ts so it can be tested without the native calendar module.
 */
import { all, one, type Executor } from '../db/types';
import { around, type Repo } from '../db/repo/writer';
import { newId } from '../db/time';
import type { CalendarTag } from '@emolens/shared';
import { autoTags } from './calendarRules';

export interface IncomingEvent { externalId: string; calendarId: string; title: string | null; startAt: string; endAt: string; allDay: boolean; }

export interface CalendarEventRow {
  id: string; external_id: string; calendar_id: string; title: string | null; start_at: string; end_at: string;
  all_day: number; tags: string; ignored: number; user_tagged: number;
}

/**
 * Upserts the events in [windowStart, windowEnd] from the chosen calendars. Events that disappeared (deleted in the
 * calendar app) and events from calendars no longer chosen are removed. Hand-made tags and "ignore" are kept.
 * Returns how many rows changed and how many events are new.
 */
export function saveCalendarEvents(repo: Repo, childId: string, events: IncomingEvent[], calendarIds: string[],
  windowStart: string, windowEnd: string, custom: Record<string, string[]>): Promise<{ changed: number; added: number }> {
  return repo.write(async (w) => {
    let changed = 0;
    let added = 0;
    const seen = new Set<string>();
    for (const e of events) {
      seen.add(`${e.externalId}|${e.startAt}`);
      const tags = JSON.stringify(autoTags(e.title, e.allDay, custom));
      const existing = await one<CalendarEventRow>(w.ex, 'SELECT * FROM calendar_events WHERE external_id = ? AND start_at = ?', [e.externalId, e.startAt]);
      if (!existing) {
        await w.ex.execute('INSERT INTO calendar_events (id, external_id, calendar_id, title, start_at, end_at, all_day, tags, ignored, user_tagged) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0)',
          [newId(), e.externalId, e.calendarId, e.title, e.startAt, e.endAt, e.allDay ? 1 : 0, tags]);
        added++;
      } else {
        const nextTags = existing.user_tagged ? existing.tags : tags;
        const same = existing.title === e.title && existing.end_at === e.endAt && existing.all_day === (e.allDay ? 1 : 0)
          && existing.tags === nextTags && existing.calendar_id === e.calendarId;
        if (same) continue;
        await w.ex.execute('UPDATE calendar_events SET calendar_id = ?, title = ?, end_at = ?, all_day = ?, tags = ? WHERE id = ?',
          [e.calendarId, e.title, e.endAt, e.allDay ? 1 : 0, nextTags, existing.id]);
      }
      changed++;
      await w.markDirty([around(childId, e.startAt)]);
    }
    // Remove events that are gone from the calendar, and everything from calendars the parent no longer reads.
    const inWindow = await all<CalendarEventRow>(w.ex, 'SELECT * FROM calendar_events WHERE start_at >= ? AND start_at <= ?', [windowStart, windowEnd]);
    for (const row of inWindow) {
      if (calendarIds.includes(row.calendar_id) && seen.has(`${row.external_id}|${row.start_at}`)) continue;
      await w.ex.execute('DELETE FROM calendar_events WHERE id = ?', [row.id]);
      await w.markDirty([around(childId, row.start_at)]);
      changed++;
    }
    if (calendarIds.length) {
      const others = await all<CalendarEventRow>(w.ex,
        `SELECT * FROM calendar_events WHERE calendar_id NOT IN (${calendarIds.map(() => '?').join(', ')})`, calendarIds);
      for (const row of others) { await w.ex.execute('DELETE FROM calendar_events WHERE id = ?', [row.id]); changed++; }
    } else {
      const r = await w.ex.execute('DELETE FROM calendar_events');
      changed += r.rowsAffected;
    }
    return { changed, added };
  });
}

/** The parent re-tags or ignores an event by hand; later syncs keep this choice. */
export function setEventTags(repo: Repo, childId: string, id: string, tags: CalendarTag[], ignored: boolean): Promise<void> {
  return repo.write(async (w) => {
    const row = await one<CalendarEventRow>(w.ex, 'SELECT * FROM calendar_events WHERE id = ?', [id]);
    if (!row) return;
    await w.ex.execute('UPDATE calendar_events SET tags = ?, ignored = ?, user_tagged = 1 WHERE id = ?', [JSON.stringify(tags), ignored ? 1 : 0, id]);
    await w.markDirty([around(childId, row.start_at)]);
  });
}

export const getCalendarEvent = (ex: Executor, id: string) => one<CalendarEventRow>(ex, 'SELECT * FROM calendar_events WHERE id = ?', [id]);
