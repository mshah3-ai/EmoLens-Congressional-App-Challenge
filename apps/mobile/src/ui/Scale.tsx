/** A 1..N scale with a word under each number (intensity 1-5, quality 1-5, severity 1-3). */
import { Pressable, StyleSheet, View } from 'react-native';
import { T } from './Text';
import { radius, space, useTheme } from './theme';

export function Scale({ labels, value, onChange, label, testIDPrefix }: {
  labels: string[]; value: number | null; onChange: (n: number | null) => void; label: string; testIDPrefix?: string;
}) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.row}>
      {labels.map((word, i) => {
        const n = i + 1;
        const selected = value === n;
        return (
          <Pressable key={n} testID={testIDPrefix ? `${testIDPrefix}-${n}` : undefined} accessibilityRole="radio" accessibilityState={{ selected }}
            accessibilityLabel={`${n}, ${word}`} onPress={() => onChange(selected ? null : n)}
            style={[styles.item, { backgroundColor: selected ? c.primary : c.surfaceAlt, borderColor: selected ? c.primary : c.border }]}>
            <T variant="headline" color={selected ? 'onPrimary' : 'text'} center>{n}</T>
            <T variant="footnote" color={selected ? 'onPrimary' : 'muted'} center>{word}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  item: { flexGrow: 1, flexBasis: 58, minHeight: 64, borderRadius: radius.control, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: space.xs },
});
