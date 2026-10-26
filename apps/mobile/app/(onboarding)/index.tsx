/** Step 1: Welcome. Name, tagline, three value cards, language picker (SPEC 8.1), and "Restore from a backup" (SPEC 22.5). */
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChartColumn, Lightbulb, Users, type LucideProps } from 'lucide-react-native';
import type { ComponentType } from 'react';
import type { Lang } from '@emolens/shared';
import { OnboardingFrame } from '../../src/features/OnboardingFrame';
import { setLanguage } from '../../src/i18n';
import { useOnboarding } from '../../src/store/onboarding';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { IconCircle } from '../../src/ui/bits';
import { LensMark } from '../../src/ui/LensMark';
import { Segmented } from '../../src/ui/Segmented';
import { T } from '../../src/ui/Text';
import { space, useTheme } from '../../src/ui/theme';

export default function Welcome() {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const lang = useOnboarding((s) => s.draft.language);
  const set = useOnboarding((s) => s.set);
  const choose = (l: Lang) => { set({ language: l }); setLanguage(l); };
  const cards: { icon: ComponentType<LucideProps>; color: string; title: string; body: string }[] = [
    { icon: ChartColumn, color: accent.episode, title: t('welcome.forecastTitle'), body: t('welcome.forecastBody') },
    { icon: Lightbulb, color: accent.routine, title: t('welcome.understandTitle'), body: t('welcome.understandBody') },
    { icon: Users, color: accent.place, title: t('welcome.shareTitle'), body: t('welcome.shareBody') },
  ];
  return (
    <OnboardingFrame step={1} title={t('welcome.title')} subtitle={t('welcome.tagline')} nextLabel={t('welcome.start')} onNext={() => router.push('/(onboarding)/who')}>
      <View style={{ alignItems: 'center', marginVertical: -space.sm }}><LensMark size={84} /></View>
      <View style={{ gap: space.md }}>
        {cards.map((card, i) => (
          <Animated.View key={card.title} entering={FadeInDown.delay(100 + i * 120).duration(300)}>
            <Card style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
              <IconCircle icon={card.icon} color={card.color} />
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="headline">{card.title}</T>
                <T variant="callout" color="muted">{card.body}</T>
              </View>
            </Card>
          </Animated.View>
        ))}
      </View>
      <View style={{ gap: space.sm }}>
        <T variant="headline">{t('welcome.language')}</T>
        <Segmented<Lang> options={[{ value: 'en', label: 'English' }, { value: 'es', label: 'Español' }]} value={lang} onChange={choose} />
      </View>
      <Button testID="welcome-restore" variant="ghost" label={t('backup.restore')} onPress={() => router.push('/(onboarding)/restore')} />
      <T variant="footnote" color="muted">{t('welcome.notMedical')}</T>
    </OnboardingFrame>
  );
}
