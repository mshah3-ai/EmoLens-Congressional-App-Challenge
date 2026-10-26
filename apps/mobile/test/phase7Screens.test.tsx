/**
 * Phase 7 screens: More → Account (sign in with an emailed code), Team (turn on Care Team, members, invite), onboarding
 * "Join a care team" (a teacher's phone gets the child and shows "Today at school"), and the removed-from-team message.
 * The cloud is the in-memory FakeCloud; the email-code sign-in is faked (the real one needs Supabase).
 */
import { Alert } from 'react-native';
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { Text } from 'react-native';
import { buildDemo } from '../src/demo/build';
import { getAllSettings, setSettings } from '../src/db/repo/settings';
import { all } from '../src/db/types';
import { setCloudApiForTests } from '../src/cloud/current';
import { syncIdle, syncNow } from '../src/sync/engine';
import { useSession } from '../src/store/session';
import Account from '../app/settings/account';
import Team from '../app/(tabs)/team/index';
import Invite from '../app/team/invite';
import Mode from '../app/(onboarding)/mode';
import Join from '../app/(onboarding)/join';
import Today from '../app/(tabs)/index';
import { RemovedScreen } from '../src/features/cloud/RemovedScreen';
import { FakeCloud } from './fakeCloud';
import { testRepo } from './nodeDb';

jest.setTimeout(120_000);

const OWNER = '11111111-1111-4111-8111-111111111111';
const TEACHER = '33333333-3333-4333-8333-333333333333';
const NOW = Date.parse('2026-09-30T16:00:00.000Z');

jest.mock('../src/forecast', () => ({ ...jest.requireActual('../src/forecast'), requestForecast: jest.fn() }));
jest.mock('../src/cloud/client', () => ({
  ...jest.requireActual('../src/cloud/client'),
  cloudConfigured: () => true,
  PORTAL_URL: 'https://portal.example',
  sendCode: jest.fn(async () => null),
  verifyCode: jest.fn(async (email: string, code: string) => (code === '123456'
    ? { userId: email.startsWith('teacher') ? '33333333-3333-4333-8333-333333333333' : '11111111-1111-4111-8111-111111111111', email }
    : { error: 'wrong_code' })),
  currentUserId: jest.fn(async () => null),
}));

// Alert.alert: press the last button (the "yes" choice)
jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { buttons?.[buttons.length - 1]?.onPress?.(); });

const cloud = new FakeCloud();
afterEach(async () => { await syncIdle(); setCloudApiForTests(null); });

async function ownerPhone() {
  const repo = await testRepo();
  await buildDemo(repo, { lang: 'en', tz: 'America/Chicago', now: NOW, days: 14, yieldToUi: false });
  await setSettings(repo.db, { simulated_sources: false, demo_info: null });
  await useSession.getState().useRepoForTests(repo);
  return repo;
}

test('More → Account: sign in with the emailed code; new entries then carry the account id', async () => {
  const repo = await ownerPhone();
  await renderRouter({ 'settings/account': Account }, { initialUrl: '/settings/account' });
  await fireEvent.changeText(await screen.findByTestId('signin-email'), 'owner@test.local');
  await fireEvent.press(screen.getByTestId('signin-send'));
  expect(await screen.findByText('We emailed a 6-digit code to owner@test.local. It can take a minute to arrive.')).toBeTruthy();
  await fireEvent.changeText(screen.getByTestId('signin-code'), '000000');
  await fireEvent.press(screen.getByTestId('signin-verify'));
  expect(await screen.findByText("That code didn't work. Check it, or send a new one.")).toBeTruthy();
  await fireEvent.changeText(screen.getByTestId('signin-code'), '123456');
  await fireEvent.press(screen.getByTestId('signin-verify'));
  await waitFor(async () => expect((await getAllSettings(repo.db)).account_user_id).toBe(OWNER));
  expect((await getAllSettings(repo.db))).toMatchObject({ account_email: 'owner@test.local', mode: 'account', care_team_enabled: false });
  expect(repo.env.createdBy).toBe(OWNER);
});

