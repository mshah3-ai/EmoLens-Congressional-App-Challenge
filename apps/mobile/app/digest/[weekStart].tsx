/**
 * One weekly digest (SPEC 21): the summary in words on top (with AI features on, a summary written by AI from the
 * week's numbers, asked for the first time the digest is opened; otherwise the template sentences), then hard moments per day and per part of the day, pattern changes, new "worth watching" items, what helped,
 * the end-of-day check, heads-ups, medications and sleep (each shown only when there is something), and "Share as PDF".
 * Everything comes from the digest's saved numbers, so an old digest looks the same later.
 */
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Share2 } from 'lucide-react-native';
import { TOD_GROUPS } from '@emolens/engine';
import { restoreText } from '@emolens/shared';
import { aiGate } from '../../src/ai/gate';
import { writeAiNarrative } from '../../src/digest/aiNarrative';
import { recordError } from '../../src/db/repo/errors';
import { failureToastKey } from '../../src/lib/steps';
import { getDigest } from '../../src/digest/generate';
import { templateNarrative } from '../../src/digest/narrative';
import { useDbQuery } from '../../src/lib/useDbQuery';
import { shareDigestPdf, tFor } from '../../src/reports/actions';
import { dateYearIn, num1, weekdayShortIn } from '@emolens/reports';
import { digestLines } from '../../src/reports/templates/digest';
import { useReady, useSession } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { RateColumns } from '../../src/ui/charts';
import { EmptyState } from '../../src/ui/bits';
import { Screen } from '../../src/ui/layout';
import { RichText } from '../../src/ui/RichText';
import { T } from '../../src/ui/Text';
import { toast } from '../../src/ui/Toast';
import { space } from '../../src/ui/theme';

function Block({ title, lines, testID }: { title: string; lines: string[]; testID?: string }) {
  if (!lines.length) return null;
  return (
    <Card testID={testID} style={{ gap: space.xs }}>
      <T variant="headline" accessibilityRole="header">{title}</T>
      {lines.map((l) => <T key={l} variant="callout">• {l}</T>)}
    </Card>
  );
}

export default function DigestScreen() {
  const { t } = useTranslation();
  const { weekStart } = useLocalSearchParams<{ weekStart: string }>();
  const { repo, profile } = useReady();
  const lang = useSession((s) => s.settings.language);
  const settings = useSession((s) => s.settings);
  const [sharing, setSharing] = useState(false);
  const [writing, setWriting] = useState(false);
  const [aiFailed, setAiFailed] = useState(false);
  const asked = useRef(false);
  const { data: d, loading } = useDbQuery(() => getDigest(repo.db, profile.id, weekStart), [weekStart, profile.id], null);

  // SPEC 21: with AI features on, ask once per visit for the AI summary of this week. If it can't be written, the
  // template stays and a gentle note says so (BUGS #27); opening the week again tries again.
  useEffect(() => {
    if (!d || d.narrative || !settings.cloud_ai_enabled || asked.current) return;
    asked.current = true;
    setWriting(true);
    void aiGate(settings).then((gate) => writeAiNarrative(repo, profile, weekStart, lang, gate))
      .then((r) => { if (r.ok) useSession.getState().bump(); else setAiFailed(true); })
      .catch(() => setAiFailed(true))
      .finally(() => setWriting(false));
  }, [d, settings, repo, profile, weekStart, lang]);

  if (!d) {
    return (
      <Screen back title={t('digest.title')}>
        {loading ? null : <EmptyState icon={Share2} title={t('digest.missing')} />}
      </Screen>
    );
  }
  const s = d.stats;
  const ft = tFor(lang);
  const lines = digestLines(s, ft, lang);
  const narrative = d.narrative ? [restoreText(d.narrative, profile.nickname)] : templateNarrative(s, ft, profile.nickname, lang);
  const count = (v: number) => String(Math.round(v));
  const share = async () => {
    setSharing(true);
    try { await shareDigestPdf(profile, lang, d); } catch (e) {
      await recordError(repo.db, 'digest.pdf', e);
      toast(t(failureToastKey(e)));
    } finally { setSharing(false); }
  };

  return (
    <Screen back title={t('digest.title')} subtitle={`${dateYearIn(lang, s.weekStart)} – ${dateYearIn(lang, s.weekEnd)}`} testID="digest-screen">
      <Card testID="digest-narrative" style={{ gap: space.sm }}>
        {d.narrative ? <RichText text={narrative[0]} /> : narrative.map((x) => <T key={x} variant="body">{x}</T>)}
        {d.narrative ? <T variant="footnote" color="muted">{t('digest.aiLabel')} · {t('ai.disclaimer')}</T> : null}
        {writing ? <T variant="footnote" color="muted" accessibilityLiveRegion="polite">{t('digest.aiWriting')}</T> : null}
        {aiFailed && !d.narrative ? <T testID="digest-ai-failed" variant="footnote" color="muted" accessibilityLiveRegion="polite">{t('digest.aiFailed')}</T> : null}
        {s.avg4Weeks != null ? <T variant="footnote" color="muted">{t('digest.vsAvg', { avg: num1(lang, s.avg4Weeks) })}</T> : null}
      </Card>

      <Card style={{ gap: space.md }}>
        <T variant="headline" accessibilityRole="header">{t('digest.daily')}</T>
        <RateColumns format={count} height={140}
          summary={t('digest.dailySummary', { list: s.episodes.perDay.map((x) => `${weekdayShortIn(lang, x.date)} ${x.count}`).join(', ') })}
          bars={s.episodes.perDay.map((x) => ({ key: x.date, label: weekdayShortIn(lang, x.date), rate: x.count, lo: x.count, hi: x.count }))} />
      </Card>

      {s.episodes.total > 0 ? (
        <Card style={{ gap: space.md }}>
          <T variant="headline" accessibilityRole="header">{t('digest.todTitle')}</T>
          <RateColumns format={count} height={120}
            summary={TOD_GROUPS.map((g) => `${t(`digest.todShort.${g}`)} ${s.episodes.byTod[g]}`).join(', ')}
            bars={TOD_GROUPS.map((g) => ({ key: g, label: t(`digest.todShort.${g}`), rate: s.episodes.byTod[g], lo: s.episodes.byTod[g], hi: s.episodes.byTod[g] }))} />
        </Card>
      ) : null}

      <Block testID="digest-patterns" title={t('digest.patterns')} lines={lines.patterns.length ? lines.patterns : [t('digest.patternsNone')]} />
      <Block title={t('digest.newWatch')} lines={lines.watch} />
      <Block title={t('digest.strategies')} lines={lines.strategies} />
      <Block title={t('digest.logging')} lines={[`${t('digest.loggingDays', { count: s.logging.daysClosed })} · ${t('digest.streak', { count: s.logging.streak })}`]} />
      <Block title={t('digest.forecasts')} lines={lines.forecasts} />
      <Block title={t('digest.meds')} lines={lines.meds} />
      <Block title={t('digest.sleep')} lines={lines.sleep} />

      <View style={{ gap: space.xs }}>
        <Button testID="digest-share" icon={Share2} variant="secondary" label={t('digest.share')} loading={sharing} onPress={() => void share()} />
        <T variant="footnote" color="muted" center>{t('report.disclaimer')}</T>
      </View>
    </Screen>
  );
}
