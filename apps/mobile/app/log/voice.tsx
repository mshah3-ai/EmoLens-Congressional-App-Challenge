/**
 * Log → Voice (SPEC 20.1): record up to 3 minutes, turn the speech into text ON THE PHONE (whisper.rn), let the
 * parent fix the text, save it as a voice note, then find entries in it (AI if turned on, otherwise word rules) and
 * open the review screen. The recording is deleted right after transcription unless "Keep audio" is on.
 * First use downloads the speech model (size, progress, "Wi-Fi recommended", checked with SHA-256).
 */
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Download, Mic, Square } from 'lucide-react-native';
import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { File } from 'expo-file-system';
import { aiGate } from '../../src/ai/gate';
import { toolEnvNow } from '../../src/ai/env';
import { addSourcedNote } from '../../src/db/repo/logs';
import { recordError } from '../../src/db/repo/errors';
import { newId, nowIso } from '../../src/db/time';
import { currentLang } from '../../src/i18n';
import { afterSave } from '../../src/lib/save';
import { useReady } from '../../src/store/session';
import { useReview } from '../../src/store/review';
import { prepareReview } from '../../src/voice/prepare';
import { MODELS, ModelChecksumError, downloadModel, isModelReady, modelFor, voiceDir } from '../../src/voice/model';
import { MAX_RECORDING_MS, VOICE_RECORDING, voiceNotesSupported } from '../../src/voice/recording';
import { transcribe } from '../../src/voice/whisper';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { Input } from '../../src/ui/Field';
import { ProgressBar, RowGroup, ToggleRow } from '../../src/ui/bits';
import { goBack, Sheet } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { space } from '../../src/ui/theme';

type Phase =
  | { k: 'model' } | { k: 'downloading'; share: number } | { k: 'idle' } | { k: 'recording'; ms: number }
  | { k: 'transcribing'; pct: number } | { k: 'edit' } | { k: 'structuring' };

