/** Quick-add grid (SPEC 9.2): one tap opens each log sheet, plus Voice and School note (Phase 8, SPEC 20). */
import type { ComponentType } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AudioLines, ScanText, type LucideProps } from 'lucide-react-native';
import { IconCircle } from '../../ui/bits';
import { T } from '../../ui/Text';
import { radius, space, useTheme, type AccentKey } from '../../ui/theme';
import { KINDS, QUICK_ADD, TEACHER_QUICK_ADD } from '../kinds';

/** Voice notes and photos of school notes: both become notes, then reviewed entries (SPEC 20). */
const EXTRA: { key: string; icon: ComponentType<LucideProps>; accent: AccentKey; route: string }[] = [
  { key: 'voice', icon: AudioLines, accent: 'note', route: '/log/voice' },
  { key: 'document', icon: ScanText, accent: 'note', route: '/log/document' },
];

export function QuickAdd({ teacher = false }: { teacher?: boolean }) {
  const { t } = useTranslation();
  const { c, accent } = useTheme();
  const items: { key: string; icon: ComponentType<LucideProps>; accent: AccentKey; route: string }[] = [
    ...(teacher ? TEACHER_QUICK_ADD : QUICK_ADD).map((k) => ({ key: k as string, ...KINDS[k] })),
    ...EXTRA,
  ];
  return (
    <View style={styles.grid}>
      {items.map((info) => (
        <Pressable key={info.key} testID={`quick-${info.key}`} accessibilityRole="button" accessibilityLabel={t(`quick.${info.key}`)} onPress={() => router.push(info.route as never)}
          style={({ pressed }) => [styles.item, { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.8 : 1 }]}>
          <IconCircle icon={info.icon} color={accent[info.accent]} />
          <T variant="footnote" weight="600" center>{t(`quick.${info.key}`)}</T>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  item: { flexGrow: 1, flexBasis: '22%', minWidth: 76, alignItems: 'center', gap: space.xs + 2, paddingVertical: space.md, paddingHorizontal: space.xs, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth },
});
