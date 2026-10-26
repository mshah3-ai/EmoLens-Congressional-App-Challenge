/**
 * BUGS.md #1 / #9: Back must always go back. Walks all 13 onboarding steps and taps Back on each (including step 9 with
 * the medication form open), then checks Back / Close on every log sheet, settings screen and Phase 5 and 6 screen.
 */
import type { ComponentType } from 'react';
import { Text } from 'react-native';
import { act, fireEvent, renderRouter, waitFor } from 'expo-router/testing-library';
import { router, Stack } from 'expo-router';
import OnboardingLayout from '../app/(onboarding)/_layout';
import Welcome from '../app/(onboarding)/index';
import Who from '../app/(onboarding)/who';
import Mode from '../app/(onboarding)/mode';
import Child from '../app/(onboarding)/child';
import Frequency from '../app/(onboarding)/frequency';
import Types from '../app/(onboarding)/types';
import Triggers from '../app/(onboarding)/triggers';
import Helps from '../app/(onboarding)/helps';
import Meds from '../app/(onboarding)/meds';
import Places from '../app/(onboarding)/places';
import Connect from '../app/(onboarding)/connect';
import Alerts from '../app/(onboarding)/alerts';
import Reveal from '../app/(onboarding)/reveal';
import LogEpisode from '../app/log/episode';
import LogIllness from '../app/log/illness';
import LogMeal from '../app/log/meal';
import LogMed from '../app/log/med';
import LogNote from '../app/log/note';
import LogPlace from '../app/log/place';
import LogRoutine from '../app/log/routine';
import LogScan from '../app/log/scan';
import LogSleep from '../app/log/sleep';
import LogSound from '../app/log/sound';
import LogStrategy from '../app/log/strategy';
import About from '../app/settings/about';
import AlertsSettings from '../app/settings/alerts';
import CalendarEvents from '../app/settings/calendar-events';
import Calendars from '../app/settings/calendars';
import ChildSettings from '../app/settings/child';
import DataSources from '../app/settings/data-sources';
import DeviceRole from '../app/settings/device-role';
import Disclosures from '../app/settings/disclosures';
import How from '../app/settings/how';
import Language from '../app/settings/language';
import Medication from '../app/settings/medication';
import Medications from '../app/settings/medications';
import PlaceEdit from '../app/settings/place';
import PlacesSettings from '../app/settings/places';
import Privacy from '../app/settings/privacy';
import BlockSheet from '../app/block/[start]';
import Confirm from '../app/confirm/[alertId]';
import EndOfDay from '../app/end-of-day/[date]';
import ModelHealth from '../app/(tabs)/insights/model-health';
import Strategies from '../app/(tabs)/insights/strategies';
import TriggerDetail from '../app/(tabs)/insights/trigger/[key]';
import WatchDetail from '../app/(tabs)/insights/watch/[id]';
import Reports from '../app/reports/index';
import Digest from '../app/digest/[weekStart]';
import Digests from '../app/settings/digests';
import Restore from '../app/(onboarding)/restore';
import Account from '../app/settings/account';
import Invite from '../app/team/invite';
import NewShareLink from '../app/team/share';
import { completeOnboarding } from '../src/db/repo/onboarding';
import { freshDraft } from '../src/store/onboarding';
import { useSession } from '../src/store/session';
import { testRepo } from './nodeDb';
import en from '@emolens/shared/i18n/en.json';
import { useOnboarding } from '../src/store/onboarding';

jest.setTimeout(30000);

const ONBOARDING = {
  '(onboarding)/_layout': OnboardingLayout, '(onboarding)/index': Welcome, '(onboarding)/who': Who, '(onboarding)/mode': Mode,
  '(onboarding)/child': Child, '(onboarding)/frequency': Frequency, '(onboarding)/types': Types, '(onboarding)/triggers': Triggers,
  '(onboarding)/helps': Helps, '(onboarding)/meds': Meds, '(onboarding)/places': Places, '(onboarding)/connect': Connect,
  '(onboarding)/alerts': Alerts, '(onboarding)/reveal': Reveal,
};
const stepText = (n: number) => `Step ${n} of 13`;

