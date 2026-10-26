/** More → How EmoLens works: a plain-language explanation for families (and judges). */
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ChartColumn, Lock, NotebookPen, Sparkles, type LucideProps } from 'lucide-react-native';
import type { ComponentType } from 'react';
import { fmt, HOW_WE_KNOW } from '@emolens/shared';
import { currentLang } from '../../src/i18n';
import { useReady } from '../../src/store/session';
import { Card } from '../../src/ui/Card';
import { IconCircle } from '../../src/ui/bits';
import { Screen } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { space, useTheme } from '../../src/ui/theme';

export default function How() {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const { profile } = useReady();
  const steps: { icon: ComponentType<LucideProps>; color: string; title: string; body: string }[] = [
    { icon: NotebookPen, color: accent.note, title: t('how.s1Title'), body: t('how.s1Body') },
    { icon: Sparkles, color: accent.episode, title: t('how.s2Title'), body: fmt(HOW_WE_KNOW[currentLang()], { Nickname: profile.nickname }) },
    { icon: ChartColumn, color: accent.routine, title: t('how.s3Title'), body: t('how.s3Body') },
    { icon: Lock, color: accent.place, title: t('how.s4Title'), body: t('how.s4Body') },
  ];
  return (
    <Screen back title={t('more.howItWorks')}>
      {steps.map((s) => (
        <Card key={s.title} style={{ flexDirection: 'row', gap: space.md }}>
          <IconCircle icon={s.icon} color={s.color} />
          <View style={{ flex: 1, gap: space.xs }}>
            <T variant="headline">{s.title}</T>
            <T variant="callout" color="muted">{s.body}</T>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
