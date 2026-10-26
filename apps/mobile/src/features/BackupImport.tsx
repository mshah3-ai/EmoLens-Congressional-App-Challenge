/**
 * "Import a backup" (SPEC 22.5), used in Privacy & security and on the welcome screen ("Restore from a backup"):
 *   1. choose an EmoLens export file (the system file picker: Files, iCloud Drive, Downloads...);
 *   2. EmoLens checks it and shows whose data it is, when it was made and how many entries it has;
 *   3. "Import" merges it (the newer edit of each entry wins). If the phone already has a DIFFERENT child, the only
 *      option is "Replace this phone's data", after typing REPLACE.
 * A file that fails the checks changes nothing and says why.
 */
import { useState } from 'react';
import { View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useTranslation } from 'react-i18next';
import { FolderOpen, Upload } from 'lucide-react-native';
import { ImportError, previewImport, type ImportPreview } from '../backup/import';
import { recordError } from '../db/repo/errors';
import { rootError, step } from '../lib/steps';
import { requestForecast } from '../forecast';
import { dateYearAt } from '@emolens/reports';
import { useSession } from '../store/session';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Field, Input } from '../ui/Field';
import { T } from '../ui/Text';
import { toast } from '../ui/Toast';
import { space } from '../ui/theme';

/** Reads the chosen file's text; null when the parent cancelled. Steps are labelled for the error log. */
async function pickBackupText(): Promise<string | null> {
  const res = await step('pick', () => DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false }));
  if (res.canceled || !res.assets[0]) return null;
  const uri = res.assets[0].uri;
  return step('read', () => new File(uri).text());
}

export function BackupImport({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation();
  const repo = useSession((s) => s.repo);
  const isDemo = useSession((s) => s.isDemo);
  const lang = useSession((s) => s.settings.language);
  const current = useSession((s) => s.profile?.nickname ?? '');
  const importBackup = useSession((s) => s.importBackup);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const choose = async () => {
    if (!repo) return;
    setBusy(true);
    try {
      const text = await pickBackupText();
      if (text != null) { setConfirm(''); setPreview(await step('check', () => previewImport(repo.db, text))); }
    } catch (e) {
      // A file that isn't a valid backup is the parent's choice, not a bug; anything else is logged with its step.
      const root = rootError(e);
      if (!(root instanceof ImportError)) await recordError(repo.db, 'backup.import', e);
      toast(root instanceof ImportError ? t(`backup.problem.${root.problem}`) : t('backup.failed'));
    } finally { setBusy(false); }
  };

  const apply = async (replace: boolean) => {
    if (!preview || !repo) return;
    setBusy(true);
    try {
      const r = await step('import', () => importBackup(preview, replace));
      setPreview(null);
      toast(r.added === 0 && r.updated === 0 ? t('backup.nothingNew') : t('backup.imported', { added: r.added, updated: r.updated }));
      requestForecast(500);
      onDone?.();
    } catch (e) {
      await recordError(repo.db, 'backup.import', e);
      toast(t('backup.failed'));
    } finally { setBusy(false); }
  };

  if (isDemo) return <T variant="callout" color="muted">{t('backup.demoBlocked')}</T>;
  const entries = preview?.counts.reduce((a, c) => a + c.rows, 0) ?? 0;
  const episodes = preview?.counts.find((c) => c.table === 'episodes')?.rows ?? 0;
  return (
    <View style={{ gap: space.md }}>
      <Button testID="backup-choose" variant="secondary" icon={FolderOpen} label={t('backup.choose')} loading={busy && !preview} disabled={busy}
        onPress={() => void choose()} />
      {preview ? (
        <Card testID="backup-preview" style={{ gap: space.sm }}>
          <T variant="headline">{t('backup.previewTitle', { name: preview.nickname })}</T>
          <T variant="callout" color="muted">{t('backup.previewDate', { date: dateYearAt(lang, Date.parse(preview.exportedAt), preview.homeTz) })}</T>
          <T variant="callout">{t('backup.previewRows', { count: entries })} · {t('backup.previewEpisodes', { count: episodes })}</T>
          {preview.match === 'different' ? (
            <>
              <T variant="callout">{t('backup.different', { mine: current, theirs: preview.nickname })}</T>
              <Field label={t('backup.replaceType')}>
                <Input testID="backup-replace-confirm" label={t('backup.replaceType')} value={confirm} onChangeText={setConfirm} autoCapitalize="characters" autoCorrect={false} />
              </Field>
              <Button testID="backup-replace" variant="danger" icon={Upload} label={t('backup.replace')} loading={busy} disabled={confirm.trim() !== 'REPLACE'}
                onPress={() => void apply(true)} />
            </>
          ) : (
            <>
              <T variant="footnote" color="muted">{t(preview.match === 'fresh' ? 'backup.freshNote' : 'backup.mergeNote')}</T>
              <Button testID="backup-import" icon={Upload} label={t('backup.import')} loading={busy} onPress={() => void apply(false)} />
            </>
          )}
          <Button variant="ghost" label={t('common.cancel')} onPress={() => setPreview(null)} />
        </Card>
      ) : null}
    </View>
  );
}