describe('onboarding', () => {
  beforeEach(() => {
    useOnboarding.getState().reset();
    // Answers that the steps require before Continue is enabled (age confirmed, a nickname, a frequency).
    useOnboarding.getState().patch({ ageConfirmed: true, frequencyChosen: 'few_week' as never });
    useOnboarding.getState().setChild({ nickname: 'Sam', homeTz: 'America/Chicago' });
  });

  test('Back on every step goes to the previous step', async () => {
    const screen = await renderRouter(ONBOARDING, { initialUrl: '/' });
    expect(await screen.findByText(en.welcome.title)).toBeTruthy();
    for (let step = 2; step <= 13; step++) {
      await fireEvent.press(screen.getByTestId('onboarding-next'));
      expect(await screen.findByText(stepText(step))).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Back'));
      if (step === 2) expect(await screen.findByText(en.welcome.title)).toBeTruthy();
      else expect(await screen.findByText(stepText(step - 1))).toBeTruthy();
      await waitFor(() => expect(screen.queryByText(stepText(step))).toBeNull());
      await fireEvent.press(screen.getByTestId('onboarding-next'));
      expect(await screen.findByText(stepText(step))).toBeTruthy();
    }
  });

  test('Back works even when a step was opened without history (reload or link)', async () => {
    const screen = await renderRouter(ONBOARDING, { initialUrl: '/frequency' });
    expect(await screen.findByText(stepText(5))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(await screen.findByText(stepText(4))).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(await screen.findByText(stepText(3))).toBeTruthy();
  });

  test('step 9: Back with the medication form open closes the form and stays on step 9', async () => {
    const screen = await renderRouter(ONBOARDING, { initialUrl: '/' });
    for (let step = 2; step <= 9; step++) {
      await fireEvent.press(screen.getByTestId('onboarding-next'));
      expect(await screen.findByText(stepText(step))).toBeTruthy();
    }
    expect(await screen.findByText(en.meds.stepTitle)).toBeTruthy();
    await fireEvent.press(screen.getByText(en.meds.add));
    expect(await screen.findByText(en.meds.addTitle)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Back'));
    expect(await screen.findByText(en.meds.stepTitle)).toBeTruthy();
    expect(screen.getByText(stepText(9))).toBeTruthy();
  });
});

// Screens opened from a home screen: log sheets close with the X (testID sheet-close), settings screens go Back.
// Routes with a [parameter] open this URL (a separate map: an optional 3rd test.each value would be taken for `done`).
const URLS: Record<string, string> = {
  'block/[start]': '/block/1790000000000', 'confirm/[alertId]': '/confirm/none', 'end-of-day/[date]': '/end-of-day/today',
  'insights/trigger/[key]': '/insights/trigger/sleep_deficit', 'insights/watch/[id]': '/insights/watch/food%3Acookies',
  'digest/[weekStart]': '/digest/2026-09-21', 'reports/index': '/reports',
};
const SHEETS: [string, ComponentType][] = [
  ['block/[start]', BlockSheet], ['confirm/[alertId]', Confirm], ['end-of-day/[date]', EndOfDay],
  ['log/episode', LogEpisode], ['log/illness', LogIllness], ['log/meal', LogMeal], ['log/med', LogMed], ['log/note', LogNote],
  ['log/place', LogPlace], ['log/routine', LogRoutine], ['log/scan', LogScan], ['log/sleep', LogSleep], ['log/sound', LogSound],
  ['log/strategy', LogStrategy], ['settings/medication', Medication], ['settings/place', PlaceEdit],
  ['team/invite', Invite], ['team/share', NewShareLink],
];
const SCREENS: [string, ComponentType][] = [
  ['insights/strategies', Strategies], ['insights/model-health', ModelHealth], ['insights/trigger/[key]', TriggerDetail], ['insights/watch/[id]', WatchDetail],
  ['settings/about', About], ['settings/alerts', AlertsSettings], ['settings/calendar-events', CalendarEvents],
  ['settings/calendars', Calendars], ['settings/child', ChildSettings], ['settings/data-sources', DataSources],
  ['settings/device-role', DeviceRole], ['settings/disclosures', Disclosures], ['settings/how', How], ['settings/language', Language],
  ['settings/medications', Medications], ['settings/places', PlacesSettings], ['settings/privacy', Privacy],
  ['reports/index', Reports], ['digest/[weekStart]', Digest], ['settings/digests', Digests], ['restore', Restore],
  ['settings/account', Account],
];
const Home = () => <Text>Home screen</Text>;

describe('log sheets and settings screens', () => {
  beforeEach(async () => {
    const repo = await testRepo();
    await completeOnboarding(repo, { ...freshDraft(), child: { ...freshDraft().child, nickname: 'Sam', homeTz: 'America/Chicago' } });
    await useSession.getState().useRepoForTests(repo);
  });

  test.each(SHEETS)('%s: the close button goes back', async (route, Sheet) => {
    const screen = await renderRouter({ index: Home, [route]: Sheet }, { initialUrl: '/' });
    await act(async () => { router.push((URLS[route] ?? `/${route}`) as never); });
    await waitFor(() => expect(screen.queryByText('Home screen')).toBeNull());
    await fireEvent.press(await screen.findByTestId('sheet-close'));
    expect(await screen.findByText('Home screen')).toBeTruthy();
  });

  test.each(SCREENS)('%s: Back goes back', async (route, Page) => {
    const screen = await renderRouter({ index: Home, [route]: Page }, { initialUrl: '/' });
    await act(async () => { router.push((URLS[route] ?? `/${route}`) as never); });
    await waitFor(() => expect(screen.queryByText('Home screen')).toBeNull());
    await fireEvent.press(await screen.findByLabelText('Back'));
    expect(await screen.findByText('Home screen')).toBeTruthy();
  });

  // Opened with no history (app reloaded on this screen, or a link): Back / Close go to Today instead of doing nothing.
  const RootStack = () => <Stack screenOptions={{ headerShown: false }} />; // like app/_layout.tsx
  test('Back still works on a settings screen opened without history', async () => {
    const screen = await renderRouter({ _layout: RootStack, index: Home, 'settings/about': About }, { initialUrl: '/settings/about' });
    await fireEvent.press(await screen.findByLabelText('Back'));
    expect(await screen.findByText('Home screen')).toBeTruthy();
  });
  test('Close still works on a log sheet opened without history', async () => {
    const screen = await renderRouter({ _layout: RootStack, index: Home, 'log/note': LogNote }, { initialUrl: '/log/note' });
    await fireEvent.press(await screen.findByTestId('sheet-close'));
    expect(await screen.findByText('Home screen')).toBeTruthy();
  });
});
