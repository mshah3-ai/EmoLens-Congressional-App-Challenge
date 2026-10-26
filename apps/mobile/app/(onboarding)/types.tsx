/** Step 6: Which kinds of hard moments to track (SPEC 8.6, modeled_episode_types). */
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { EpisodeType } from '@emolens/shared';
import { OnboardingFrame } from '../../src/features/OnboardingFrame';
import { toggle, useOnboarding } from '../../src/store/onboarding';
import { Card } from '../../src/ui/Card';
import { Chip } from '../../src/ui/Chip';
import { T } from '../../src/ui/Text';
import { space } from '../../src/ui/theme';

const TYPES: EpisodeType[] = ['meltdown', 'shutdown', 'other'];

export default function Types() {
  const { t } = useTranslation();
  const types = useOnboarding((s) => s.draft.modeledTypes);
  const set = useOnboarding((s) => s.set);
  const next = () => router.push('/(onboarding)/triggers');
  return (
    <OnboardingFrame step={6} title={t('types.title')} subtitle={t('types.subtitle')} nextDisabled={types.length === 0} onNext={next}
      onSkip={() => { set({ modeledTypes: TYPES }); next(); }}>
      <View style={{ gap: space.md }}>
        {TYPES.map((k) => (
          <Card key={k} style={{ gap: space.sm }}>
            <Chip label={t(`episode.types.${k}`)} selected={types.includes(k)} onPress={() => set({ modeledTypes: toggle(types, k) })} />
            <T variant="callout" color="muted">{t(`types.desc.${k}`)}</T>
          </Card>
        ))}
      </View>
    </OnboardingFrame>
  );
}
