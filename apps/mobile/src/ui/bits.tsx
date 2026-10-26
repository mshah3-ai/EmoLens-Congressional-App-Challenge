/** Small building blocks used across screens. */
import type { ComponentType, ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { ChevronRight, Minus, Plus, type LucideProps } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { T } from './Text';
import { radius, space, tint, useTheme } from './theme';

/** A tinted circle with an icon (quick-add buttons, list rows). */
export function IconCircle({ icon: Icon, color, size = 44 }: { icon: ComponentType<LucideProps>; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tint(color, 0.14), alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={size * 0.5} color={color} strokeWidth={2.2} />
    </View>
  );
}

/** Section heading + content. */
export function Section({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: space.md }}>
      {title ? (
        <View style={styles.sectionHead}>
          <T variant="title" accessibilityRole="header" style={{ flexShrink: 1 }}>{title}</T>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** A tappable settings/list row with optional icon, subtitle and trailing value. */
export function ListRow({ title, subtitle, icon, iconColor, value, onPress, right, danger, testID, accessibilityHint }: {
  title: string; subtitle?: string; icon?: ComponentType<LucideProps>; iconColor?: string; value?: string;
  onPress?: () => void; right?: ReactNode; danger?: boolean; testID?: string; accessibilityHint?: string;
}) {
  const { c } = useTheme();
  const body = (
    <>
      {icon ? <IconCircle icon={icon} color={iconColor ?? c.primary} size={36} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="body" color={danger ? 'danger' : 'text'}>{title}</T>
        {subtitle ? <T variant="footnote" color="muted">{subtitle}</T> : null}
      </View>
      {value ? <T variant="callout" color="muted" style={{ maxWidth: '45%' }} numberOfLines={2}>{value}</T> : null}
      {right}
      {onPress && !right ? <ChevronRight size={20} color={c.textMuted} /> : null}
    </>
  );
  if (!onPress) return <View testID={testID} style={styles.row}>{body}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={value ? `${title}, ${value}` : title} accessibilityHint={accessibilityHint}
      onPress={onPress} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceAlt : 'transparent' }]}>
      {body}
    </Pressable>
  );
}

/** A group of rows on one card, separated by hairlines. */
export function RowGroup({ children }: { children: ReactNode }) {
  const { c, scheme } = useTheme();
  const items = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: radius.card, overflow: 'hidden', borderWidth: scheme === 'dark' ? 1 : 0, borderColor: c.border }}>
      {items.map((child, i) => (
        <View key={i} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border } : null}>{child}</View>
      ))}
    </View>
  );
}

export function ToggleRow({ title, subtitle, value, onChange, testID }: {
  title: string; subtitle?: string; value: boolean; onChange: (v: boolean) => void; testID?: string;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="body">{title}</T>
        {subtitle ? <T variant="footnote" color="muted">{subtitle}</T> : null}
      </View>
      <Switch testID={testID} accessibilityLabel={title} value={value} onValueChange={onChange}
        trackColor={{ true: c.primary, false: c.border }} thumbColor="#FFFFFF" />
    </View>
  );
}

/** − n + control for small counts. */
export function Stepper({ value, onChange, min = 0, max = 20, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const btn = (Icon: ComponentType<LucideProps>, next: number, a11y: string, disabled: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} disabled={disabled} onPress={() => onChange(next)}
      style={[styles.stepBtn, { backgroundColor: c.surfaceAlt, opacity: disabled ? 0.4 : 1 }]}>
      <Icon size={20} color={c.text} />
    </Pressable>
  );
  return (
    <View style={styles.stepper} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ now: value, min, max }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onChange(Math.max(min, Math.min(max, value + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}>
      {btn(Minus, Math.max(min, value - 1), t('common.decrease'), value <= min)}
      <T variant="title" style={{ minWidth: 40 }} center>{value}</T>
      {btn(Plus, Math.min(max, value + 1), t('common.increase'), value >= max)}
    </View>
  );
}

export function ProgressBar({ value, color, label }: { value: number; color?: string; label: string }) {
  const { c } = useTheme();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{ height: 8, borderRadius: 4, backgroundColor: c.border, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color ?? c.primary, borderRadius: 4 }} />
    </View>
  );
}

/** Friendly empty state (SPEC 28.3: every list has one). */
export function EmptyState({ icon: Icon, title, body, action }: { icon: ComponentType<LucideProps>; title: string; body?: string; action?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: c.primarySoft }]}><Icon size={32} color={c.primary} /></View>
      <T variant="headline" center>{title}</T>
      {body ? <T variant="callout" color="muted" center>{body}</T> : null}
      {action}
    </View>
  );
}

/** Small rounded label, e.g. "Soon", "Demo". */
export function Pill({ label, color }: { label: string; color?: string }) {
  const { c } = useTheme();
  const col = color ?? c.textMuted;
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: col }}>
      <T variant="footnote" color={col === c.textMuted ? 'muted' : 'text'} weight="600">{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, paddingHorizontal: space.lg, paddingVertical: space.md },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl, paddingHorizontal: space.lg },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
});
