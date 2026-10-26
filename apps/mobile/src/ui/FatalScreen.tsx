/**
 * Full-screen error states (SPEC 29):
 *  - crash: the global error boundary ("Something went wrong", Try again, Copy details)
 *  - migration_failed: the database could not be upgraded; data is kept, offer Retry
 *  - error: the database could not be opened
 * "Copy details" copies only the error class and message, never personal data.
 */
import * as Clipboard from 'expo-clipboard';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TriangleAlert } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useSession } from '../store/session';
import { Button } from './Button';
import { T } from './Text';
import { space, useTheme } from './theme';

export function FatalScreen({ kind, error, retry }: { kind: 'crash' | 'migration_failed' | 'error'; error?: Error; retry?: () => Promise<void> }) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const storeError = useSession((s) => s.error);
  const boot = useSession((s) => s.boot);
  const details = error ? `${error.name}: ${error.message}` : storeError ?? '';
  const title = kind === 'crash' ? t('errors.crashTitle') : kind === 'migration_failed' ? t('errors.migrationTitle') : t('errors.openTitle');
  const body = kind === 'crash' ? t('errors.crashBody') : kind === 'migration_failed' ? t('errors.migrationBody') : t('errors.openBody');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg, flexGrow: 1, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', gap: space.md }}>
          <TriangleAlert size={44} color={c.riskModerate} />
          <T variant="title" center accessibilityRole="header">{title}</T>
          <T variant="callout" color="muted" center>{body}</T>
        </View>
        <Button label={t('errors.tryAgain')} onPress={() => { if (retry) void retry(); else void boot(); }} />
        <Button label={t('errors.copyDetails')} variant="secondary" onPress={() => { void Clipboard.setStringAsync(details); }} />
      </ScrollView>
    </SafeAreaView>
  );
}
