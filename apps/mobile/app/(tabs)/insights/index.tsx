/**
 * Insights hub (SPEC 9.4), all from the last engine run:
 *  1. Ask EmoLens (opens the chat; with AI features off it explains how to turn them on);
 *  2. Patterns: every tracked factor, strongest claim first (Strong -> Likely -> Possible -> Calmer -> No clear link ->
 *     Still checking -> Not enough data), each with its status, precision meter and effect sentence;
 *     factors whose data source isn't in use are listed as "Not tracked yet";
 *  3. Worth watching (specific foods, medicines, places, calendar events);
 *  4. Time of day (observed rate per 2-hour block with 80% whiskers);
 *  5. What helps -> Strategies; 6. Forecast accuracy -> Model Health.
 * The parent's own suspicions are shown with the status the data gives them (never as findings by themselves).
 */
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Gauge, HandHeart, MessageCircle, Sparkles } from 'lucide-react-native';
import { FEATURE_COPY, LEARNING_PERIOD_DAYS, SUSPECTED_TRIGGERS } from '@emolens/shared';
import { STATUS_SORT } from '@emolens/engine';
import { StatusBadge } from '../../../src/features/insights/StatusBadge';
import { loadHealth } from '../../../src/forecast/health';
import { useSnapshot, useStrategyView } from '../../../src/forecast/useForecast';
import { currentLang } from '../../../src/i18n';
import { blockRange } from '../../../src/i18n/format';
import { useDbQuery } from '../../../src/lib/useDbQuery';
import { useReady } from '../../../src/store/session';
import { Card } from '../../../src/ui/Card';
import { ConfidenceMeter, RateColumns } from '../../../src/ui/charts';
import { Chip, ChipGroup } from '../../../src/ui/Chip';
import { EmptyState, IconCircle, ProgressBar, Section } from '../../../src/ui/bits';
import { precisionPct, watchItemName } from '@emolens/reports';
import { Screen } from '../../../src/ui/layout';
import { T } from '../../../src/ui/Text';
import { space, useTheme } from '../../../src/ui/theme';

const shortRange = (k: number) => blockRange(k).split(/[–\s]/)[0];
const pctText = (v: number) => `${Math.round(v * 100)}%`;

