/** Buttons: primary (filled), secondary (tinted), ghost (text only), danger. At least 48 pt tall. */
import type { ComponentType, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { LucideProps } from 'lucide-react-native';
import { T } from './Text';
import { radius, space, useTheme } from './theme';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: ComponentType<LucideProps>;
  disabled?: boolean;
  loading?: boolean;
  hint?: string;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
  testID?: string;
  right?: ReactNode;
}

export function Button({ label, onPress, variant = 'primary', icon: Icon, disabled, loading, hint, style, small, testID, right }: ButtonProps) {
  const { c } = useTheme();
  const bg = { primary: c.primary, secondary: c.primarySoft, ghost: 'transparent', danger: c.danger }[variant];
  const fg = { primary: c.onPrimary, secondary: c.primary, ghost: c.primary, danger: c.onPrimary }[variant];
  const fgText = variant === 'secondary' ? c.text : fg;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, minHeight: small ? 44 : 52, paddingHorizontal: small ? space.md : space.lg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : (
        <View style={styles.row}>
          {Icon ? <Icon size={small ? 18 : 20} color={fg} strokeWidth={2.2} /> : null}
          <T variant={small ? 'callout' : 'headline'} color={fgText} weight="600" center style={{ flexShrink: 1 }}>{label}</T>
          {right}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.control + 2, alignItems: 'center', justifyContent: 'center', paddingVertical: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', justifyContent: 'center' },
});
