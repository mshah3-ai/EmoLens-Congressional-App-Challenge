/** Shown while the demo profile is built (src/demo/build.ts): what is happening, and a progress bar by simulated day. */
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useSession } from '../store/session';
import { ProgressBar } from '../ui/bits';
import { LensMark } from '../ui/LensMark';
import { T } from '../ui/Text';
import { space, useTheme } from '../ui/theme';

export function BuildingScreen() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const p = useSession((s) => s.demoProgress);
  const days = p?.days || 120;
  const value = !p ? 0 : p.phase === 'simulating' ? (p.day / days) * 0.9 : p.phase === 'saving' ? 0.93 : 0.97;
  const line = !p || p.phase === 'simulating' ? t('demo.buildingDay', { day: p?.day ?? 0, days }) : p.phase === 'saving' ? t('demo.buildingSaving') : t('demo.buildingForecast');
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View testID="demo-building" style={{ flex: 1, justifyContent: 'center', padding: space.xl, gap: space.lg }}>
        <View style={{ alignItems: 'center' }}><LensMark size={88} /></View>
        <T variant="title" center accessibilityRole="header">{t('demo.building')}</T>
        <T variant="body" color="muted" center>{t('demo.buildingBody', { days })}</T>
        <ProgressBar value={value} label={line} />
        <T variant="headline" center accessibilityLiveRegion="polite">{line}</T>
        <T variant="footnote" color="muted" center>{t('demo.buildingNote')}</T>
      </View>
    </SafeAreaView>
  );
}
