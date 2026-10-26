/**
 * Today cards for the prediction-confirmation loop and the end-of-day check. Nothing is ever lost: every unanswered
 * "How did 2-4 pm go?" appears here too, not only as a notification (SPEC 15.1).
 *  - ConfirmCard: the three answers inline (SPEC 15.4);
 *  - FollowupCard: after "We stepped in early", the optional "What did you try?" (credits the strategy, SPEC 15.4);
 *  - DayCheckCards: tonight's quick check, "Finish yesterday's check", and "Anything happen after 8:30 pm last night?" (SPEC 16).
 */
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ClipboardCheck, HandHeart, MessageCircleQuestion, MoonStar, Sun, Zap } from 'lucide-react-native';
import type { AlertResponseKind } from '@emolens/shared';
import { blockContaining, parseHHMM, zonedToUtc } from '@emolens/engine';
import { answerAlert, finishFollowup, type Followup, type PendingConfirm } from '../../db/repo/alerts';
import { closeDay } from '../../db/repo/closures';
import { iso, ms } from '../../db/time';
import type { StrategyRow } from '../../db/rows';
import { requestForecast } from '../../forecast';
import { cancelNotification } from '../../notifications/forecast';
import { blockRange, dayLabel, fmtClock } from '../../i18n/format';
import { afterSave } from '../../lib/save';
import { useReady } from '../../store/session';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Chip, ChipGroup } from '../../ui/Chip';
import { IconCircle } from '../../ui/bits';
import { T } from '../../ui/Text';
import { space, useTheme } from '../../ui/theme';

function Head({ icon, color, title, body }: { icon: typeof Zap; color: string; title: string; body?: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
      <IconCircle icon={icon} color={color} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="headline">{title}</T>
        {body ? <T variant="callout" color="muted">{body}</T> : null}
      </View>
    </View>
  );
}

/** Saves an answer, then refreshes the forecast; "A hard moment happened" opens the (fast-path) hard moment. */
export function useAnswer() {
  const { t } = useTranslation();
  const { repo, profile } = useReady();
  return async (alertId: string, response: AlertResponseKind) => {
    const res = await answerAlert(repo, profile, alertId, response);
    await cancelNotification(res.confirmNotificationId);
    afterSave(t('today.answerSaved'));
    requestForecast(500);
    if (response === 'happened' && res.episodeId) router.push({ pathname: '/log/episode', params: { id: res.episodeId } });
  };
}

export function ConfirmCard({ p }: { p: PendingConfirm }) {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const { profile } = useReady();
  const answer = useAnswer();
  const b = blockContaining(ms(p.block_start), profile);
  const range = b ? blockRange(b.index) : '';
  return (
    <Card testID={`confirm-card-${p.id}`} style={{ gap: space.md }}>
      <Head icon={MessageCircleQuestion} color={accent.episode} title={t('today.confirmTitle', { range })}
        body={`${dayLabel(b?.localDate ?? '', profile.homeTz)} · ${t('today.confirmBody')}`} />
      <View style={{ gap: space.sm }}>
        <Button icon={Zap} variant="secondary" label={t('confirm.happened')} onPress={() => void answer(p.id, 'happened')} testID="confirm-happened" />
        <Button icon={HandHeart} variant="secondary" label={t('confirm.steppedIn')} onPress={() => void answer(p.id, 'stepped_in')} testID="confirm-stepped" />
        <Button icon={Sun} variant="secondary" label={t('confirm.calm')} onPress={() => void answer(p.id, 'calm')} testID="confirm-calm" />
      </View>
      <T variant="footnote" color="muted">{t('confirm.why')}</T>
    </Card>
  );
}

export function FollowupCard({ f, strategies }: { f: Followup; strategies: StrategyRow[] }) {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const { repo, profile } = useReady();
  const [picked, setPicked] = useState<string[]>([]);
  const b = blockContaining(ms(f.block_start), profile);
  const done = async (ids: string[]) => {
    await finishFollowup(repo, profile.id, f, ids);
    afterSave(ids.length ? t('today.followupSaved') : undefined);
  };
  return (
    <Card style={{ gap: space.md }}>
      <Head icon={HandHeart} color={accent.strategy} title={t('today.followupTitle')} body={t('today.followupBody', { range: b ? blockRange(b.index) : '' })} />
      <ChipGroup>
        {strategies.map((s) => (
          <Chip key={s.id} label={s.name} selected={picked.includes(s.id)}
            onPress={() => setPicked(picked.includes(s.id) ? picked.filter((x) => x !== s.id) : [...picked, s.id])} />
        ))}
      </ChipGroup>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
        <Button small label={t('common.save')} disabled={!picked.length} onPress={() => void done(picked)} />
        <Button small variant="ghost" label={t('today.skip')} onPress={() => void done([])} />
      </View>
    </Card>
  );
}

export interface DayCheckState {
  today: string;
  /** Show tonight's check (after the end-of-day time, not answered yet). */
  tonight: boolean;
  /** Yesterday has no answer yet (shown until 23:59 today). */
  yesterdayOpen: string | null;
  /** Yesterday was closed at this time ('HH:MM' local) and awake blocks ended after it: ask the morning question. */
  morningAfter: { date: string; time: string } | null;
}

export function DayCheckCards({ s }: { s: DayCheckState }) {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const { repo, profile } = useReady();
  return (
    <>
      {s.tonight ? (
        <Card testID="eod-card" style={{ gap: space.md }} onPress={() => router.push(`/end-of-day/${s.today}`)} accessibilityLabel={t('today.eodTitle')}>
          <Head icon={ClipboardCheck} color={accent.routine} title={t('today.eodTitle')} body={t('today.eodBody')} />
          <Button small label={t('today.eodOpen')} onPress={() => router.push(`/end-of-day/${s.today}`)} />
        </Card>
      ) : null}
      {s.yesterdayOpen ? (
        <Card style={{ gap: space.md }}>
          <Head icon={ClipboardCheck} color={accent.routine} title={t('today.yesterdayTitle')} body={t('today.yesterdayBody')} />
          <Button small label={t('today.eodOpen')} onPress={() => router.push(`/end-of-day/${s.yesterdayOpen}`)} />
        </Card>
      ) : null}
      {s.morningAfter ? (
        <Card testID="morning-card" style={{ gap: space.md }}>
          <Head icon={MoonStar} color={accent.sleep} title={t('today.morningTitle', { time: fmtClock(s.morningAfter.time) })} />
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            <Button small variant="secondary" label={t('today.morningYes')} onPress={() => {
              const m = s.morningAfter as { date: string; time: string };
              router.push({ pathname: '/log/episode', params: { at: iso(zonedToUtc(m.date, parseHHMM(m.time) + 30, profile.homeTz)) } });
            }} />
            <Button small label={t('today.morningNo')} onPress={async () => {
              await closeDay(repo, profile.id, profile.homeTz, (s.morningAfter as { date: string }).date, true);
              afterSave();
            }} />
          </View>
        </Card>
      ) : null}
    </>
  );
}
