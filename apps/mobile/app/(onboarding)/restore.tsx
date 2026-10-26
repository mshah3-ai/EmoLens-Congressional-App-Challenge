/**
 * Welcome → "Restore from a backup" (SPEC 22.5: moving to a new phone in local-only mode). Choosing an EmoLens export
 * file brings back the child's profile, logs and settings; once it is in, the app opens on Today (the backup already
 * finished onboarding).
 */
import { useTranslation } from 'react-i18next';
import { BackupImport } from '../../src/features/BackupImport';
import { Card } from '../../src/ui/Card';
import { Screen } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { space } from '../../src/ui/theme';

export default function Restore() {
  const { t } = useTranslation();
  return (
    <Screen back title={t('backup.restoreTitle')} subtitle={t('backup.restoreSub')} testID="restore-screen">
      <Card style={{ gap: space.md }}>
        <T variant="callout">{t('backup.restoreBody')}</T>
        <BackupImport />
      </Card>
    </Screen>
  );
}
