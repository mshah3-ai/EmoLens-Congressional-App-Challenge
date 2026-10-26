/**
 * Block sheet (SPEC 9.2 "Tap a segment -> block detail sheet"; also where a heads-up notification opens):
 *  - now or later: the forecast (chance, 80% range, level, reasons, "expected" inputs) and ideas that have helped;
 *  - earlier: how it went (label), what EmoLens had forecast the evening before, and the answer buttons if a heads-up
 *    for it is still unanswered.
 */
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { blockContaining } from '@emolens/engine';
import type { LabelStatus } from '@emolens/shared';
import { all, one } from '../../src/db/types';
import { iso } from '../../src/db/time';
import { ChanceHeadline, IdeasList, Reasons, pct } from '../../src/features/today/ForecastBits';
import { ideasFrom, loadStrategyView, useSnapshot } from '../../src/forecast/useForecast';
import { blockRange, dayLabel } from '../../src/i18n/format';
import { useDbQuery } from '../../src/lib/useDbQuery';
import { useReady } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { RiskBadge } from '../../src/ui/RiskBadge';
import { Sheet } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { space } from '../../src/ui/theme';

export default function BlockSheet() {
  const { t } = useTranslation();
  const { start } = useLocalSearchParams<{ start: string }>();
  const { repo, profile, settings, tz } = useReady();
  const { snap } = useSnapshot();
  const startMs = Number(start);
  const block = Number.isFinite(startMs) ? blockContaining(startMs, profile) : undefined;
  const now = Date.now();
  const f = snap?.forecasts.find((x) => x.start === startMs) ?? null;
  const { data } = useDbQuery(async () => {
    const [label, pred, alert, view, episodes] = await Promise.all([
      one<{ label_status: LabelStatus }>(repo.db, 'SELECT label_status FROM blocks WHERE child_id = ? AND block_start = ?', [profile.id, iso(startMs)]),
      one<{ p: number; kind: string }>(repo.db, "SELECT p, kind FROM predictions WHERE child_id = ? AND block_start = ? ORDER BY CASE kind WHEN 'day_ahead' THEN 0 ELSE 1 END LIMIT 1", [profile.id, iso(startMs)]),
      one<{ id: string }>(repo.db, `SELECT a.id FROM alerts a WHERE a.child_id = ? AND a.block_start = ? AND a.status IN ('scheduled','delivered') AND a.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM alert_responses r WHERE r.alert_id = a.id AND r.deleted_at IS NULL)`, [profile.id, iso(startMs)]),
      loadStrategyView(repo.db, profile.id),
      all<{ id: string }>(repo.db, 'SELECT id FROM episodes WHERE child_id = ? AND deleted_at IS NULL AND started_at >= ? AND started_at < ?',
        [profile.id, iso(startMs), iso(block?.end ?? startMs)]),
    ]);
    return { label: label?.label_status ?? null, pred, alert, view, episodes: episodes.length };
  }, [start], null);

  if (!block) return <Sheet title={t('block.noForecast')}><T variant="body">{t('block.noForecast')}</T></Sheet>;
  const past = block.end <= now;
  const outcome: LabelStatus = data?.episodes ? 'positive' : data?.label ?? 'unknown';
  const ideas = data ? ideasFrom(data.view, settings.strategy_discovery, now) : [];

  return (
    <Sheet title={t('block.title', { range: blockRange(block.index), day: dayLabel(block.localDate, tz) })}>
      {f ? (
        <Card style={{ gap: space.lg }}>
          <RiskBadge level={f.level} />
          <ChanceHeadline f={f} name={profile.nickname} />
          {snap?.learning ? <T variant="callout" color="muted">{t('forecast.learningNote', { name: profile.nickname })}</T> : null}
          <Reasons f={f} />
          {f.estimated.length ? <T variant="footnote" color="muted">{t('forecast.estimatedNote')}</T> : null}
        </Card>
      ) : null}
      {past || (block.start <= now && data?.episodes) ? (
        <Card style={{ gap: space.sm }}>
          <T variant="headline">{t('block.past')}</T>
          <T variant="body">{t(`outcome.${outcome}`)}</T>
          {data?.pred ? <T variant="callout" color="muted">{data.pred.kind === 'day_ahead' ? t('forecast.said', { pct: pct(data.pred.p) }) : t('forecast.saidNow', { pct: pct(data.pred.p) })}</T> : null}
          {data?.alert && past ? <Button small label={t('block.answer')} onPress={() => router.push(`/confirm/${data.alert?.id}`)} /> : null}
        </Card>
      ) : null}
      {!f && !past ? <T variant="body" color="muted">{t('block.noForecast')}</T> : null}
      {!past && ideas.length ? <Card><IdeasList ideas={ideas} alertId={data?.alert?.id ?? null} /></Card> : null}
      <View style={{ height: space.lg }} />
    </Sheet>
  );
}
