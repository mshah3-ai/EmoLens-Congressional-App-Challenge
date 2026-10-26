/**
 * Day risk strip (SPEC 9.2): one segment per awake 2-hour block.
 *  - Now and later: the forecast level as color + icon (Low ✓ circle, Moderate half circle, High triangle, Learning
 *    sparkles), with the level name in the segment's label. Never color alone.
 *  - Earlier: how it went: ⚡ a hard moment, 🤝 stepped in early, ✓ calm, · nothing known yet.
 * Tap a segment to open its block sheet.
 */
import type { ComponentType } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Check, Dot, HandHeart, Zap, type LucideProps } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import type { Block, LabelStatus, RiskLevel } from '@emolens/shared';
import { blockRange } from '../../i18n/format';
import { LEVEL_ICON, useLevelColor } from '../../ui/RiskBadge';
import { T } from '../../ui/Text';
import { radius, space, tint, useTheme } from '../../ui/theme';

export interface StripBlock { block: Block; level: RiskLevel | null; label: LabelStatus | null; episodes: number; }

const OUTCOME_ICON: Record<LabelStatus, ComponentType<LucideProps>> = { positive: Zap, intervened: HandHeart, negative_confirmed: Check, unknown: Dot };

/** How a finished (or started) block went: a logged hard moment counts even before the label is recomputed. */
export const outcomeOf = (b: StripBlock): LabelStatus => (b.episodes > 0 ? 'positive' : b.label ?? 'unknown');

export function DayStrip({ blocks, now }: { blocks: StripBlock[]; now: number }) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const levelColor = useLevelColor();
  const current = blocks.findIndex((b) => now >= b.block.start && now < b.block.end);
  const outcomeColor = (o: LabelStatus) => ({ positive: c.primary, intervened: c.primary, negative_confirmed: c.riskLow, unknown: c.textMuted }[o]);

  const describe = (b: StripBlock) => {
    const past = b.block.end <= now;
    const parts = [blockRange(b.block.index)];
    if (!past && b.level) parts.push(t(`risk.${b.level}`));
    if (past || b.episodes > 0) parts.push(t(`outcome.${outcomeOf(b)}`));
    else parts.push(t('outcome.upcoming'));
    return parts.join(', ');
  };

  const levels = [...new Set(blocks.filter((b) => b.block.end > now && b.level).map((b) => b.level as RiskLevel))];
  const outcomes = [...new Set(blocks.filter((b) => b.block.end <= now || b.episodes > 0).map(outcomeOf))];

  return (
    <View style={{ gap: space.md }}>
      <View style={styles.row}>
        {blocks.map((b, i) => {
          const past = b.block.end <= now;
          const showOutcome = past || b.episodes > 0;
          const o = outcomeOf(b);
          const color = showOutcome ? outcomeColor(o) : b.level ? levelColor(b.level) : c.learning;
          const Icon = showOutcome ? OUTCOME_ICON[o] : LEVEL_ICON[b.level ?? 'learning'];
          const isCurrent = i === current;
          return (
            <Pressable key={b.block.start} testID={`strip-${b.block.index}`} accessibilityRole="button" accessibilityLabel={describe(b)}
              accessibilityHint={t('today.stripTap')} onPress={() => router.push(`/block/${b.block.start}`)} style={styles.segWrap}>
              <View style={[styles.seg, {
                backgroundColor: showOutcome && !isCurrent ? c.surfaceAlt : tint(color, 0.16),
                borderColor: isCurrent ? c.primary : 'transparent',
              }]}>
                <Icon size={18} color={color} fill={o === 'positive' && showOutcome ? color : 'none'} strokeWidth={2.4} />
              </View>
              <T variant="footnote" color={isCurrent ? 'primary' : 'muted'} weight={isCurrent ? '700' : '400'} center numberOfLines={1}>
                {blockRange(b.block.index).split(/[–\s]/)[0]}
              </T>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.legend}>
        {levels.map((l) => {
          const Icon = LEVEL_ICON[l];
          return (
            <View key={l} style={styles.legendItem}>
              <Icon size={14} color={levelColor(l)} strokeWidth={2.4} />
              <T variant="footnote" color="muted">{t(`risk.${l}`)}</T>
            </View>
          );
        })}
        {outcomes.map((o) => {
          const Icon = OUTCOME_ICON[o];
          const label = { positive: t('today.legendEpisode'), intervened: t('today.legendStepped'), negative_confirmed: t('today.legendCalm'), unknown: t('today.legendUnknown') }[o];
          return (
            <View key={o} style={styles.legendItem}>
              <Icon size={14} color={outcomeColor(o)} strokeWidth={2.4} />
              <T variant="footnote" color="muted">{label}</T>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4 },
  segWrap: { flex: 1, gap: 4, minWidth: 0 },
  seg: { height: 44, borderRadius: radius.control - 2, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
