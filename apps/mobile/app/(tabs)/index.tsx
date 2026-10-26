/**
 * Today (SPEC 9.2): header with the learning banner (days with answers, SPEC 13.9) or today's outlook, the day risk
 * strip, the Now card, "How did 2-4 pm go?" cards, the end-of-day cards, reminders, quick add, data-source chips and
 * the "Log hard moment" button. Everything forecast-related comes from the last engine run (engine_snapshots);
 * the screen itself never runs the engine.
 */
import { ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Lock, MapPin } from 'lucide-react-native';
import { addDays, awakeBlocksForDate, blockContaining, dayOutlook, formatHHMM, localMinuteOf, parseHHMM } from '@emolens/engine';
import { LEARNING_PERIOD_DAYS, type LabelStatus } from '@emolens/shared';
import { openFollowups, pendingConfirmations } from '../../src/db/repo/alerts';
import { closedAtOf, closureFor } from '../../src/db/repo/closures';
import { episodesNeedingDetails } from '../../src/db/repo/episodes';
import { currentVisit, ongoingIllnesses, sleepEndingBetween } from '../../src/db/repo/logs';
import { dueDoses } from '../../src/db/repo/meds';
import { listStrategies } from '../../src/db/repo/strategies';
import { all } from '../../src/db/types';
import { iso, ms } from '../../src/db/time';
import { forecastAt } from '../../src/forecast/snapshot';
import { ideasFrom, loadStrategyView, useSnapshot } from '../../src/forecast/useForecast';
import { DayStrip, type StripBlock } from '../../src/features/today/DayStrip';
import { DemoTools } from '../../src/features/today/DemoTools';
import { ConfirmCard, DayCheckCards, FollowupCard, type DayCheckState } from '../../src/features/today/LoopCards';
import { NowCard } from '../../src/features/today/NowCard';
import { SchoolCard } from '../../src/features/today/SchoolCard';
import { QuickAdd } from '../../src/features/today/QuickAdd';
import { AskBar } from '../../src/features/today/AskBar';
import { Reminders } from '../../src/features/today/Reminders';
import { SourceChips } from '../../src/features/today/SourceChips';
import { blockRange, dayBounds, fmtLongDate, greetingKey, localHour, todayIn } from '../../src/i18n/format';
import { useDbQuery } from '../../src/lib/useDbQuery';
import { useReady, useSession } from '../../src/store/session';
import { Card } from '../../src/ui/Card';
import { DemoBanner } from '../../src/ui/DemoBanner';
import { Fab } from '../../src/ui/Fab';
import { ProgressBar, Section } from '../../src/ui/bits';
import { T } from '../../src/ui/Text';
import { HERO_GLASS, radius, space, tint, useTheme } from '../../src/ui/theme';

