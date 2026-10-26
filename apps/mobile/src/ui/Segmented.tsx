/** Segmented control: one choice from a few options. Wraps onto several lines at large font sizes. */
import { Pressable, StyleSheet, View } from 'react-native';
import { T } from './Text';
import { radius, space, useTheme } from './theme';

export function Segmented<V extends string | number>({ options, value, onChange, testIDPrefix }: {
  options: { value: V; label: string }[]; value: V | null; onChange: (v: V) => void; testIDPrefix?: string;
}) {
  const { c } = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={[styles.wrap, { backgroundColor: c.surfaceAlt }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            testID={testIDPrefix ? `${testIDPrefix}-${o.value}` : undefined}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={[styles.item, selected && { backgroundColor: c.surface, borderColor: c.primary, borderWidth: 1.5 }]}>
            <T variant="callout" weight={selected ? '600' : '400'} center color={selected ? 'text' : 'muted'}>{o.label}</T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: radius.control + 2, padding: 4, gap: 4 },
  item: { flexGrow: 1, flexBasis: 80, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm, borderRadius: radius.control, borderWidth: 1.5, borderColor: 'transparent' },
});