const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`;

export default function VoiceNote() {
  const { t } = useTranslation();
  const { repo, profile, settings } = useReady();
  const lang = currentLang();
  const model = modelFor(settings.voice_model, lang);
  const recorder = useAudioRecorder(VOICE_RECORDING);
  const [phase, setPhase] = useState<Phase>(() => (isModelReady(model) ? { k: 'idle' } : { k: 'model' }));
  const [error, setError] = useState<string | null>(null);
  const [keepAudio, setKeepAudio] = useState(false);
  const [text, setText] = useState('');
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    abort.current?.abort();
    void recorder.stop().catch(() => undefined);
  }, [recorder]);

  if (!voiceNotesSupported()) {
    return (
      <Sheet title={t('voice.title')}>
        <T variant="callout">{t('voice.notSupported')}</T>
        <Button variant="secondary" label={t('voice.typeNote')} onPress={() => router.replace('/log/note')} />
      </Sheet>
    );
  }

  const download = async () => {
    setError(null);
    abort.current = new AbortController();
    setPhase({ k: 'downloading', share: 0 });
    try {
      await downloadModel(model, (share) => setPhase({ k: 'downloading', share }), abort.current.signal);
      setPhase({ k: 'idle' });
    } catch (e) {
      await recordError(repo.db, 'voice.model', e);
      setError(t(e instanceof ModelChecksumError ? 'voice.checksum' : 'voice.modelFailed'));
      setPhase({ k: 'model' });
    }
  };

  const stopAndTranscribe = async () => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    setPhase({ k: 'transcribing', pct: 0 });
    let uri: string | null = null;
    try {
      await recorder.stop();
      uri = recorder.uri;
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      if (!uri) throw new Error('no recording');
      const words = await transcribe(uri, model, lang, (pct) => setPhase({ k: 'transcribing', pct }));
      if (!words) { setError(t('voice.emptyTranscript')); setPhase({ k: 'idle' }); return; }
      if (keepAudio) {
        const dir = voiceDir();
        if (!dir.exists) dir.create({ intermediates: true });
        const kept = new File(dir, `${newId()}.wav`);
        new File(uri).move(kept);
        setAudioPath(kept.uri);
        uri = null;
      }
      setText(words);
      setPhase({ k: 'edit' });
    } catch (e) {
      await recordError(repo.db, 'voice.transcribe', e);
      setError(t('voice.failed'));
      setPhase({ k: 'idle' });
    } finally {
      // SPEC 20.1 step 4: the recording is deleted right after transcription (unless kept above)
      try { if (uri) new File(uri).delete(); } catch { /* already gone */ }
    }
  };

  const record = async () => {
    setError(null);
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) { setError(t('voice.micDenied')); return; }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      const start = Date.now();
      setPhase({ k: 'recording', ms: 0 });
      timer.current = setInterval(() => {
        const ms = Date.now() - start;
        setPhase({ k: 'recording', ms });
        if (ms >= MAX_RECORDING_MS) void stopAndTranscribe();
      }, 250);
    } catch (e) {
      await recordError(repo.db, 'voice.record', e);
      setError(t('voice.failed'));
    }
  };

  const cancelRecording = async () => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    await recorder.stop().catch(() => undefined);
    try { if (recorder.uri) new File(recorder.uri).delete(); } catch { /* already gone */ }
    setPhase({ k: 'idle' });
  };

  const saveNoteOnly = async () => {
    await addSourcedNote(repo, profile.id, { text, notedAt: nowIso(), source: 'voice', audioPath, structuredStatus: 'none' });
    afterSave();
    goBack();
  };

  const findEntries = async () => {
    const env = toolEnvNow();
    if (!env) return;
    setPhase({ k: 'structuring' });
    useReview.getState().set(await prepareReview(text, 'voice', 'voice_note', audioPath, env, await aiGate(settings)));
    router.replace('/log/review');
  };

  const mb = Math.round(MODELS[model].bytes / 1_000_000);
  return (
    <Sheet title={t('voice.title')} testID="voice-sheet">
      {error ? <T variant="callout" color="danger">{error}</T> : null}
      {phase.k === 'model' || phase.k === 'downloading' ? (
        <Card style={{ gap: space.md }}>
          <T variant="headline">{t('voice.modelTitle')}</T>
          <T variant="callout" color="muted">{t('voice.modelBody', { mb })}</T>
          {phase.k === 'downloading' ? (
            <>
              <ProgressBar value={phase.share} label={t('voice.downloading', { pct: Math.round(phase.share * 100) })} />
              <T variant="footnote" color="muted">{t('voice.downloading', { pct: Math.round(phase.share * 100) })}</T>
            </>
          ) : <Button testID="voice-download" icon={Download} label={t('voice.download')} onPress={() => void download()} />}
        </Card>
      ) : null}
      {phase.k === 'idle' ? (
        <>
          <Button testID="voice-record" icon={Mic} label={t('voice.record')} onPress={() => void record()} />
          <T variant="footnote" color="muted">{t('voice.maxNote')}</T>
          <RowGroup>
            <ToggleRow title={t('voice.keepAudio')} subtitle={t('voice.keepAudioHint')} value={keepAudio} onChange={setKeepAudio} />
          </RowGroup>
        </>
      ) : null}
      {phase.k === 'recording' ? (
        <View style={{ gap: space.md }}>
          <T variant="title" accessibilityLiveRegion="polite">{t('voice.recording', { time: clock(phase.ms) })}</T>
          <ProgressBar value={phase.ms / MAX_RECORDING_MS} label={t('voice.recording', { time: clock(phase.ms) })} />
          <Button testID="voice-stop" icon={Square} label={t('voice.stop')} onPress={() => void stopAndTranscribe()} />
          <Button variant="secondary" label={t('common.cancel')} onPress={() => void cancelRecording()} />
        </View>
      ) : null}
      {phase.k === 'transcribing' ? <T variant="callout" accessibilityLiveRegion="polite">{t('voice.transcribing', { pct: Math.round(phase.pct) })}</T> : null}
      {phase.k === 'edit' || phase.k === 'structuring' ? (
        <>
          <Input testID="voice-text" label={t('voice.transcriptLabel')} value={text} onChangeText={setText} multiline style={{ minHeight: 140 }} />
          <Button testID="voice-next" label={phase.k === 'structuring' ? t('voice.structuring') : t('voice.next')} loading={phase.k === 'structuring'}
            disabled={!text.trim()} onPress={() => void findEntries()} />
          <Button variant="secondary" label={t('voice.saveNoteOnly')} disabled={!text.trim() || phase.k === 'structuring'} onPress={() => void saveNoteOnly()} />
        </>
      ) : null}
    </Sheet>
  );
}

