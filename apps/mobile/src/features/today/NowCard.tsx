/**
 * The "Now" card (SPEC 9.2): the current block's chance, its 80% range, the level badge, how it compares with this
 * child's usual for the time, the top reasons, and "Ideas that have helped". Outside awake hours it shows the next
 * block. While EmoLens is still learning it says so plainly: the number is mostly a starting estimate.
 */
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { SnapForecast } from '../../forecast/snapshot';
import type { Idea } from '../../forecast/useForecast';
import { blockRange } from '../../i18n/format';
import { useReady } from '../../store/session';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { RiskBadge } from '../../ui/RiskBadge';
import { T } from '../../ui/Text';
import { space } from '../../ui/theme';
import { ChanceHeadline, IdeasList, Reasons } from './ForecastBits';

export function NowCard({ f, isNow, learning, ideas, unavailable }: { f: SnapForecast | null; isNow: boolean; learning: boolean; ideas: Idea[]; unavailable: boolean }) {
  const { t } = useTranslation();
  const { profile } = useReady();
  return (
    <Card testID="now-card" style={{ gap: space.lg }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        <T variant="headline" accessibilityRole="header">
          {f ? t(isNow ? 'today.nowBlock' : 'forecast.nextBlock', { range: blockRange(f.index) }) : t('today.nowOutside')}
        </T>
        {f ? <RiskBadge level={f.level} /> : null}
      </View>
      {f ? (
        <>
          <ChanceHeadline f={f} name={profile.nickname} />
          {learning ? <T variant="callout" color="muted">{t('forecast.learningNote', { name: profile.nickname })}</T> : null}
          <Reasons f={f} />
        </>
      ) : (
        <T variant="body" color="muted">{t('forecast.none')}</T>
      )}
      {unavailable ? <T variant="footnote" color="danger">{t('forecast.unavailable')}</T> : null}
      {ideas.length ? <IdeasList ideas={ideas} /> : (
        <Button small variant="ghost" label={t('today.pickIdeas')} onPress={() => router.push('/log/strategy')} />
      )}
    </Card>
  );
}
