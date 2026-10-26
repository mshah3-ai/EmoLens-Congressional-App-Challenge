/**
 * BUGS #32: the sound check stops quietly when its screen closes, when EmoLens goes to the background, or when the
 * phone slept mid-check, and never touches a recorder iOS may have released ("Unable to find the native shared
 * object"). A normal check still saves its average.
 */
import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { render } from '@testing-library/react-native';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Audio from 'expo-audio';
import { completeOnboarding } from '../src/db/repo/onboarding';
import { freshDraft } from '../src/store/onboarding';
import { all } from '../src/db/types';
import { useSession } from '../src/store/session';
import { useSoundCheck, isReleasedRecorderError, type SoundCheckState } from '../src/integrations/useSoundCheck';
import SoundSheet from '../app/log/sound';
import { testRepo } from './nodeDb';

jest.setTimeout(30_000);

type Recorder = { prepareToRecordAsync: jest.Mock; record: jest.Mock; stop: jest.Mock; getStatus: jest.Mock; uri: string | null };
let recorder: Recorder;
let onAppState: ((s: AppStateStatus) => void) | null;

beforeEach(async () => {
  recorder = { prepareToRecordAsync: jest.fn(async () => undefined), record: jest.fn(), stop: jest.fn(async () => undefined), getStatus: jest.fn(() => ({ metering: -40 })), uri: null };
  (Audio.useAudioRecorder as jest.Mock).mockReturnValue(recorder);
  (Audio.getRecordingPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  (Audio.requestRecordingPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  onAppState = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    onAppState = handler as (s: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
  const repo = await testRepo();
  await completeOnboarding(repo, { ...freshDraft(), child: { ...freshDraft().child, nickname: 'Sam', homeTz: 'America/Chicago' } });
  await useSession.getState().useRepoForTests(repo);
});
afterEach(() => jest.restoreAllMocks());

const db = () => useSession.getState().repo!.db;
const errors = () => all<{ area: string }>(db(), 'SELECT area FROM app_errors');
const samples = () => all<{ level_db: number }>(db(), 'SELECT level_db FROM sound_samples');
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

/** Starts one check of `seconds` and reports every state. */
function Harness({ seconds, onState }: { seconds: number; onState: (s: SoundCheckState) => void }) {
  const { state, run } = useSoundCheck();
  useEffect(() => { void run(seconds, { askPermission: false }); }, [run, seconds]);
  useEffect(() => { onState(state); }, [state, onState]);
  return null;
}

test('a normal check saves only its average', async () => {
  const states: SoundCheckState[] = [];
  await render(<Harness seconds={1} onState={(s) => states.push(s)} />);
  await waitFor(() => expect(states.at(-1)?.phase).toBe('done'), { timeout: 5000 });
  expect(await samples()).toHaveLength(1);
  expect(recorder.stop).toHaveBeenCalledTimes(1);
  expect(await errors()).toEqual([]);
});

test('going to the background stops the check: no error, nothing saved, the recorder is not touched again', async () => {
  const states: SoundCheckState[] = [];
  await render(<Harness seconds={5} onState={(s) => states.push(s)} />);
  await waitFor(() => expect(states.at(-1)?.phase).toBe('measuring'));
  await act(async () => { onAppState?.('background'); });
  expect(states.at(-1)?.phase).toBe('stopped');
  expect(recorder.stop).toHaveBeenCalledTimes(1);
  const reads = recorder.getStatus.mock.calls.length;
  // Coming back: iOS may have released the recorder by now; any use of it would throw.
  recorder.getStatus.mockImplementation(() => { throw new Error('NotFoundException: Unable to find the native shared object'); });
  recorder.stop.mockImplementation(() => { throw new Error('NotFoundException: Unable to find the native shared object'); });
  await act(async () => { onAppState?.('active'); });
  await wait(800);
  expect(recorder.getStatus.mock.calls.length).toBe(reads);
  expect(recorder.stop).toHaveBeenCalledTimes(1);
  expect(states.at(-1)?.phase).toBe('stopped');
  expect(await errors()).toEqual([]);
  expect(await samples()).toEqual([]);
});

test("'inactive' (the permission dialog is open) does not stop the check", async () => {
  const states: SoundCheckState[] = [];
  await render(<Harness seconds={1} onState={(s) => states.push(s)} />);
  await waitFor(() => expect(states.at(-1)?.phase).toBe('measuring'));
  await act(async () => { onAppState?.('inactive'); onAppState?.('active'); });
  await waitFor(() => expect(states.at(-1)?.phase).toBe('done'), { timeout: 5000 });
});

test('closing the screen mid-check stops it quietly and leaves the released recorder alone', async () => {
  const states: SoundCheckState[] = [];
  const view = await render(<Harness seconds={5} onState={(s) => states.push(s)} />);
  await waitFor(() => expect(states.at(-1)?.phase).toBe('measuring'));
  const reads = recorder.getStatus.mock.calls.length;
  await view.unmount();
  await wait(800);
  expect(recorder.getStatus.mock.calls.length).toBeLessThanOrEqual(reads + 1);
  expect(recorder.stop).not.toHaveBeenCalled();
  expect(await errors()).toEqual([]);
  expect(await samples()).toEqual([]);
});

test('the reported error (released recorder after the Mac slept) is not logged and the check shows "stopped"', async () => {
  recorder.getStatus.mockImplementation(() => {
    throw new Error("FunctionCallException: Calling the 'getStatus' function has failed → Caused by: NotFoundException: Unable to find the native shared object associated with given JavaScript object");
  });
  const states: SoundCheckState[] = [];
  await render(<Harness seconds={2} onState={(s) => states.push(s)} />);
  await waitFor(() => expect(states.at(-1)?.phase).toBe('stopped'));
  expect(await errors()).toEqual([]);
  expect(await samples()).toEqual([]);
});

test('a 250 ms wait that took many seconds (asleep) stops the check without reading the recorder', async () => {
  const realNow = Date.now.bind(Date);
  let jump = 0;
  jest.spyOn(Date, 'now').mockImplementation(() => realNow() + jump);
  const states: SoundCheckState[] = [];
  await render(<Harness seconds={30} onState={(s) => states.push(s)} />);
  await waitFor(() => expect(states.at(-1)?.phase).toBe('measuring'));
  const reads = recorder.getStatus.mock.calls.length;
  jump = 10_000;
  await waitFor(() => expect(states.at(-1)?.phase).toBe('stopped'));
  expect(recorder.getStatus.mock.calls.length).toBe(reads);
  expect(await errors()).toEqual([]);
  expect(await samples()).toEqual([]);
});

test('a real failure is still logged for Diagnostics', async () => {
  recorder.prepareToRecordAsync.mockRejectedValue(new Error('AudioSessionError: busy'));
  const states: SoundCheckState[] = [];
  await render(<Harness seconds={1} onState={(s) => states.push(s)} />);
  await waitFor(() => expect(states.at(-1)?.phase).toBe('failed'));
  expect((await errors()).map((e) => e.area)).toEqual(['sound']);
});

test('the Sound check screen explains the stop and offers "Measure again"', async () => {
  await renderRouter({ 'log/sound': SoundSheet }, { initialUrl: '/log/sound' });
  await waitFor(() => expect(screen.getByText(/Listening/)).toBeTruthy());
  await act(async () => { onAppState?.('background'); });
  expect(screen.getByText('The sound check stopped because EmoLens went to the background. Nothing was saved.')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('sound-again'));
  await waitFor(() => expect(screen.getByText(/Listening/)).toBeTruthy());
});

test('isReleasedRecorderError recognises only the released-recorder error', () => {
  expect(isReleasedRecorderError(new Error('NotFoundException: Unable to find the native shared object'))).toBe(true);
  expect(isReleasedRecorderError(new Error('AudioSessionError: busy'))).toBe(false);
  expect(isReleasedRecorderError('NotFoundException')).toBe(false);
});
