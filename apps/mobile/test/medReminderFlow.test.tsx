/**
 * BUGS.md #6: "Medication reminder never arrives." The parent's exact steps: More → Medications → Add, type "melat",
 * pick an RxNorm suggestion, set a time 2 minutes ahead, Save. The reminder must be scheduled for that time with the
 * Given / Skip buttons, the save message must say when it comes, and "Given" on it must mark today's dose.
 */
import { act, fireEvent, renderRouter, waitFor } from 'expo-router/testing-library';
import { router } from 'expo-router';
import { Text } from 'react-native';
import * as Notifications from 'expo-notifications';
import { localDateOf, localMinuteOf } from '@emolens/engine';
import { completeOnboarding } from '../src/db/repo/onboarding';
import { configureNotifications } from '../src/notifications';
import { handleMedAction } from '../src/notifications/medActions';
import { freshDraft } from '../src/store/onboarding';
import { useSession } from '../src/store/session';
import { fmtDayTime } from '../src/i18n/format';
import { toast } from '../src/ui/Toast';
import MedicationEdit from '../app/settings/medication';
import { testRepo } from './nodeDb';

// Like the Simulator: the phone and the child's home share a time zone.
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const mockPicked = Date.now() + 2 * 60_000;

jest.mock('expo-localization', () => ({
  ...jest.requireActual('expo-localization'),
  getCalendars: () => [{ timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }],
}));
jest.mock('../src/ui/Toast', () => ({ toast: jest.fn(), ToastHost: () => null }));
jest.mock('../src/integrations/rxnorm', () => ({ searchMedications: jest.fn(async () => [{ rxcui: '42', name: 'melatonin 3 MG Oral Tablet' }]) }));
// The iOS wheel is native; this stand-in "spins" to 2 minutes from now when pressed.
jest.mock('@react-native-community/datetimepicker', () => {
  const { Pressable } = jest.requireActual('react-native');
  const Picker = ({ onValueChange }: { onValueChange: (e: object, d: Date) => void }) =>
    <Pressable testID="picker-spin" onPress={() => onValueChange({}, new Date(mockPicked))} />;
  return { __esModule: true, default: Picker, DateTimePickerAndroid: { open: jest.fn() } };
});
jest.setTimeout(20000);

test('adding a medication schedules its reminder, says when, and "Given" marks the dose', async () => {
  // Only today's date is ever meaningful here; skip the rare run in the last 2 minutes before midnight.
  if (localDateOf(mockPicked, TZ) !== localDateOf(Date.now(), TZ)) return;
  const repo = await testRepo();
  await completeOnboarding(repo, { ...freshDraft(), child: { ...freshDraft().child, nickname: 'Sam', homeTz: TZ } });
  await useSession.getState().useRepoForTests(repo);
  await configureNotifications();

  const Home = () => <Text>home</Text>;
  const screen = await renderRouter({ index: Home, 'settings/medication': MedicationEdit }, { initialUrl: '/' });
  await act(async () => { router.push('/settings/medication'); });
  await fireEvent.changeText(await screen.findByTestId('med-name'), 'melat');
  await fireEvent.press(await screen.findByText('melatonin 3 MG Oral Tablet', {}, { timeout: 3000 }));
  await fireEvent.press(screen.getByLabelText(/^Time 1/));
  await fireEvent.press(await screen.findByTestId('picker-spin'));
  await fireEvent.press(screen.getByText('Done'));
  await fireEvent.press(screen.getByTestId('med-save'));

  // Scheduled at the picked clock time, repeating daily, with the Given / Skip category.
  const minute = localMinuteOf(mockPicked, TZ);
  const hhmm = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  await waitFor(() => expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({
    content: expect.objectContaining({ categoryIdentifier: 'MED_DOSE', data: expect.objectContaining({ time: hhmm }) }),
    trigger: { type: 'daily', hour: Math.floor(minute / 60), minute: minute % 60 },
  })));
  expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith('MED_DOSE',
    [expect.objectContaining({ identifier: 'TAKEN', buttonTitle: 'Given' }), expect.objectContaining({ identifier: 'SKIP', buttonTitle: 'Skip' })]);

  // The save message says when the reminder comes.
  const exactMinute = mockPicked - (mockPicked % 60_000);
  await waitFor(() => expect(toast).toHaveBeenCalledWith(`Saved. Next reminder: ${fmtDayTime(exactMinute, TZ)}.`));

  // "Given" on that reminder marks today's dose as taken.
  const request = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls.at(-1)[0] as Notifications.NotificationRequestInput;
  const response = { actionIdentifier: 'TAKEN', notification: { request: { content: request.content } } } as unknown as Notifications.NotificationResponse;
  expect(await handleMedAction(response)).toBe(true);
  const doses = (await repo.db.execute("SELECT status FROM med_doses WHERE deleted_at IS NULL")).rows;
  expect(doses.map((d) => d.status)).toContain('taken');
});