test('Team: turn on Care Team uploads the history; the owner invites a teacher and gets a code', async () => {
  const repo = await ownerPhone();
  await setSettings(repo.db, { account_user_id: OWNER, account_email: 'owner@test.local', mode: 'account' });
  await useSession.getState().reload();
  setCloudApiForTests(cloud.as(OWNER));

  await renderRouter({ 'team/index': Team, 'team/invite': Invite }, { initialUrl: '/team' });
  expect(await screen.findByText('What your team never gets')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('team-turn-on'));
  await waitFor(() => expect(useSession.getState().settings.care_team_enabled).toBe(true));
  await syncNow();
  await syncIdle();
  await waitFor(async () => expect((await getAllSettings(repo.db)).care_team_pushed).toBe(true));
  expect(cloud.rows('episodes').length).toBe((await all(repo.db, 'SELECT id FROM episodes')).length);
  expect(await screen.findByTestId('sync-status')).toBeTruthy();
  expect(await screen.findByTestId('member-owner')).toBeTruthy();

  await fireEvent.press(screen.getByTestId('team-invite'));
  // Before any code is made, a plain-language preview of what the role will and won't see (Phase 10 privacy review).
  expect(await screen.findByTestId('invite-preview-caregiver')).toBeTruthy();
  expect(screen.getByText('Caregiver: what they\'ll see and do')).toBeTruthy();
  expect(screen.getByText('Invite or remove people, or make share links')).toBeTruthy();
  await fireEvent.press(await screen.findByTestId('invite-teacher'));
  expect(await screen.findByTestId('invite-preview-teacher')).toBeTruthy();
  expect(screen.queryByTestId('invite-preview-caregiver')).toBeNull();
  for (const line of ['Today\'s school-hours outlook (levels only, no reasons)', 'Medications, sleep logs or health data',
    'Home or any place outside school', 'Patterns, reports, or hard moments logged at home']) expect(screen.getByText(line)).toBeTruthy();
  expect(screen.getByText(/are never shared with the team/)).toBeTruthy();
  expect(screen.getByText('Create code for Teacher')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('invite-clinician'));
  expect(await screen.findByText('Change or delete anything you logged')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('invite-teacher'));
  await fireEvent.press(screen.getByTestId('invite-submit'));
  expect(await screen.findByTestId('invite-code')).toBeTruthy();
  expect(cloud.invites.at(-1)).toMatchObject({ role: 'teacher', used: false });
});

test('onboarding: a teacher joins with the code; the phone gets the child and shows "Today at school"', async () => {
  const code = cloud.invites.at(-1)!.code;
  const fresh = await testRepo();
  await useSession.getState().useRepoForTests(fresh);
  expect(useSession.getState().status).toBe('onboarding');
  setCloudApiForTests(cloud.as(TEACHER));
  await cloud.as(OWNER).upsert('school_forecasts', [{ child_id: useSession.getState().child?.id ?? cloud.rows('children')[0].id,
    local_date: '2026-09-30', blocks: [{ start: '2026-09-30T15:00:00.000Z', end: '2026-09-30T17:00:00.000Z', level: 'moderate' }], computed_at: '2026-09-30T12:00:00.000Z' }], 'child_id,local_date');

  const Home = () => <Text>Home</Text>;
  await renderRouter({ index: Home, '(onboarding)/mode': Mode, '(onboarding)/join': Join }, { initialUrl: '/mode' });
  await fireEvent.press(await screen.findByTestId('mode-join'));
  await fireEvent.press(screen.getByTestId('onboarding-next'));
  await fireEvent.changeText(await screen.findByTestId('signin-email'), 'teacher@test.local');
  await fireEvent.press(screen.getByTestId('signin-send'));
  await fireEvent.changeText(await screen.findByTestId('signin-code'), '123456');
  await fireEvent.press(screen.getByTestId('signin-verify'));
  await fireEvent.changeText(await screen.findByTestId('join-code'), code);
  await fireEvent.press(screen.getByTestId('onboarding-next'));
  await waitFor(() => expect(useSession.getState().status).toBe('ready'));
  const s = useSession.getState().settings;
  expect(s).toMatchObject({ member_role: 'teacher', care_team_enabled: true, primary_forecaster: false, receive_alerts: false, account_user_id: TEACHER });
  expect(await all(fresh.db, 'SELECT id FROM medications')).toHaveLength(0);
  expect(useSession.getState().child?.nickname).toBe('Sam (demo)');

  // the teacher's Today: school-hours levels, no forecast of its own, only what teachers can log
  await syncNow();
  await syncIdle();
  await act(async () => { useSession.getState().bump(); });
  await renderRouter({ index: Today }, { initialUrl: '/' });
  expect(await screen.findByTestId('school-card')).toBeTruthy();
  expect(screen.queryByTestId('hero-status')).toBeNull();
  expect(screen.queryByTestId('quick-dose')).toBeNull();
  expect(screen.getByTestId('quick-meal')).toBeTruthy();
});

test('removed from the team: the message names the child, says the data was removed, and offers no way to keep it', async () => {
  await ownerPhone();
  useSession.setState({ removedNotice: { name: 'Sam (demo)' } });
  await renderRouter({ index: RemovedScreen }, { initialUrl: '/' });
  expect(await screen.findByText("You're no longer on Sam (demo)'s care team.")).toBeTruthy();
  expect(screen.getByText('Their information has been removed from this phone.')).toBeTruthy();
  expect(screen.queryByTestId('removed-keep')).toBeNull();
  expect(screen.queryByTestId('removed-delete')).toBeNull();
  await fireEvent.press(screen.getByTestId('removed-ok'));
  await waitFor(() => expect(useSession.getState().removedNotice).toBeNull());
});
