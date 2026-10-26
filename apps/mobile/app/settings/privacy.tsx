/**
 * More → Privacy & security (SPEC 27): what is stored where, app lock, "Export all data" and "Import a backup"
 * (SPEC 22.5), and "Delete all data" (type DELETE to confirm; SPEC 27.4).
 */
import { useState } from 'react';
import { View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTranslation } from 'react-i18next';
import { Database, Download, Lock, ShieldCheck, Trash } from 'lucide-react-native';
import { BackupImport } from '../../src/features/BackupImport';
import { recordError } from '../../src/db/repo/errors';
import { failureToastKey } from '../../src/lib/steps';
import { shareBackup } from '../../src/reports/actions';
import { authenticate } from '../../src/security/AppGuard';
import { useSession } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { Field, Input } from '../../src/ui/Field';
import { toast } from '../../src/ui/Toast';
import { IconCircle, RowGroup, Section, ToggleRow } from '../../src/ui/bits';
import { Screen } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { space, useTheme } from '../../src/ui/theme';

export default function Privacy() {
  const { t } = useTranslation();
  const { accent, c } = useTheme();
  const settings = useSession((s) => s.settings);
  const update = useSession((s) => s.updateSettings);
  const deleteAll = useSession((s) => s.deleteAllData);
  const isDemo = useSession((s) => s.isDemo);
  const repo = useSession((s) => s.repo);
  const tz = useSession((s) => s.profile?.homeTz ?? 'UTC');
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const exportAll = async () => {
    if (!repo) return;
    setExporting(true);
    try { await shareBackup(repo.db, tz, settings.language); } catch (e) {
      await recordError(repo.db, 'backup.export', e);
      toast(t(failureToastKey(e)));
    } finally { setExporting(false); }
  };

  const setLock = async (on: boolean) => {
    if (on) {
      const available = (await LocalAuthentication.hasHardwareAsync()) || (await LocalAuthentication.isEnrolledAsync());
      if (!available || !(await authenticate(t('lock.prompt')))) { toast(t('settings.lockUnavailable')); return; }
    }
    await update({ app_lock: on });
  };

  return (
    <Screen back title={t('more.privacy')}>
      <Card style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <IconCircle icon={ShieldCheck} color={accent.place} />
          <T variant="headline" style={{ flex: 1 }}>{t('settings.privacyTitle')}</T>
        </View>
        {(['p1', 'p2', 'p3', 'p4'] as const).map((k) => <T key={k} variant="callout" color="muted">• {t(`settings.${k}`)}</T>)}
      </Card>
      <RowGroup>
        <ToggleRow title={t('settings.appLock')} subtitle={t('settings.appLockHint')} value={settings.app_lock} onChange={(v) => void setLock(v)} />
      </RowGroup>
      <Section title={t('backup.title')}>
        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
            <IconCircle icon={Database} color={accent.strategy} />
            <T variant="callout" style={{ flex: 1 }}>{t('backup.exportBody')}</T>
          </View>
          <T variant="footnote" color="muted">{t('backup.exportWarn')}</T>
          <Button testID="backup-export" variant="secondary" icon={Download} label={t('backup.export')} loading={exporting} onPress={() => void exportAll()} />
        </Card>
        <Card style={{ gap: space.md }}>
          <T variant="headline">{t('backup.importTitle')}</T>
          <T variant="callout" color="muted">{t('backup.importBody')}</T>
          <BackupImport />
        </Card>
      </Section>
      <Section title={t('settings.deleteTitle')}>
        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
            <IconCircle icon={Trash} color={c.danger} />
            <T variant="callout" style={{ flex: 1 }}>{t(isDemo ? 'settings.deleteBodyDemo' : 'settings.deleteBody')}</T>
          </View>
          <Field label={t('settings.deleteType')}>
            <Input testID="delete-confirm" label={t('settings.deleteType')} value={confirm} onChangeText={setConfirm} autoCapitalize="characters" autoCorrect={false} />
          </Field>
          <Button variant="danger" icon={Lock} label={t('settings.deleteButton')} loading={deleting} disabled={confirm.trim() !== 'DELETE'}
            onPress={async () => { setDeleting(true); await deleteAll(); }} />
        </Card>
      </Section>
    </Screen>
  );
}