export default function Insights() {
  const { t } = useTranslation();
  const { c, accent } = useTheme();
  const { repo, settings, profile } = useReady();
  const lang = currentLang();
  const { snap } = useSnapshot();
  const view = useStrategyView();
  const { data: health } = useDbQuery(() => loadHealth(repo.db, profile.id, Date.now()), [profile.id], null);

  const insights = snap?.insights ?? [];
  const shown = insights.filter((i) => i.status !== 'hidden').sort((a, b) => STATUS_SORT.indexOf(a.status) - STATUS_SORT.indexOf(b.status) || b.confidence - a.confidence);
  const hidden = insights.filter((i) => i.status === 'hidden');
  const suspected = SUSPECTED_TRIGGERS.filter((o) => settings.suspected_triggers.includes(o.id));
  const watch = (snap?.worthWatching ?? []).filter((w) => w.shown);
  const tod = snap?.timeOfDay ?? [];
  const todHas = tod.some((r) => r.n > 0);
  const peak = todHas ? [...tod].sort((a, b) => b.rate - a.rate)[0] : null;
  const best = view?.stats.filter((s) => s.context === 'during' && s.uses >= 3).sort((a, b) => b.mean - a.mean)[0];
  const bestRow = best ? view?.rows.find((r) => r.id === best.strategyId) : null;
  const h = health?.health.last28.enough ? health.health.last28 : health?.health.allTime;
  const label = (key: string) => FEATURE_COPY[key]?.label[lang] ?? key;

  return (
    <Screen title={t('insights.title')} subtitle={t('insights.subtitle', { name: profile.nickname })}>
      <Card testID="insights-ask" onPress={() => router.push('/ask' as never)} accessibilityLabel={t('insights.ask')}
        style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
        <IconCircle icon={MessageCircle} color={settings.cloud_ai_enabled ? accent.strategy : c.textMuted} size={36} />
        <View style={{ flex: 1 }}>
          <T variant="headline">{t('insights.ask')}</T>
          <T variant="footnote" color="muted">{t(settings.cloud_ai_enabled ? 'insights.askBody' : 'insights.askOff', { name: profile.nickname })}</T>
        </View>
        <ChevronRight size={20} color={c.textMuted} />
      </Card>

      {snap?.learning !== false ? (
        <Card style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
            <IconCircle icon={Sparkles} color={accent.episode} />
            <T variant="callout" style={{ flex: 1 }}>{t('insights.learning', { name: profile.nickname })}</T>
          </View>
          <ProgressBar value={Math.min(snap?.labeledDays ?? 0, LEARNING_PERIOD_DAYS) / LEARNING_PERIOD_DAYS} label={t('today.learningProgress')} />
          <T variant="footnote" color="muted">{t('insights.learningProgress', { days: Math.min(snap?.labeledDays ?? 0, LEARNING_PERIOD_DAYS), total: LEARNING_PERIOD_DAYS, pos: Math.min(snap?.positives ?? 0, 3) })}</T>
        </Card>
      ) : null}

      <Section title={t('insights.patterns')}>
        {shown.length ? (
          <View style={{ gap: space.sm }}>
            <T variant="footnote" color="muted">{t('insights.patternsSub')}</T>
            {shown.map((i) => (
              <Card key={i.key} testID={`pattern-${i.key}`} onPress={() => router.push(`/insights/trigger/${i.key}`)} accessibilityLabel={`${label(i.key)}, ${t(`status.${i.status}`)}`}
                style={{ gap: space.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <T variant="headline" style={{ flex: 1 }}>{label(i.key)}</T>
                  <ChevronRight size={18} color={c.textMuted} />
                </View>
                <StatusBadge status={i.status} />
                {i.status === 'not_enough_data' ? (
                  <T variant="footnote" color="muted">{t('insights.seenIn', { count: i.exposed })}</T>
                ) : (
                  <>
                    <T variant="callout">{i.sentence}</T>
                    <T variant="footnote" color="muted">{t('insights.meterCaption')}</T>
                    <ConfidenceMeter compact value={i.confidence} label={t('insights.howSure', { pct: precisionPct(i.confidence) })} />
                  </>
                )}
              </Card>
            ))}
          </View>
        ) : (
          <Card><EmptyState icon={Sparkles} title={t('insights.patternsEmpty')} body={t('insights.patternsEmptyBody')} /></Card>
        )}
      </Section>

      {suspected.length ? (
        <Section title={t('insights.yourIdeas')}>
          <Card style={{ gap: space.sm }}>
            {suspected.map((s) => {
              const rows = insights.filter((i) => s.keys.includes(i.key));
              const top = [...rows].sort((a, b) => STATUS_SORT.indexOf(a.status) - STATUS_SORT.indexOf(b.status))[0];
              return (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                  <T variant="body" style={{ flex: 1, minWidth: 140 }}>{s.label[lang]}</T>
                  {top ? <StatusBadge status={top.status} /> : null}
                </View>
              );
            })}
          </Card>
        </Section>
      ) : null}

      {hidden.length ? (
        <Section title={t('insights.notTracked')}>
          <Card style={{ gap: space.md }}>
            <T variant="callout" color="muted">{t('insights.notTrackedBody')}</T>
            <ChipGroup>{hidden.map((i) => <Chip key={i.key} label={label(i.key)} selected={false} onPress={() => router.push(`/insights/trigger/${i.key}`)} />)}</ChipGroup>
            <Chip label={t('insights.turnOn')} selected={false} onPress={() => router.push('/settings/data-sources')} />
          </Card>
        </Section>
      ) : null}

      <Section title={t('insights.worth')}>
        <Card style={{ gap: space.sm }}>
          <T variant="footnote" color="muted">{t('insights.worthSub')}</T>
          {watch.length ? watch.map((w) => (
            <Card key={w.id} tone="soft" onPress={() => router.push(`/insights/watch/${encodeURIComponent(w.id)}`)} accessibilityLabel={w.label}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <T variant="headline">{watchItemName(w, t)}</T>
                <T variant="footnote" color="muted">{t(`watch.kind.${w.kind}`)} · ~{w.median.toFixed(1)}×</T>
              </View>
              <ChevronRight size={18} color={c.textMuted} />
            </Card>
          )) : <T variant="callout" color="muted">{t('insights.worthEmpty')}</T>}
          {snap?.worthWatchingTested ? <T variant="footnote" color="muted">{t('insights.worthTested', { count: snap.worthWatchingTested })}</T> : null}
        </Card>
      </Section>

      <Section title={t('insights.todTitle')}>
        <Card style={{ gap: space.md }}>
          <T variant="footnote" color="muted">{t('insights.todSub')}</T>
          {todHas ? (
            <RateColumns format={pctText} highlight={peak ? String(peak.index) : null}
              summary={t('insights.todSummary', { range: peak ? blockRange(peak.index) : '' })}
              bars={tod.map((r) => ({ key: String(r.index), label: shortRange(r.index), rate: r.rate, lo: r.lo80, hi: r.hi80, sub: `${r.k}/${r.n}` }))} />
          ) : <T variant="callout" color="muted">{t('insights.todEmpty')}</T>}
        </Card>
      </Section>

      <Card testID="insights-strategies" onPress={() => router.push('/insights/strategies')} accessibilityLabel={t('insights.helpsTitle')} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <IconCircle icon={HandHeart} color={accent.strategy} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headline">{t('insights.helpsTitle')}</T>
          <T variant="footnote" color="muted">{best && bestRow ? t('insights.helpsTop', { name: bestRow.name, s: best.successes, t: best.uses }) : t('insights.whatHelpsBody')}</T>
        </View>
        <ChevronRight size={18} color={c.textMuted} />
      </Card>
      <Card testID="insights-health" onPress={() => router.push('/insights/model-health')} accessibilityLabel={t('insights.healthTitle')} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <IconCircle icon={Gauge} color={accent.episode} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headline">{t('insights.healthTitle')}</T>
          <T variant="footnote" color="muted">
            {!h?.enough ? t('insights.healthWaiting') : h.skill > 0 ? t('insights.healthBetter', { pct: pctText(h.skill) }) : t('insights.healthNotYet')}
          </T>
        </View>
        <ChevronRight size={18} color={c.textMuted} />
      </Card>
    </Screen>
  );
}
