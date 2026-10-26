/** "DEMO DATA: not a real child" banner shown on every screen in demo mode (SPEC 9.10). */
import { View } from 'react-native';
import { FlaskConical } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useSession } from '../store/session';
import { T } from './Text';
import { space, useTheme } from './theme';

export function DemoBanner() {
  const isDemo = useSession((s) => s.isDemo);
  const { c } = useTheme();
  const { t } = useTranslation();
  if (!isDemo) return null;
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: c.demo, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm }}>
      <FlaskConical size={16} color={c.onDemo} />
      <T variant="footnote" weight="700" color={c.onDemo} style={{ flex: 1 }}>{t('demo.banner')}</T>
    </View>
  );
}
