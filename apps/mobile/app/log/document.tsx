/**
 * Log → Document (SPEC 20.2): take or choose a photo of a school daily sheet or a note, read its text ON THE PHONE
 * (Apple Vision on iPhone, Google ML Kit on Android, through expo-text-extractor; DECISIONS #123), delete the photo
 * right away, let the parent fix the text, then the same pipeline as voice notes: save the note, find entries,
 * review. The photo is never stored or uploaded.
 */
import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Camera, Image as ImageIcon } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { extractTextFromImage } from 'expo-text-extractor';
import { aiGate } from '../../src/ai/gate';
import { toolEnvNow } from '../../src/ai/env';
import { addSourcedNote } from '../../src/db/repo/logs';
import { recordError } from '../../src/db/repo/errors';
import { nowIso } from '../../src/db/time';
import { afterSave } from '../../src/lib/save';
import { useReady } from '../../src/store/session';
import { useReview } from '../../src/store/review';
import { prepareReview } from '../../src/voice/prepare';
import { Button } from '../../src/ui/Button';
import { Input } from '../../src/ui/Field';
import { RowGroup, ToggleRow } from '../../src/ui/bits';
import { goBack, Sheet } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';

type Phase = 'pick' | 'reading' | 'edit' | 'structuring';

export default function DocumentImport() {
  const { t } = useTranslation();
  const { repo, profile, settings } = useReady();
  const [phase, setPhase] = useState<Phase>('pick');
  const [text, setText] = useState('');
  const [school, setSchool] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pick = async (from: 'camera' | 'library') => {
    setError(null);
    if (from === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { setError(t('document.failed')); return; }
    }
    const res = from === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets[0]) return;
    const uri = res.assets[0].uri;
    setPhase('reading');
    try {
      const lines = await extractTextFromImage(uri);
      const found = lines.join('\n').trim();
      if (!found) { setError(t('document.noText')); setPhase('pick'); return; }
      setText(found);
      setPhase('edit');
    } catch (e) {
      await recordError(repo.db, 'document.ocr', e);
      setError(t('document.failed'));
      setPhase('pick');
    } finally {
      // SPEC 20.2 / 27.1: the image is deleted right after OCR (the picker's copy in the app's cache)
      try { new File(uri).delete(); } catch { /* not our copy, or already gone */ }
    }
  };

  const saveNoteOnly = async () => {
    await addSourcedNote(repo, profile.id, { text, notedAt: nowIso(), source: 'document', audioPath: null, structuredStatus: 'none' });
    afterSave();
    goBack();
  };

  const findEntries = async () => {
    const env = toolEnvNow();
    if (!env) return;
    setPhase('structuring');
    useReview.getState().set(await prepareReview(text, 'document', school ? 'school_report' : 'other', null, env, await aiGate(settings)));
    router.replace('/log/review');
  };

  return (
    <Sheet title={t('document.title')} testID="document-sheet">
      {error ? <T variant="callout" color="danger">{error}</T> : null}
      {phase === 'pick' || phase === 'reading' ? (
        <>
          <T variant="callout" color="muted">{t('document.body')}</T>
          <Button testID="document-camera" icon={Camera} label={t('document.camera')} disabled={phase === 'reading'} onPress={() => void pick('camera')} />
          <Button testID="document-library" variant="secondary" icon={ImageIcon} label={t('document.library')} loading={phase === 'reading'} onPress={() => void pick('library')} />
          {phase === 'reading' ? <T variant="callout" accessibilityLiveRegion="polite">{t('document.reading')}</T> : null}
        </>
      ) : (
        <>
          <Input testID="document-text" label={t('document.textLabel')} value={text} onChangeText={setText} multiline style={{ minHeight: 180 }} />
          <RowGroup>
            <ToggleRow title={t('document.schoolReport')} value={school} onChange={setSchool} />
          </RowGroup>
          <Button testID="document-next" label={phase === 'structuring' ? t('voice.structuring') : t('voice.next')} loading={phase === 'structuring'}
            disabled={!text.trim()} onPress={() => void findEntries()} />
          <Button variant="secondary" label={t('voice.saveNoteOnly')} disabled={!text.trim() || phase === 'structuring'} onPress={() => void saveNoteOnly()} />
        </>
      )}
    </Sheet>
  );
}
