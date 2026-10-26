/** A large selectable card (one choice from a few), with icon, title and explanation. */
import type { ComponentType } from 'react';
import { Pressable, View } from 'react-native';
import type { LucideProps } from 'lucide-react-native';
import { Card } from './Card';
import { IconCircle, Pill } from './bits';
import { T } from './Text';
import { radius, space, useTheme } from './theme';

export function ChoiceCard({ icon, color, title, body, selected, onPress, badge, testID, disabled }: {
  icon: ComponentType<LucideProps>; color: string; title: string; body: string; selected: boolean; onPress: () => void; badge?: string; testID?: string; disabled?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Pressable testID={testID} accessibilityRole="radio" accessibilityState={{ selected, disabled: !!disabled }} disabled={disabled} accessibilityLabel={`${title}. ${body}`} onPress={onPress}
      style={({ pressed }) => [{ borderRadius: radius.card, borderWidth: 2, borderColor: selected ? c.primary : 'transparent', opacity: pressed ? 0.85 : 1 }]}>
      <Card style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
        <IconCircle icon={icon} color={color} />
        <View style={{ flex: 1, gap: space.xs }}>
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' }}>
            <T variant="headline">{title}</T>
            {badge ? <Pill label={badge} /> : null}
          </View>
          <T variant="callout" color="muted">{body}</T>
        </View>
      </Card>
    </Pressable>
  );
}

