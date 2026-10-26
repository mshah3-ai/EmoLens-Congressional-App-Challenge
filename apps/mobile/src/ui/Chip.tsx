/** Selectable chip. Selection is shown by fill + check icon, never by color alone. */
import type { ComponentType, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check, type LucideProps } from 'lucide-react-native';
import { T } from './Text';
import { radius, space, useTheme } from './theme';

export function Chip({ label, selected, onPress, icon: Icon, accessibilityHint, testID }: {
  label: string; selected?: boolean; onPress: () => void; icon?: ComponentType<LucideProps>; accessibilityHint?: string; testID?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!selected }}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.chip, {
        backgroundColor: selected ? c.primarySoft : c.surface, borderColor: selected ? c.primary : c.border, opacity: pressed ? 0.8 : 1,
      }]}>
      {selected ? <Check size={16} color={c.primary} strokeWidth={2.6} /> : Icon ? <Icon size={16} color={c.textMuted} /> : null}
      <T variant="callout" weight={selected ? '600' : '400'} style={{ flexShrink: 1 }}>{label}</T>
    </Pressable>
  );
}

export function ChipGroup({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: space.md + 2, paddingVertical: space.sm, borderRadius: radius.chip, borderWidth: 1.5 },
  group: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
