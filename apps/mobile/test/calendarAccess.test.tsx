/**
 * Bug found in the iOS Simulator (BUGS.md #4): with Full Access to Calendars, "Choose calendars" said "No calendars
 * found". On iOS, getCalendars() with no type also asks for Reminders lists and throws without Reminders permission;
 * the screen turned that error into "No calendars found". Also: missing access must say so (with Open Settings), and
 * the screen must re-check when the parent comes back from Settings. BUGS.md #7: once access is granted from Data
 * sources, EmoLens goes straight to the calendar picker.
 */
import { AppState, type AppStateStatus } from 'react-native';
import { act, fireEvent, renderRouter, waitFor } from 'expo-router/testing-library';
import * as ExpoCalendar from 'expo-calendar';
import { loadCalendarChoices, type CalendarApi } from '../src/integrations/calendar';
import { completeOnboarding } from '../src/db/repo/onboarding';
import { freshDraft } from '../src/store/onboarding';
import { useSession } from '../src/store/session';
import Calendars from '../app/settings/calendars';
import DataSources from '../app/settings/data-sources';
import { testRepo } from './nodeDb';

const SIM_CALENDARS = [{ id: 'cal-1', title: 'Calendar', source: { name: 'Default' } }, { id: 'cal-2', title: 'Birthdays' }, { id: 'cal-3', title: 'US Holidays' }];

jest.mock('expo-calendar', () => ({
  EntityTypes: { EVENT: 'event', REMINDER: 'reminder' },
  getCalendarPermissions: jest.fn(),
  requestCalendarPermissions: jest.fn(async () => ({ granted: false, canAskAgain: false })),
  // Like iOS: no type = events AND reminders, which throws without Reminders permission.
  getCalendars: jest.fn(async (type?: string) => {
    if (type !== 'event') throw new Error("FunctionCallException: Calling the 'getCalendars' function has failed");
    return [{ id: 'cal-1', title: 'Calendar', source: { name: 'Default' } }, { id: 'cal-2', title: 'Birthdays' }, { id: 'cal-3', title: 'US Holidays' }];
  }),
  listEvents: jest.fn(async () => []),
}));
const cal = ExpoCalendar as jest.Mocked<typeof ExpoCalendar>;

describe('loadCalendarChoices', () => {
  const api = (granted: boolean, getCalendars: CalendarApi['getCalendars']): CalendarApi => ({
    getCalendarPermissions: async () => ({ granted, canAskAgain: !granted }), getCalendars,
  });

  test('asks iOS for event calendars only, so Reminders permission is never needed', async () => {
    const getCalendars = jest.fn(async (type?: ExpoCalendar.EntityTypes) => {
      if (type !== ExpoCalendar.EntityTypes.EVENT) throw new Error('needs Reminders permission');
      return SIM_CALENDARS;
    });
    const r = await loadCalendarChoices(api(true, getCalendars));
    expect(getCalendars).toHaveBeenCalledWith(ExpoCalendar.EntityTypes.EVENT);
    expect(r).toEqual({ kind: 'ok', calendars: [
      { id: 'cal-1', title: 'Calendar', color: null, sourceName: 'Default' },
      { id: 'cal-2', title: 'Birthdays', color: null, sourceName: '' },
      { id: 'cal-3', title: 'US Holidays', color: null, sourceName: '' },
    ] });
  });

  test('no access and load failures are reported as such, never as "no calendars"', async () => {
    const never = jest.fn(async () => SIM_CALENDARS);
    expect(await loadCalendarChoices(api(false, never))).toEqual({ kind: 'no_access', canAskAgain: true });
    expect(never).not.toHaveBeenCalled();
    expect(await loadCalendarChoices(api(true, async () => { throw new Error('boom'); }))).toEqual({ kind: 'error', message: 'boom' });
  });
});

test('the screen explains missing access, then shows the calendars after returning from Settings', async () => {
  const repo = await testRepo();
  await completeOnboarding(repo, { ...freshDraft(), child: { ...freshDraft().child, nickname: 'Sam', homeTz: 'America/Chicago' } });
  await useSession.getState().useRepoForTests(repo);

  let onChange: ((s: AppStateStatus) => void) | null = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    onChange = handler as (s: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  (cal.getCalendarPermissions as jest.Mock).mockResolvedValue({ granted: false, canAskAgain: false });

  const screen = await renderRouter({ index: Calendars }, { initialUrl: '/' });
  expect(await screen.findByTestId('calendars-no-access')).toBeTruthy();
  expect(screen.queryByText('No calendars found on this phone')).toBeNull();
  expect(screen.getByText('Open Settings')).toBeTruthy();

  // The parent turns on Full Access in Settings and comes back to EmoLens.
  (cal.getCalendarPermissions as jest.Mock).mockResolvedValue({ granted: true, canAskAgain: false });
  await act(async () => { onChange?.('background'); onChange?.('active'); });
  await waitFor(() => expect(screen.getByTestId('calendar-cal-1')).toBeTruthy());
  expect(screen.getByText('Calendar · Default')).toBeTruthy();
  expect(screen.getByText('US Holidays')).toBeTruthy();
  expect(screen.queryByTestId('calendars-no-access')).toBeNull();

  // Choosing a calendar saves it.
  await fireEvent.press(screen.getByTestId('calendar-cal-1'));
  await waitFor(() => expect(useSession.getState().settings.calendar_ids).toEqual(['cal-1']));
});

test('switching Calendar on in Data sources goes straight to the calendar picker once access is granted', async () => {
  const repo = await testRepo();
  await completeOnboarding(repo, { ...freshDraft(), child: { ...freshDraft().child, nickname: 'Sam', homeTz: 'America/Chicago' } });
  await useSession.getState().useRepoForTests(repo);
  (cal.requestCalendarPermissions as jest.Mock).mockResolvedValue({ granted: true, canAskAgain: false });
  (cal.getCalendarPermissions as jest.Mock).mockResolvedValue({ granted: true, canAskAgain: false });

  const screen = await renderRouter({ index: DataSources, 'settings/calendars': Calendars }, { initialUrl: '/' });
  await fireEvent(await screen.findByTestId('source-calendar'), 'valueChange', true);
  // The calendar chips exist only on the picker screen.
  expect(await screen.findByTestId('calendar-cal-1')).toBeTruthy();
  expect(screen.getByText('Birthdays')).toBeTruthy();
});
