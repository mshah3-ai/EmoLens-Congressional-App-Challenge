/**
 * Small cards that appear on Today only when needed:
 *  - "Add details" for hard moments saved on the fast path (SPEC 10.1)
 *  - "Medication due" within ±60 min of a scheduled dose: Mark taken / Skip (SPEC 9.2, 10.3)
 *  - "How did {name} sleep?" in the morning until last night's sleep is logged (SPEC 10.5)
 *  - "Mark better" for ongoing illness (SPEC 10.7)
 */
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { BedDouble, Pill, Thermometer, Zap, type LucideProps } from 'lucide-react-native';
import type { ComponentType, ReactNode } from 'react';
import { markDoseTaken, skipDose, type DoseWithMed } from '../../db/repo/meds';
import { markBetter } from '../../db/repo/logs';
import type { EpisodeRow, IllnessRow } from '../../db/rows';
import { nowIso } from '../../db/time';
import { fmtDayTime, fmtTime } from '../../i18n/format';
import { afterSave } from '../../lib/save';
import { useReady } from '../../store/session';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { IconCircle } from '../../ui/bits';
import { T } from '../../ui/Text';
import { space, useTheme } from '../../ui/theme';

function ReminderCard({ icon, color, title, body, children }: { icon: ComponentType<LucideProps>; color: string; title: string; body?: string; children: ReactNode }) {
  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
        <IconCircle icon={icon} color={color} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headline">{title}</T>
          {body ? <T variant="callout" color="muted">{body}</T> : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>{children}</View>
    </Card>
  );
}

export function Reminders({ needsDetails, due, askSleep, illnesses }: {
  needsDetails: EpisodeRow[]; due: DoseWithMed[]; askSleep: boolean; illnesses: IllnessRow[];
}) {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const { repo, profile, tz } = useReady();
  return (
    <>
      {needsDetails.slice(0, 2).map((e) => (
        <ReminderCard key={e.id} icon={Zap} color={accent.episode} title={t('today.detailsTitle')} body={t('today.detailsBody', { time: fmtDayTime(e.started_at, tz) })}>
          <Button small label={t('today.addDetails')} onPress={() => router.push({ pathname: '/log/episode', params: { id: e.id } })} />
        </ReminderCard>
      ))}
      {due.map((d) => (
        <ReminderCard key={d.id} icon={Pill} color={accent.med} title={t('today.medDue', { name: d.med_name })}
          body={[d.dose_text, fmtTime(d.scheduled_for ?? '', tz)].filter(Boolean).join(' · ')}>
          <Button small label={t('today.markTaken')} onPress={async () => { await markDoseTaken(repo, profile.id, d, nowIso()); afterSave(); }} />
          <Button small variant="secondary" label={t('today.skip')} onPress={async () => { await skipDose(repo, profile.id, d); afterSave(t('today.skipped')); }} />
        </ReminderCard>
      ))}
      {askSleep ? (
        <ReminderCard icon={BedDouble} color={accent.sleep} title={t('today.sleepAsk', { name: profile.nickname })}>
          <Button small label={t('today.logSleep')} onPress={() => router.push('/log/sleep')} />
        </ReminderCard>
      ) : null}
      {illnesses.map((i) => (
        <ReminderCard key={i.id} icon={Thermometer} color={accent.illness} title={t('today.illnessOngoing', { kind: t(`illness.kinds.${i.kind}`) })}
          body={t('today.since', { when: fmtDayTime(i.started_at, tz) })}>
          <Button small variant="secondary" label={t('today.markBetter')} onPress={async () => { await markBetter(repo, profile.id, i.id); afterSave(t('today.gladBetter')); }} />
        </ReminderCard>
      ))}
    </>
  );
}
