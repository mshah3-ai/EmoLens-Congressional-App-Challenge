/** Risk level = color + icon + text label, never color alone (SPEC 9.2, 28.1). */
import { CircleCheck, Contrast, Sparkles, TriangleAlert, type LucideProps } from 'lucide-react-native';
import type { ComponentType } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { RiskLevel } from '@emolens/shared';
import { T } from './Text';
import { tint, useTheme } from './theme';

export const LEVEL_ICON: Record<RiskLevel, ComponentType<LucideProps>> = {
  low: CircleCheck, moderate: Contrast, high: TriangleAlert, learning: Sparkles,
};

export function useLevelColor() {
  const { c } = useTheme();
  return (level: RiskLevel) => ({ low: c.riskLow, moderate: c.riskModerate, high: c.riskHigh, learning: c.learning }[level]);
}

export function RiskBadge({ level, small }: { level: RiskLevel; small?: boolean }) {
  const { t } = useTranslation();
  const color = useLevelColor()(level);
  const Icon = LEVEL_ICON[level];
  return (
    <View accessibilityLabel={t(`risk.${level}`)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: small ? 8 : 10, paddingVertical: small ? 2 : 4, borderRadius: 999, backgroundColor: tint(color, 0.14) }}>
      <Icon size={small ? 14 : 16} color={color} strokeWidth={2.4} />
      <T variant={small ? 'footnote' : 'callout'} weight="600">{t(`risk.${level}`)}</T>
    </View>
  );
}
