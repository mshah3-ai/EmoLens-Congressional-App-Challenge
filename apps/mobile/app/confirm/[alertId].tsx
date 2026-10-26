/**
 * "How did 2-4 pm go?" (SPEC 15.4): the confirmation after a heads-up. Opened from the CONFIRM notification, the block
 * sheet or the Timeline (answers can be changed; the newest counts).
 *  - A hard moment happened -> saved now (fast path at the block's midpoint if none is logged), then opens it for details;
 *  - We stepped in early -> left out of the risk model; the optional "What did you try?" follows;
 *  - All calm -> a calm block.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { HandHeart, Sun, Zap } from 'lucide-react-native';
import { blockContaining } from '@emolens/engine';
import type { AlertResponseKind } from '@emolens/shared';
import { answerAlert, finishFollowup, getAlert, latestResponse } from '../../src/db/repo/alerts';
import { listStrategies } from '../../src/db/repo/strategies';
import { ms } from '../../src/db/time';
import { requestForecast } from '../../src/forecast';
import { blockRange, dayLabel } from '../../src/i18n/format';
import { afterSave } from '../../src/lib/save';
import { useDbQuery } from '../../src/lib/useDbQuery';
import { cancelNotification } from '../../src/notifications/forecast';
import { useReady } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { ChoiceCard } from '../../src/ui/ChoiceCard';
import { Chip, ChipGroup } from '../../src/ui/Chip';
import { goBack, Sheet } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { space, useTheme } from '../../src/ui/theme';

export default function Confirm() {
  const { t } = useTranslation();
  const { accent, c } = useTheme();
  const { alertId } = useLocalSearchParams<{ alertId: string }>();
  const { repo, profile, tz } = useReady();
  const { data } = useDbQuery(async () => {
    const [alert, current, strategies] = await Promise.all([getAlert(repo.db, alertId), latestResponse(repo.db, alertId), listStrategies(repo.db, profile.id)]);
    return { alert, current, strategies };
  }, [alertId], null);
  const [stepped, setStepped] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  if (data && !data.alert) return <Sheet title={t('confirm.missing')}><T variant="body">{t('confirm.missing')}</T></Sheet>;
  const block = data?.alert ? blockContaining(ms(data.alert.block_start), profile) : undefined;
  const range = block ? blockRange(block.index) : '';

  const answer = async (response: AlertResponseKind) => {
    const res = await answerAlert(repo, profile, alertId, response);
    await cancelNotification(res.confirmNotificationId);
    requestForecast(500);
    if (response === 'stepped_in') { afterSave(t('today.answerSaved')); setStepped(true); return; }
    afterSave(t('today.answerSaved'));
    if (response === 'happened' && res.episodeId) router.replace({ pathname: '/log/episode', params: { id: res.episodeId } });
    else goBack();
  };

  const finish = async (ids: string[]) => {
    const r = await latestResponse(repo.db, alertId);
    if (r && data?.alert) await finishFollowup(repo, profile.id, { response_id: r.id, alert_id: alertId, block_start: data.alert.block_start, scheduled_for: data.alert.scheduled_for }, ids);
    afterSave(ids.length ? t('today.followupSaved') : undefined);
    goBack();
  };

  if (stepped) {
    return (
      <Sheet title={t('today.followupTitle')} footer={
        <View style={{ gap: space.sm }}>
          <Button label={t('common.save')} disabled={!picked.length} onPress={() => void finish(picked)} testID="followup-save" />
          <Button variant="ghost" label={t('today.skip')} onPress={() => void finish([])} />
        </View>
      }>
        <T variant="body">{t('today.followupBody', { range })}</T>
        <ChipGroup>
          {data?.strategies.map((s) => (
            <Chip key={s.id} label={s.name} selected={picked.includes(s.id)} onPress={() => setPicked(picked.includes(s.id) ? picked.filter((x) => x !== s.id) : [...picked, s.id])} />
          ))}
        </ChipGroup>
      </Sheet>
    );
  }

  const cur = data?.current?.response;
  return (
    <Sheet title={t('confirm.title', { range })} testID="confirm-sheet">
      <T variant="callout" color="muted">{t('confirm.subtitle', { day: block ? dayLabel(block.localDate, tz) : '' })}</T>
      {cur ? <Card tone="soft"><T variant="callout">{t('confirm.current', { answer: t(`confirm.${cur === 'stepped_in' ? 'steppedIn' : cur}`) })}</T></Card> : null}
      <View style={{ gap: space.md }}>
        <ChoiceCard testID="answer-happened" icon={Zap} color={accent.episode} title={t('confirm.happened')} body={t('confirm.happenedSub')} selected={cur === 'happened'} onPress={() => void answer('happened')} />
        <ChoiceCard testID="answer-stepped" icon={HandHeart} color={accent.strategy} title={t('confirm.steppedIn')} body={t('confirm.steppedInSub')} selected={cur === 'stepped_in'} onPress={() => void answer('stepped_in')} />
        <ChoiceCard testID="answer-calm" icon={Sun} color={c.riskLow} title={t('confirm.calm')} body={t('confirm.calmSub')} selected={cur === 'calm'} onPress={() => void answer('calm')} />
      </View>
      <T variant="footnote" color="muted">{t('confirm.why')}</T>
    </Sheet>
  );
}
