/** Text in the SPEC 28.1 type scale. Font scaling is always on (Dynamic Type, SPEC 28.2). */
import { Text as RNText, type TextProps } from 'react-native';
import { type, useTheme, type TypeVariant } from './theme';

export interface TProps extends TextProps {
  variant?: TypeVariant;
  color?: 'text' | 'muted' | 'primary' | 'onPrimary' | 'danger' | string;
  weight?: '400' | '500' | '600' | '700';
  center?: boolean;
}

export function T({ variant = 'body', color = 'text', weight, center, style, ...rest }: TProps) {
  const { c } = useTheme();
  const map: Record<string, string> = { text: c.text, muted: c.textMuted, primary: c.primary, onPrimary: c.onPrimary, danger: c.danger };
  return (
    <RNText
      {...rest}
      style={[type[variant], { color: map[color] ?? color }, weight ? { fontWeight: weight } : null, center ? { textAlign: 'center' } : null, style]}
    />
  );
}
