/** Step 2: Who's using EmoLens. Required adult/caregiver checkbox (SPEC 8.2, 27.3). */
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { HeartHandshake } from 'lucide-react-native';
import { OnboardingFrame } from '../../src/features/OnboardingFrame';
import { useOnboarding } from '../../src/store/onboarding';
import { Card } from '../../src/ui/Card';
import { Chip } from '../../src/ui/Chip';
import { IconCircle } from '../../src/ui/bits';
import { T } from '../../src/ui/Text';
import { space, useTheme } from '../../src/ui/theme';

export default function Who() {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const confirmed = useOnboarding((s) => s.ageConfirmed);
  const patch = useOnboarding((s) => s.patch);
  return (
    <OnboardingFrame step={2} title={t('who.title')} onNext={() => router.push('/(onboarding)/mode')} nextDisabled={!confirmed}>
      <Card style={{ flexDirection: 'row', gap: space.md }}>
        <IconCircle icon={HeartHandshake} color={accent.illness} />
        <View style={{ flex: 1, gap: space.xs }}>
          <T variant="body">{t('who.body1')}</T>
          <T variant="callout" color="muted">{t('who.body2')}</T>
        </View>
      </Card>
      <Chip testID="age-confirm" label={t('who.confirm')} selected={confirmed} onPress={() => patch({ ageConfirmed: !confirmed })} />
    </OnboardingFrame>
  );
}
