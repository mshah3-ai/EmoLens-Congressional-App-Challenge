/**
 * End-of-day check (SPEC 16). Shows the day's awake blocks with how each went, the hard moments logged, and any
 * unanswered "How did it go?" questions (answer inline). Then one question:
 * "Were there any other hard moments that aren't logged?"
 *  - "No, that's everything" (one tap, under 15 seconds on a calm day): every finished block without another answer
 *    becomes a calm block;
 *  - "Yes, let me add it": opens the hard-moment sheet, then comes back here;
 *  - "I'm not sure": unknown blocks stay unknown (nothing is guessed).
 * `date` is 'YYYY-MM-DD' or 'today' (the daily notification's link).
 */
import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Zap } from 'lucide-react-native';
import { awakeBlocksForDate, blockContaining } from '@emolens/engine';
import type { EpisodeType, LabelStatus } from '@emolens/shared';
import { pendingConfirmations } from '../../src/db/repo/alerts';
import { closeDay, closureFor } from '../../src/db/repo/closures';
import { addNote } from '../../src/db/repo/logs';
import { all } from '../../src/db/types';
import { iso, ms, nowIso } from '../../src/db/time';
import { DayStrip, type StripBlock } from '../../src/features/today/DayStrip';
import { ConfirmCard } from '../../src/features/today/LoopCards';
import { dayBounds, dayLabel, fmtTime, todayIn } from '../../src/i18n/format';
import { afterSave } from '../../src/lib/save';
import { useDbQuery } from '../../src/lib/useDbQuery';
import { useReady } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { Input } from '../../src/ui/Field';
import { goBack, Sheet } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { space, useTheme } from '../../src/ui/theme';

export default function EndOfDay() {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const params = useLocalSearchParams<{ date: string }>();
  const { repo, profile, tz } = useReady();
  const now = Date.now();
  const date = !params.date || params.date === 'today' ? todayIn(tz, now) : params.date;
  const [from, to] = dayBounds(date, tz);
  const [note, setNote] = useState('');
  const { data } = useDbQuery(async () => {
    const [episodes, labels, pending, closure] = await Promise.all([
      all<{ id: string; started_at: string; type: EpisodeType }>(repo.db, 'SELECT id, started_at, type FROM episodes WHERE child_id = ? AND deleted_at IS NULL AND started_at >= ? AND started_at < ? ORDER BY started_at', [profile.id, from, to]),
      all<{ block_start: string; label_status: LabelStatus }>(repo.db, 'SELECT block_start, label_status FROM blocks WHERE child_id = ? AND local_date = ?', [profile.id, date]),
      pendingConfirmations(repo.db, profile.id, now, from),
      closureFor(repo.db, profile.id, date),
    ]);
    return { episodes, labels, pending: pending.filter((p) => p.block_start < to), closure };
  }, [date], null);

  const labelByStart = new Map((data?.labels ?? []).map((l) => [ms(l.block_start), l.label_status]));
  const strip: StripBlock[] = awakeBlocksForDate(date, profile).map((block) => ({
    block, level: null, label: labelByStart.get(block.start) ?? null,
    episodes: (data?.episodes ?? []).filter((e) => blockContaining(ms(e.started_at), profile)?.start === block.start).length,
  }));
  const day = dayLabel(date, tz).toLowerCase();

  const finish = async (allLogged: boolean) => {
    // A check for an earlier day covers that whole day; tonight's covers up to now.
    const closedAt = date < todayIn(tz, now) ? iso(Math.max(ms(to), now)) : nowIso();
    await closeDay(repo, profile.id, tz, date, allLogged, closedAt);
    if (note.trim()) await addNote(repo, profile.id, note, nowIso());
    afterSave(allLogged ? t('eod.savedAll', { name: profile.nickname }) : t('eod.savedUnsure'));
    goBack();
  };

  return (
    <Sheet title={t('eod.title', { day })} testID="eod-sheet" footer={
      <View style={{ gap: space.sm }}>
        <T variant="headline" center>{t('eod.question')}</T>
        <Button testID="eod-all-logged" label={t('eod.no')} onPress={() => void finish(true)} />
        <Button variant="secondary" label={t('eod.yes')} onPress={() => router.push({ pathname: '/log/episode', params: { at: date === todayIn(tz, now) ? nowIso() : iso(ms(to) - 3 * 3_600_000) } })} />
        <Button variant="ghost" label={t('eod.notSure')} onPress={() => void finish(false)} />
      </View>
    }>
      {data?.closure ? (
        <Card tone="soft"><T variant="callout">{t('eod.done', { day, answer: data.closure.all_logged ? t('eod.answerAll') : t('eod.answerUnsure') })}</T></Card>
      ) : null}
      <Card style={{ gap: space.md }}>
        <T variant="headline">{t('eod.blocks')}</T>
        <DayStrip blocks={strip} now={now} />
      </Card>
      <Card style={{ gap: space.sm }}>
        <T variant="headline">{t('eod.logged')}</T>
        {data?.episodes.length ? data.episodes.map((e) => (
          <View key={e.id} style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <Zap size={16} color={accent.episode} fill={accent.episode} />
            <T variant="body">{fmtTime(e.started_at, tz)} · {t(`episode.types.${e.type}`)}</T>
          </View>
        )) : <T variant="callout" color="muted">{t('eod.noneLogged')}</T>}
      </Card>
      {data?.pending.length ? (
        <View style={{ gap: space.md }}>
          <T variant="headline">{t('eod.unanswered')}</T>
          {data.pending.map((p) => <ConfirmCard key={p.id} p={p} />)}
        </View>
      ) : null}
      <Input label={t('eod.noteLabel', { day })} value={note} onChangeText={setNote} maxLength={300} />
    </Sheet>
  );
}
