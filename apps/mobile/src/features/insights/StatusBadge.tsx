/** A pattern's status (SPEC 14.3) as icon + text, never color alone. */
import type { ComponentType } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Hourglass, Minus, Search, ShieldCheck, TrendingUp, EyeOff, type LucideProps } from 'lucide-react-native';
import type { InsightStatus } from '@emolens/engine';
import { T } from '../../ui/Text';
import { tint, useTheme } from '../../ui/theme';

export const STATUS_ICON: Record<InsightStatus, ComponentType<LucideProps>> = {
  strong: BadgeCheck, likely: TrendingUp, possible: TrendingUp, protective: ShieldCheck, no_clear_link: Minus,
  checking: Search, not_enough_data: Hourglass, hidden: EyeOff,
};

export function useStatusColor() {
  const { c } = useTheme();
  return (s: InsightStatus) => ({
    strong: c.primary, likely: c.primary, possible: c.riskModerate, protective: c.riskLow,
    no_clear_link: c.textMuted, checking: c.learning, not_enough_data: c.learning, hidden: c.learning,
  }[s]);
}

export function StatusBadge({ status }: { status: InsightStatus }) {
  const { t } = useTranslation();
  const color = useStatusColor()(status);
  const Icon = STATUS_ICON[status];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: tint(color, 0.14) }}>
      <Icon size={14} color={color} strokeWidth={2.4} />
      <T variant="footnote" weight="600">{t(`status.${status}`)}</T>
    </View>
  );
}
