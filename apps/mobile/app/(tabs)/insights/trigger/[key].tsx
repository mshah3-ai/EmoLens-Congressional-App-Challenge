/**
 * Trigger detail (SPEC 9.5): status (with what it means) and the precision meter ("how precisely EmoLens knows the size"), the effect with its 80% range, chart 1 (hard
 * moments in blocks with vs without the factor, Beta-posterior whiskers), chart 2 (how the estimate changed per weekly
 * fit), the evidence counts, "How we know this", and the prescriber note for medication factors.
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Info } from 'lucide-react-native';
import { FEATURE_BY_KEY, FEATURE_COPY, HOW_WE_KNOW, SUSPECTED_TRIGGERS, fmt } from '@emolens/shared';
import { betaPosterior, hash32 } from '@emolens/engine';
import { StatusBadge } from '../../../../src/features/insights/StatusBadge';
import { loadEffectHistory } from '../../../../src/forecast/health';
import { useSnapshot } from '../../../../src/forecast/useForecast';
import { currentLang } from '../../../../src/i18n';
import { fmtShortDate, todayIn } from '../../../../src/i18n/format';
import { useDbQuery } from '../../../../src/lib/useDbQuery';
import { useReady } from '../../../../src/store/session';
import { Button } from '../../../../src/ui/Button';
import { Card } from '../../../../src/ui/Card';
import { ConfidenceMeter, EffectHistoryChart, RateColumns } from '../../../../src/ui/charts';
import { precisionPct } from '@emolens/reports';
import { Screen } from '../../../../src/ui/layout';
import { T } from '../../../../src/ui/Text';
import { space, useTheme } from '../../../../src/ui/theme';

const pctText = (v: number) => `${Math.round(v * 100)}%`;
const times = (v: number) => `${v.toFixed(1)}×`;

export default function TriggerDetail() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const { key } = useLocalSearchParams<{ key: string }>();
  const { repo, profile, settings, tz } = useReady();
  const lang = currentLang();
  const { snap } = useSnapshot();
  const [open, setOpen] = useState(false);
  const { data: history } = useDbQuery(() => loadEffectHistory(repo.db, profile.id, key), [key], []);
  const row = snap?.insights.find((i) => i.key === key);
  const def = FEATURE_BY_KEY[key];
  const title = FEATURE_COPY[key]?.label[lang] ?? key;
  const suspected = SUSPECTED_TRIGGERS.some((s) => settings.suspected_triggers.includes(s.id) && s.keys.includes(key));
  const withIt = row ? betaPosterior(row.exposedPos, row.exposed - row.exposedPos, hash32(`${key}|with`), 2000) : null;
  const without = row ? betaPosterior(row.unexposedPos, row.unexposed - row.unexposedPos, hash32(`${key}|without`), 2000) : null;
  const rate = (k: number, n: number) => (n ? k / n : 0);

  return (
    <Screen back title={title}>
      {!row || row.status === 'hidden' ? (
        <Card style={{ gap: space.md }}>
          <StatusBadge status="hidden" />
          <T variant="body">{t('trigger.hidden')}</T>
          <Button small variant="secondary" label={t('insights.turnOn')} onPress={() => router.push('/settings/data-sources')} />
        </Card>
      ) : (
        <>
          <Card style={{ gap: space.md }}>
            <StatusBadge status={row.status} />
            {suspected ? <T variant="footnote" color="muted">{t('trigger.suspected')}</T> : null}
            {/* The status and the meter answer different questions; say both plainly so "Strong link" next to 39% makes sense. */}
            <T variant="callout" testID="status-meaning">{t(`trigger.statusMeaning.${row.status}`, { status: t(`status.${row.status}`) })}</T>
            <T variant="headline">{t('trigger.howSureTitle')}</T>
            <T variant="callout" color="muted">{t('trigger.meterMeaning')}</T>
            <ConfidenceMeter value={row.confidence} label={t('insights.howSure', { pct: precisionPct(row.confidence) })} />
            <T variant="callout" color="muted">{t('trigger.howSureBody', { pct: precisionPct(row.confidence), name: profile.nickname })}</T>
          </Card>

          <Card style={{ gap: space.sm }}>
            <T variant="headline">{t('trigger.effectTitle')}</T>
            {row.status === 'not_enough_data' ? <T variant="body">{t('trigger.notEnough')}</T> : (
              <>
                <T variant="body" weight="600">{row.sentence}</T>
                <T variant="callout" color="muted">{row.range}</T>
              </>
            )}
            {def?.group === 'medication' ? (
              <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', marginTop: space.xs }}>
                <Info size={16} color={c.primary} />
                <T variant="callout" style={{ flex: 1 }}>{t('trigger.prescriber')}</T>
              </View>
            ) : null}
          </Card>

          {withIt && without && row.exposed + row.unexposed > 0 ? (
            <Card style={{ gap: space.md }}>
              <T variant="headline">{t('trigger.chart1')}</T>
              <T variant="footnote" color="muted">{t('trigger.chart1Sub')}</T>
              <RateColumns format={pctText} height={150}
                summary={t('trigger.chart1Summary', { a: pctText(rate(row.exposedPos, row.exposed)), b: pctText(rate(row.unexposedPos, row.unexposed)) })}
                bars={[
                  { key: 'with', label: t('trigger.with'), sub: t('trigger.blocksN', { k: row.exposedPos, n: row.exposed }), rate: rate(row.exposedPos, row.exposed), lo: withIt.lo80, hi: withIt.hi80 },
                  { key: 'without', label: t('trigger.without'), sub: t('trigger.blocksN', { k: row.unexposedPos, n: row.unexposed }), rate: rate(row.unexposedPos, row.unexposed), lo: without.lo80, hi: without.hi80, muted: true },
                ]} />
            </Card>
          ) : null}

          <Card style={{ gap: space.md }}>
            <T variant="headline">{t('trigger.chart2')}</T>
            <T variant="footnote" color="muted">{t('trigger.chart2Sub')}</T>
            {history.length ? (
              <EffectHistoryChart points={history} format={times} xLabel={(at) => fmtShortDate(todayIn(tz, at))}
                summary={t('trigger.chart2Summary', { first: times(history[0].or), last: times(history[history.length - 1].or) })} />
            ) : <T variant="callout" color="muted">{t('trigger.chart2Empty')}</T>}
          </Card>

          <Card style={{ gap: space.sm }}>
            <T variant="headline">{t('trigger.evidenceTitle')}</T>
            <T variant="body">{t('trigger.evidenceWith', { k: row.exposedPos, count: row.exposed })} {t('trigger.evidenceWithout', { k: row.unexposedPos, count: row.unexposed })}</T>
            <T variant="footnote" color="muted">{t('trigger.oddsNote')}</T>
          </Card>
        </>
      )}

      <Card style={{ gap: space.sm }}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}
          style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: space.sm }}>
          <T variant="headline" style={{ flex: 1 }}>{t('trigger.howWeKnow')}</T>
          {open ? <ChevronUp size={20} color={c.textMuted} /> : <ChevronDown size={20} color={c.textMuted} />}
        </Pressable>
        {open ? <T variant="body">{fmt(HOW_WE_KNOW[lang], { Nickname: profile.nickname })}</T> : null}
      </Card>
    </Screen>
  );
}
