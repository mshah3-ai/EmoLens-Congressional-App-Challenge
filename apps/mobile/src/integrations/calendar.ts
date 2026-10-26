/**
 * Calendar integration (SPEC 11.3) using Expo's current calendar API (`getCalendars`, `listEvents`; the older
 * function names now throw, DECISIONS #41). Reads only the calendars the parent chose, from 30 days ago to 14 days ahead.
 * Needs calendar "Full Access" on iOS 17+ (`requestCalendarPermissions()` asks for full access; the plugin sets
 * NSCalendarsFullAccessUsageDescription).
 */
import { EntityTypes, getCalendarPermissions, getCalendars, listEvents, requestCalendarPermissions } from 'expo-calendar';
import { saveCalendarEvents, type IncomingEvent } from './calendarStore';
import type { Integration, SyncContext } from './types';

const DAY = 86_400_000;
const toIso = (d: string | Date) => new Date(d).toISOString();

export interface CalendarChoice { id: string; title: string; color: string | null; sourceName: string }

/**
 * What the "Choose calendars" screen can show. Kept apart on purpose: "no access" and "couldn't load" must never be
 * shown as "No calendars found" (bug found in the Simulator, BUGS.md #4).
 */
export type CalendarChoices =
  | { kind: 'no_access'; canAskAgain: boolean }
  | { kind: 'ok'; calendars: CalendarChoice[] }
  | { kind: 'error'; message: string };

/** The calendar functions used here, replaceable in tests. */
export interface CalendarApi {
  getCalendarPermissions: () => Promise<{ granted: boolean; canAskAgain: boolean }>;
  getCalendars: (entityType?: EntityTypes) => Promise<{ id: string; title: string; color?: string; source?: { name?: string } }[]>;
}
const nativeApi: CalendarApi = { getCalendarPermissions, getCalendars };

/**
 * Lists the phone's event calendars. On iOS, `getCalendars()` with no type asks for event AND reminder lists, which
 * needs Reminders permission too and throws without it; EmoLens only needs events, so it always asks for EVENT.
 * On iOS 17+, EmoLens needs "Full Access" (write-only access would show only a placeholder calendar).
 */
export async function loadCalendarChoices(api: CalendarApi = nativeApi): Promise<CalendarChoices> {
  try {
    const perm = await api.getCalendarPermissions();
    if (!perm.granted) return { kind: 'no_access', canAskAgain: perm.canAskAgain };
    const cals = await api.getCalendars(EntityTypes.EVENT);
    return { kind: 'ok', calendars: cals.map((c) => ({ id: c.id, title: c.title, color: c.color ?? null, sourceName: c.source?.name ?? '' })) };
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

/** Just the calendars (for onboarding); empty if there's no access or loading failed. */
export async function listPhoneCalendars(): Promise<CalendarChoice[]> {
  const r = await loadCalendarChoices();
  return r.kind === 'ok' ? r.calendars : [];
}

export const calendarIntegration: Integration = {
  id: 'calendar',
  isAvailable: async () => true,
  hasPermission: async () => (await getCalendarPermissions()).granted,
  requestPermission: async () => (await requestCalendarPermissions()).granted,
  isDue: (ctx, lastSuccessAt) => !lastSuccessAt || ctx.now - Date.parse(lastSuccessAt) >= 15 * 60_000,
  async setupDetail(ctx) {
    const n = ctx.settings.calendar_ids.length;
    return n ? { ready: true, detailKey: 'sources.calendarCount', detailParams: { count: n } } : { ready: false, detailKey: 'sources.calendarChoose' };
  },
  async sync(ctx: SyncContext) {
    const ids = ctx.settings.calendar_ids;
    const start = new Date(ctx.now - 30 * DAY), end = new Date(ctx.now + 14 * DAY);
    const raw = ids.length ? await listEvents(ids, start, end) : [];
    const events: IncomingEvent[] = raw
      .filter((e) => String(e.status).toLowerCase() !== 'canceled' && String(e.status).toLowerCase() !== 'cancelled')
      .map((e) => ({ externalId: e.id, calendarId: e.calendarId, title: e.title ?? null, startAt: toIso(e.startDate), endAt: toIso(e.endDate), allDay: !!e.allDay }));
    const { changed, added } = await saveCalendarEvents(ctx.repo, ctx.profile.id, events, ids, start.toISOString(), end.toISOString(), ctx.settings.calendar_keywords);
    return { changed, summary: { events: added } };
  },
};
