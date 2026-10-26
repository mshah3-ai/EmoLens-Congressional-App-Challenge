/**
 * Runs one sound check (SPEC 11.6): record with metering on, read the level every 250 ms for `seconds`, stop,
 * DELETE the audio file, and save only the average. Never asks for microphone permission by itself (`autoOnly`):
 * the automatic 60-second check on the hard-moment sheet runs only if permission was already given.
 *
 * A check stops quietly (no error, nothing saved) when its screen closes, when EmoLens goes to the background, or when
 * the phone was asleep mid-check (a 250 ms wait that took many seconds). After any of those the native recorder may
 * already be released, so it is not touched again (BUGS #32).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getRecordingPermissionsAsync, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { File } from 'expo-file-system';
import { currentVisit } from '../db/repo/logs';
import { recordError } from '../db/repo/errors';
import { nowIso } from '../db/time';
import { useSession } from '../store/session';
import { averageDbfs, estimatedDb, saveSoundSample } from './sound';

export type SoundCheckState =
  | { phase: 'idle' } | { phase: 'no_permission' } | { phase: 'measuring'; secondsLeft: number; current: number | null }
  | { phase: 'done'; levelDb: number } | { phase: 'failed' } | { phase: 'stopped' };

const TICK_MS = 250;
/** A tick this late means the app was suspended (phone or Mac asleep): the recording can't be trusted. */
const SUSPENDED_MS = 5000;

/** expo-audio's error when the native recorder behind a JavaScript object has been released. */
export const isReleasedRecorderError = (e: unknown) =>
  e instanceof Error && /NotFoundException|native shared object/i.test(`${e.name} ${e.message}`);

export function useSoundCheck() {
  const recorder = useAudioRecorder({ ...RecordingPresets.LOW_QUALITY, isMeteringEnabled: true });
  const [state, setStateRaw] = useState<SoundCheckState>({ phase: 'idle' });
  const mounted = useRef(true);
  /** Each check gets the next number; anything that must stop a check bumps it, so the old check sees it's stale. */
  const runId = useRef(0);
  const active = useRef(false);
  const setState = useCallback((s: SoundCheckState) => { if (mounted.current) setStateRaw(s); }, []);

  useEffect(() => {
    mounted.current = true;
    // 'background' only: iOS reports 'inactive' while the microphone permission dialog is open.
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'background' || !active.current) return;
      runId.current += 1;
      active.current = false;
      // Stop now, while the recorder still exists; the check itself never touches it again.
      void Promise.resolve().then(() => recorder.stop()).catch(() => undefined);
      setState({ phase: 'stopped' });
    });
    return () => { mounted.current = false; runId.current += 1; sub.remove(); };
  }, [recorder, setState]);

  const run = useCallback(async (seconds: number, opts: { askPermission: boolean }) => {
    const { repo, profile, settings } = useSession.getState();
    if (!repo || !profile) return;
    const id = ++runId.current;
    const live = () => runId.current === id;
    active.current = true;
    const perm = opts.askPermission ? await requestRecordingPermissionsAsync() : await getRecordingPermissionsAsync();
    if (!live()) return;
    if (!perm.granted) { active.current = false; setState({ phase: opts.askPermission ? 'no_permission' : 'idle' }); return; }
    const readings: number[] = [];
    let stopped = false; // stopped early by the app (not an error)
    let failed = false;
    let recording = false;
    let fileUri: string | null = null;
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      fileUri = recorder.uri;
      recorder.record();
      recording = true;
      const start = Date.now();
      let last = start;
      while (Date.now() - start < seconds * 1000) {
        await new Promise((r) => setTimeout(r, TICK_MS));
        if (!live() || Date.now() - last > SUSPENDED_MS) { stopped = true; break; }
        last = Date.now();
        const m = recorder.getStatus().metering;
        if (typeof m === 'number') readings.push(m);
        const avg = averageDbfs(readings.slice(-8));
        setState({ phase: 'measuring', secondsLeft: Math.ceil(seconds - (Date.now() - start) / 1000), current: avg == null ? null : estimatedDb(avg, settings.phone_db_offset) });
      }
    } catch (e) {
      if (live() && !isReleasedRecorderError(e)) {
        await recordError(repo.db, 'sound', e);
        failed = true;
      } else stopped = true;
    } finally {
      // A stale check (screen closed, app in the background) leaves the recorder alone: it was stopped or released.
      // Stopping one the system released anyway (asleep mid-check) throws, which only means nothing is left to stop.
      if (recording && live()) await Promise.resolve().then(() => recorder.stop()).catch(() => undefined);
      // The recording itself is never kept (SPEC 11.6, 27.1).
      try { if (fileUri) new File(fileUri).delete(); } catch { /* already gone */ }
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
    }
    if (live()) active.current = false; else return;
    if (failed) { setState({ phase: 'failed' }); return; }
    if (stopped) { setState({ phase: 'stopped' }); return; }
    const avg = averageDbfs(readings);
    if (avg == null) { setState({ phase: 'failed' }); return; }
    const level = estimatedDb(avg, settings.phone_db_offset);
    const visit = await currentVisit(repo.db, profile.id);
    await saveSoundSample(repo.db, nowIso(), level, seconds, visit?.place_id ?? null);
    useSession.getState().bump();
    setState({ phase: 'done', levelDb: level });
  }, [recorder, setState]);

  return { state, run };
}
