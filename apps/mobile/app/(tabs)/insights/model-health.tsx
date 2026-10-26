/**
 * Model Health (SPEC 18): how the stored evening-before ("day-ahead") forecasts compared with what happened, for the last
 * 28 days or all time. Only blocks answered as a hard moment or calm count (stepped-in and unknown blocks are left out).
 *  - Skill: "EmoLens forecasts are 23% better than a simple time-of-day guess" (1 - Brier / baseline Brier);
 *  - Brier scores, the reliability diagram ("When EmoLens said about 15%, hard moments happened 13% of the time"),
 *    AUROC ("how well it ranks risky vs calm times"), heads-up outcomes and hit rate, log loss, and the data behind it;
 *  - "Refit now". Metrics appear after 20 checkable forecasts.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { HandHeart, RefreshCw, Sun, Zap } from 'lucide-react-native';
import { MODEL_HEALTH_MIN_PREDICTIONS } from '@emolens/shared';
import { reliabilityHeadline } from '@emolens/engine';
import { forecastNow } from '../../../src/forecast';
import { loadHealth } from '../../../src/forecast/health';
import { useSnapshot } from '../../../src/forecast/useForecast';
import { fmtAgo } from '../../../src/i18n/format';
import { useDbQuery } from '../../../src/lib/useDbQuery';
import { useReady } from '../../../src/store/session';
import { toast } from '../../../src/ui/Toast';
import { Button } from '../../../src/ui/Button';
import { Card } from '../../../src/ui/Card';
import { ReliabilityDiagram, SegmentBar } from '../../../src/ui/charts';
import { ProgressBar } from '../../../src/ui/bits';
import { Screen } from '../../../src/ui/layout';
import { Segmented } from '../../../src/ui/Segmented';
import { T } from '../../../src/ui/Text';
import { space, useTheme } from '../../../src/ui/theme';

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function ModelHealth() {
  const { t } = useTranslation();
  const { c, accent } = useTheme();
  const { repo, profile } = useReady();
  const { snap } = useSnapshot();
  const [range, setRange] = useState<'last28' | 'allTime'>('last28');
  const [busy, setBusy] = useState(false);
  const { data } = useDbQuery(() => loadHealth(repo.db, profile.id, Date.now()), [profile.id], null);
  const h = data?.health[range];
  const a = data?.alerts[range];
  const head = h ? reliabilityHeadline(h.reliability) : null;
  const sentence = head ? t('health.reliabilitySentence', { said: pct(head.meanP), happened: pct(head.rate) }) : '';

  const refit = async () => {
    setBusy(true);
    try { await forecastNow({ forceWorthWatching: true }); toast(t('health.refitted')); } finally { setBusy(false); }
  };

  return (
    <Screen back title={t('health.title')} subtitle={t('health.subtitle')}>
      <Segmented testIDPrefix="health-range" value={range} onChange={setRange}
        options={[{ value: 'last28', label: t('health.last28') }, { value: 'allTime', label: t('health.allTime') }]} />

      {!h?.enough ? (
        <Card style={{ gap: space.sm }}>
          <T variant="headline">{t('health.waiting')}</T>
          <ProgressBar value={(h?.n ?? 0) / MODEL_HEALTH_MIN_PREDICTIONS} label={t('health.waitingProgress', { n: h?.n ?? 0, min: MODEL_HEALTH_MIN_PREDICTIONS })} />
          <T variant="footnote" color="muted">{t('health.waitingProgress', { n: h?.n ?? 0, min: MODEL_HEALTH_MIN_PREDICTIONS })}</T>
        </Card>
      ) : (
        <>
          <Card testID="health-skill" style={{ gap: space.xs }}>
            {h.skill > 0 ? (
              <>
                <T variant="display" style={{ fontSize: 48, lineHeight: 54 }}>{pct(h.skill)}</T>
                <T variant="headline">{t('health.better', { pct: pct(h.skill) })}</T>
              </>
            ) : <T variant="headline">{t('health.notYet')}</T>}
          </Card>

          <Card style={{ gap: space.sm }}>
            <T variant="headline">{t('health.brierTitle')}</T>
            <T variant="body">{t('health.brierBody', { model: h.brier.toFixed(3), base: h.brierBaseline.toFixed(3) })}</T>
          </Card>

          <Card style={{ gap: space.md }}>
            <T variant="headline">{t('health.reliabilityTitle')}</T>
            {sentence ? <T variant="body">{sentence}</T> : null}
            <ReliabilityDiagram bins={h.reliability} summary={t('health.reliabilitySummary', { sentence })} axisSaid={t('health.axisSaid')} axisHappened={t('health.axisHappened')} />
          </Card>

          <Card style={{ gap: space.sm }}>
            <T variant="headline">{t('health.aurocTitle')}</T>
            <T variant="body">{h.auroc != null ? t('health.aurocBody', { v: h.auroc.toFixed(2) }) : t('health.aurocWaiting')}</T>
          </Card>
        </>
      )}

      <Card style={{ gap: space.md }}>
        <T variant="headline">{t('health.alertsTitle')}</T>
        {a && a.delivered > 0 ? (
          <>
            <SegmentBar summary={t('health.alertsSummary', { delivered: a.delivered, happened: a.happened, stepped: a.steppedIn, calm: a.calm, none: a.noAnswer })}
              segments={[
                { key: 'happened', label: t('confirm.happened'), count: a.happened, color: accent.episode, icon: <Zap size={14} color={accent.episode} /> },
                { key: 'stepped', label: t('confirm.steppedIn'), count: a.steppedIn, color: accent.strategy, icon: <HandHeart size={14} color={accent.strategy} /> },
                { key: 'calm', label: t('confirm.calm'), count: a.calm, color: c.riskLow, icon: <Sun size={14} color={c.riskLow} /> },
                { key: 'none', label: t('health.noAnswer'), count: a.noAnswer, color: c.learning },
              ]} />
            {a.hitRate != null ? <T variant="callout">{t('health.alertsHit', { pct: pct(a.hitRate) })}</T> : null}
          </>
        ) : <T variant="callout" color="muted">{t('health.alertsNone')}</T>}
      </Card>

      <Card style={{ gap: space.xs }}>
        <T variant="headline">{t('health.dataTitle')}</T>
        {snap ? (
          <>
            <T variant="callout">{[t('health.dataDays', { count: snap.labeledDays }), t('health.dataBlocks', { count: snap.labeledBlocks }), t('health.dataPos', { count: snap.positives })].join(' · ')}</T>
            <T variant="footnote" color="muted">{t('health.lastFit', { when: fmtAgo(new Date(snap.computedAt).toISOString()) })}</T>
          </>
        ) : null}
        {h?.enough ? (
          <View style={{ gap: 2, marginTop: space.xs }}>
            <T variant="footnote" color="muted">{t('health.advanced')}: {t('health.logLoss', { v: h.logLoss.toFixed(3) })}</T>
            <T variant="footnote" color="muted">{t('health.evaluated', { n: h.n, pos: h.positives })}</T>
          </View>
        ) : null}
      </Card>

      <Button testID="refit-now" icon={RefreshCw} variant="secondary" label={t('health.refit')} loading={busy} onPress={() => void refit()} />
    </Screen>
  );
}
