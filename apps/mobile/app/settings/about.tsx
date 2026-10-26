/** More → About & disclaimers, with Diagnostics: the local error log (no personal data), copyable (SPEC 29). */
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Bug } from 'lucide-react-native';
import { listErrors } from '../../src/db/repo/errors';
import { readSnapshot } from '../../src/forecast/snapshot';
import { fmtAgo } from '../../src/i18n/format';
import type { ErrorRow } from '../../src/db/rows';
import { useDbQuery } from '../../src/lib/useDbQuery';
import { useSession } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { toast } from '../../src/ui/Toast';
import { EmptyState, Section } from '../../src/ui/bits';
import { LensMark } from '../../src/ui/LensMark';
import { Screen } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { space } from '../../src/ui/theme';

export default function About() {
  const { t } = useTranslation();
  const repo = useSession((s) => s.repo);
  const { data: errors } = useDbQuery<ErrorRow[]>(() => (repo ? listErrors(repo.db) : Promise.resolve([])), [repo], []);
  // Performance budget check (SPEC 13.10): how long the last forecast run took on this phone.
  const childId = useSession((s) => s.profile?.id);
  const { data: lastRun } = useDbQuery(() => (repo && childId ? readSnapshot(repo.db, childId) : Promise.resolve(null)), [repo, childId], null);
  const copy = async () => {
    await Clipboard.setStringAsync(errors.map((e) => `${e.at} [${e.area}] ${e.message}`).join('\n'));
    toast(t('settings.copied'));
  };
  return (
    <Screen back title={t('more.about')}>
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <LensMark size={72} />
        <T variant="title">EmoLens</T>
        <T variant="footnote" color="muted">{t('settings.version', { version: Constants.expoConfig?.version ?? '0.1.0' })}</T>
      </View>
      <Card style={{ gap: space.md }}>
        <T variant="headline">{t('settings.disclaimerTitle')}</T>
        <T variant="callout">{t('welcome.notMedical')}</T>
        <T variant="callout" color="muted">{t('settings.disclaimer2')}</T>
        <T variant="callout" color="muted">{t('settings.disclaimer3')}</T>
      </Card>
      <Section title={t('settings.diagnostics')}>
        <T variant="footnote" color="muted">{t('settings.diagnosticsHint')}</T>
        {lastRun ? <T variant="footnote" color="muted" testID="about-last-forecast">{t('about.lastForecast', { when: fmtAgo(new Date(lastRun.computedAt).toISOString()) })}</T> : null}
        {/* development builds only (QA_CHECKLIST row 49, the 13.10 time budget); families never see it */}
        {__DEV__ && lastRun ? <T variant="footnote" color="muted" testID="about-engine-ms">{`Engine run: ${Math.round(lastRun.engineMs)} ms (development build)`}</T> : null}
        {errors.length ? (
          <Card style={{ gap: space.sm }}>
            {errors.slice(0, 20).map((e) => <T key={e.id} variant="footnote" selectable>{`${e.at.slice(0, 16).replace('T', ' ')} · ${e.area} · ${e.message}`}</T>)}
            <Button small variant="secondary" label={t('errors.copyDetails')} onPress={() => void copy()} />
          </Card>
        ) : <Card><EmptyState icon={Bug} title={t('settings.noErrors')} /></Card>}
      </Section>
    </Screen>
  );
}
