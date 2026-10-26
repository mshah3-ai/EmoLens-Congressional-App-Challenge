/** The big "Log hard moment" button, bottom-right above the tabs (SPEC 9.2). First of the two fast-path taps. */
import { Pressable, StyleSheet } from 'react-native';
import { Zap } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { T } from './Text';
import { space, useTheme } from './theme';

export function Fab() {
  const { c } = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable
      testID="fab-log-episode"
      accessibilityRole="button"
      accessibilityLabel={t('fab.label')}
      accessibilityHint={t('fab.hint')}
      onPress={() => router.push('/log/episode')}
      style={({ pressed }) => [styles.fab, { backgroundColor: c.primary, transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      <Zap size={22} color={c.onPrimary} fill={c.onPrimary} />
      <T variant="headline" color="onPrimary">{t('fab.label')}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', right: space.lg, bottom: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingHorizontal: space.xl - 4, minHeight: 60, borderRadius: 30,
    shadowColor: '#1B2233', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
});
