/** A rounded surface (radius 16) with a soft shadow in light mode. */
import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { cardShadow, radius, space, useTheme } from './theme';

export function Card({ children, style, onPress, accessibilityLabel, accessibilityHint, tone, testID }: {
  children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void;
  accessibilityLabel?: string; accessibilityHint?: string; tone?: 'default' | 'soft'; testID?: string;
}) {
  const { c, scheme } = useTheme();
  const base: ViewStyle = {
    backgroundColor: tone === 'soft' ? c.primarySoft : c.surface, borderRadius: radius.card, padding: space.lg,
    borderWidth: scheme === 'dark' ? 1 : 0, borderColor: c.border, ...(tone === 'soft' ? {} : cardShadow(scheme)),
  };
  if (!onPress) return <View testID={testID} style={[base, style]}>{children}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint} onPress={onPress}
      style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}>
      {children}
    </Pressable>
  );
}
