/** Step 5: How often do hard moments happen? Sets the starting guess (intercept prior, SPEC 8.5 / 13.3). */
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { OnboardingFrame } from '../../src/features/OnboardingFrame';
import { DEFAULT_EPISODES_PER_WEEK, FREQUENCY_OPTIONS, useOnboarding } from '../../src/store/onboarding';
import { Chip } from '../../src/ui/Chip';
import { T } from '../../src/ui/Text';
import { space } from '../../src/ui/theme';

export default function Frequency() {
  const { t } = useTranslation();
  const chosen = useOnboarding((s) => s.frequencyChosen);
  const patch = useOnboarding((s) => s.patch);
  const set = useOnboarding((s) => s.set);
  const nickname = useOnboarding((s) => s.draft.child.nickname);
  const next = () => router.push('/(onboarding)/types');
  return (
    <OnboardingFrame step={5} title={t('frequency.title', { name: nickname })} subtitle={t('frequency.subtitle')} nextDisabled={!chosen} onNext={next}
      onSkip={() => { set({ episodesPerWeek: DEFAULT_EPISODES_PER_WEEK }); next(); }}>
      <View style={{ gap: space.sm }}>
        {FREQUENCY_OPTIONS.map((o) => (
          <Chip key={o.key} label={t(`frequency.${o.key}`)} selected={chosen === o.key}
            onPress={() => { patch({ frequencyChosen: o.key }); set({ episodesPerWeek: o.perWeek }); }} />
        ))}
      </View>
      <T variant="footnote" color="muted">{t('frequency.note')}</T>
    </OnboardingFrame>
  );
}
