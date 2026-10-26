/**
 * More → AI features (SPEC 19.1): the consent screen. It lists exactly what may be sent to the AI provider through
 * EmoLens's server and what never is, links to Anthropic's privacy policy, and turns AI on only after
 * "I understand, turn on AI features". An account is required (the daily limit is counted per person).
 * Also: share calendar titles (off by default) and which on-device speech model voice notes use.
 */
import { View } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';
import { Bot, ExternalLink, ShieldCheck } from 'lucide-react-native';
import { useAiGate } from '../../src/ai/gate';
import { useSession } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { IconCircle, RowGroup, Section, ToggleRow } from '../../src/ui/bits';
import { Segmented } from '../../src/ui/Segmented';
import { Screen } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { space, useTheme } from '../../src/ui/theme';

const ANTHROPIC_PRIVACY_URL = 'https://www.anthropic.com/legal/privacy';

export default function AiFeatures() {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const settings = useSession((s) => s.settings);
  const update = useSession((s) => s.updateSettings);
  const isDemo = useSession((s) => s.isDemo);
  const name = useSession((s) => s.profile?.nickname ?? '');
  const gate = useAiGate();
  const on = settings.cloud_ai_enabled;

  return (
    <Screen back title={t('ai.title')} testID="ai-settings">
      <Card style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <IconCircle icon={Bot} color={accent.strategy} />
          <T variant="callout" style={{ flex: 1 }}>{t('ai.intro', { name })}</T>
        </View>
        {isDemo ? <T variant="footnote" color="muted">{t('ai.demoNote')}</T> : null}
      </Card>

      <Card style={{ gap: space.sm }} testID="ai-consent">
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <IconCircle icon={ShieldCheck} color={accent.place} size={36} />
          <T variant="headline" style={{ flex: 1 }}>{on ? t('ai.onTitle') : t('ai.consentTitle')}</T>
        </View>
        <T variant="callout" weight="600">{t('ai.sentTitle')}</T>
        {(['sent1', 'sent2', 'sent3', 'sent4'] as const).map((k) => <T key={k} variant="callout" color="muted">• {t(`ai.${k}`)}</T>)}
        <T variant="callout" weight="600">{t('ai.notSentTitle')}</T>
        {(['notSent1', 'notSent2', 'notSent3', 'notSent4'] as const).map((k) => <T key={k} variant="callout" color="muted">• {t(`ai.${k}`, { name })}</T>)}
        <T variant="footnote" color="muted">{t('ai.retention')}</T>
        <Button small variant="secondary" icon={ExternalLink} label={t('ai.policyLink')} onPress={() => void Linking.openURL(ANTHROPIC_PRIVACY_URL)} />
      </Card>

      {gate && !gate.signedIn ? (
        <Card style={{ gap: space.md }}>
          <T variant="callout">{t('ai.needAccount')}</T>
          <Button testID="ai-go-account" label={t('ai.goAccount')} onPress={() => router.push('/settings/account' as never)} />
        </Card>
      ) : on ? (
        <Button testID="ai-turn-off" variant="secondary" label={t('ai.turnOff')} onPress={() => void update({ cloud_ai_enabled: false })} />
      ) : (
        <Button testID="ai-accept" label={t('ai.accept')} disabled={!gate} onPress={() => void update({ cloud_ai_enabled: true })} />
      )}

      <Section title={t('ai.voiceModel')}>
        <Segmented testIDPrefix="ai-model" options={[{ value: 'tiny' as const, label: t('ai.modelTiny') }, { value: 'base' as const, label: t('ai.modelBase') }]}
          value={settings.voice_model} onChange={(voice_model) => void update({ voice_model })} />
        <T variant="footnote" color="muted">{t('ai.voiceModelHint')}</T>
      </Section>

      {on ? (
        <RowGroup>
          <ToggleRow testID="ai-share-titles" title={t('ai.shareTitles')} subtitle={t('ai.shareTitlesHint')} value={settings.ai_share_event_titles}
            onChange={(v) => void update({ ai_share_event_titles: v })} />
        </RowGroup>
      ) : null}
      <T variant="footnote" color="muted">{t('ai.disclaimer')}</T>
    </Screen>
  );
}
