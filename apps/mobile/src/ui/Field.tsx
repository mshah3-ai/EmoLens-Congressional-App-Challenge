/** Labeled form section and text input. */
import type { ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { T } from './Text';
import { radius, space, type as typeScale, useTheme } from './theme';

export function Field({ label, hint, children, optional }: { label: string; hint?: string; children: ReactNode; optional?: string }) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <T variant="headline" accessibilityRole="header" style={{ flexShrink: 1 }}>{label}</T>
        {optional ? <T variant="footnote" color="muted">{optional}</T> : null}
      </View>
      {hint ? <T variant="footnote" color="muted">{hint}</T> : null}
      <View style={{ marginTop: space.sm }}>{children}</View>
    </View>
  );
}

export function Input(props: TextInputProps & { label: string }) {
  const { c } = useTheme();
  const { label, style, ...rest } = props;
  return (
    <TextInput
      accessibilityLabel={label}
      placeholderTextColor={c.textMuted}
      {...rest}
      style={[typeScale.body, styles.input, { backgroundColor: c.surfaceAlt, color: c.text, borderColor: c.border },
        rest.multiline ? { minHeight: 96, textAlignVertical: 'top' } : null, style]}
    />
  );
}

const styles = StyleSheet.create({
  field: { gap: 2 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm, flexWrap: 'wrap' },
  input: { borderRadius: radius.control, borderWidth: 1, paddingHorizontal: space.md, paddingVertical: space.md, minHeight: 48 },
});