export default function Today() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const { repo, child, profile, settings, tz } = useReady();
  const isDemo = useSession((s) => s.isDemo);
  const { snap } = useSnapshot();
  const now = Date.now();
  const today = todayIn(tz, now);
  const yesterday = addDays(today, -1);
  const [dayStart, dayEnd] = dayBounds(today, tz);

  const { data } = useDbQuery(async () => {
    const [episodes, labels, needsDetails, due, sleep, illnesses, visit, pending, followups, strategies, view, closeToday, closeYesterday] = await Promise.all([
      all<{ started_at: string }>(repo.db, 'SELECT started_at FROM episodes WHERE child_id = ? AND deleted_at IS NULL AND started_at >= ? AND started_at < ?', [profile.id, dayStart, dayEnd]),
      all<{ block_start: string; label_status: LabelStatus }>(repo.db, 'SELECT block_start, label_status FROM blocks WHERE child_id = ? AND local_date = ?', [profile.id, today]),
      episodesNeedingDetails(repo.db, profile.id, iso(now - 3 * 86_400_000)),
      dueDoses(repo.db, profile.id, now),
      sleepEndingBetween(repo.db, profile.id, dayStart, dayEnd),
      ongoingIllnesses(repo.db, profile.id),
      currentVisit(repo.db, profile.id),
      pendingConfirmations(repo.db, profile.id, now, iso(now - 24 * 3_600_000)),
      openFollowups(repo.db, profile.id, now),
      listStrategies(repo.db, profile.id),
      loadStrategyView(repo.db, profile.id),
      closureFor(repo.db, profile.id, today),
      closureFor(repo.db, profile.id, yesterday),
    ]);
    return { episodes, labels, needsDetails, due, sleep, illnesses, visit, pending, followups, strategies, view, closeToday, closeYesterday };
  }, [profile.id, dayStart], null);

  const labelByStart = new Map((data?.labels ?? []).map((l) => [ms(l.block_start), l.label_status]));
  const strip: StripBlock[] = awakeBlocksForDate(today, profile).map((block) => ({
    block,
    level: snap?.forecasts.find((f) => f.start === block.start)?.level ?? null,
    label: labelByStart.get(block.start) ?? null,
    episodes: (data?.episodes ?? []).filter((e) => blockContaining(ms(e.started_at), profile)?.start === block.start).length,
  }));
  const current = forecastAt(snap, now);
  const next = current ?? snap?.forecasts.find((f) => f.start > now) ?? null;
  const ideas = data ? ideasFrom(data.view, settings.strategy_discovery, now) : [];
  const hour = localHour(now, tz);
  const askSleep = hour < 12 && !data?.sleep;

  // A teacher's phone shows the school-hours forecast shared by the family (SPEC 7.1) instead of its own forecast.
  const teacher = settings.member_role === 'teacher' && settings.care_team_enabled;

  // learning banner (SPEC 9.2 / 13.9) or today's outlook
  const learning = !snap || snap.learning;
  const labeledDays = snap?.labeledDays ?? 0;
  const outlook = snap && !snap.learning ? dayOutlook(snap.forecasts.filter((f) => f.end > now), today) : null;
  const outlookText = outlook == null ? '' : outlook.calm ? t('forecast.outlookCalm')
    : t(outlook.level === 'high' ? 'forecast.outlookHigh' : 'forecast.outlookModerate', { ranges: outlook.blocks.map((b) => blockRange(b.index)).join(', ') });

  // end-of-day cards (SPEC 16)
  const created = todayIn(tz, ms(child.created_at));
  const lastYesterday = awakeBlocksForDate(yesterday, profile).pop();
  const closedAtY = data?.closeYesterday ? ms(closedAtOf(data.closeYesterday)) : null;
  const dayCheck: DayCheckState = {
    today,
    tonight: localMinuteOf(now, tz) >= parseHHMM(settings.end_of_day_time) && !data?.closeToday,
    yesterdayOpen: data && !data.closeYesterday && yesterday >= created ? yesterday : null,
    morningAfter: data?.closeYesterday?.all_logged && closedAtY != null && lastYesterday && closedAtY < lastYesterday.end
      ? { date: yesterday, time: formatHHMM(localMinuteOf(closedAtY, tz)) }
      : null,
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
      <DemoBanner />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <LinearGradient colors={[c.heroFrom, c.heroTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ padding: space.xl, paddingTop: space.lg, gap: space.xs, borderBottomLeftRadius: radius.sheet, borderBottomRightRadius: radius.sheet }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <T variant="callout" color="#FFFFFF" style={{ flex: 1 }}>{fmtLongDate(today)}</T>
            {settings.app_lock ? <Lock size={18} color="#FFFFFF" accessibilityLabel={t('today.lockOn')} /> : null}
          </View>
          <T variant="display" color="#FFFFFF" accessibilityRole="header">{t(greetingKey(hour))}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
            <T variant="title" color="#FFFFFF" weight="400">{t('today.forName', { name: profile.nickname })}</T>
            {data?.visit ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: tint(HERO_GLASS.color, HERO_GLASS.alpha), borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                <MapPin size={14} color="#FFFFFF" />
                <T variant="footnote" color="#FFFFFF" weight="600">{data.visit.place_label ?? t('places.away')}</T>
              </View>
            ) : null}
          </View>
          {teacher ? null : <View testID="hero-status" style={{ marginTop: space.md, gap: space.sm, backgroundColor: tint(HERO_GLASS.color, HERO_GLASS.alpha), borderRadius: radius.card, padding: space.md }}>
            {learning ? (
              <>
                <T variant="callout" color="#FFFFFF" weight="600">
                  {t('today.learningDays', { name: profile.nickname, day: Math.min(labeledDays, LEARNING_PERIOD_DAYS), total: LEARNING_PERIOD_DAYS })}
                </T>
                <ProgressBar value={Math.min(labeledDays, LEARNING_PERIOD_DAYS) / LEARNING_PERIOD_DAYS} color="#FFFFFF" label={t('today.learningProgress')} />
              </>
            ) : (
              <>
                <T variant="footnote" color="#FFFFFF" weight="600">{t('today.outlookTitle')}</T>
                <T variant="headline" color="#FFFFFF">{outlookText}</T>
              </>
            )}
          </View>}
        </LinearGradient>

        <View style={{ padding: space.lg, gap: space.xl }}>
          <AskBar />
          {teacher ? <SchoolCard today={today} /> : (
            <>
              <Card style={{ gap: space.md }}>
                <T variant="headline" accessibilityRole="header">{t('today.stripTitle')}</T>
                {strip.length ? <DayStrip blocks={strip} now={now} /> : <T variant="callout" color="muted">{t('today.noAwakeBlocks')}</T>}
              </Card>
              <NowCard f={next} isNow={current != null} learning={learning} ideas={ideas} unavailable={!!snap?.fitError} />
              {data?.pending.map((p) => <ConfirmCard key={p.id} p={p} />)}
              {data?.followups.slice(0, 1).map((f) => <FollowupCard key={f.response_id} f={f} strategies={data.strategies} />)}
              <DayCheckCards s={dayCheck} />
              <Reminders needsDetails={data?.needsDetails ?? []} due={data?.due ?? []} askSleep={askSleep} illnesses={data?.illnesses ?? []} />
            </>
          )}
          {isDemo ? <DemoTools snap={snap} /> : null}
          <Section title={t('today.quickAdd')}>
            <QuickAdd teacher={teacher} />
          </Section>
          {teacher ? null : <SourceChips />}
        </View>
      </ScrollView>
      <Fab />
    </SafeAreaView>
  );
}
