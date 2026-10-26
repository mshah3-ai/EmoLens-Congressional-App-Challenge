/** Log sleep manually (SPEC 10.5): bedtime, wake time, night wakings, quality 1-5. */
import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { addDays, parseHHMM, zonedToUtc } from '@emolens/engine';
import { getSleep, logSleep } from '../../src/db/repo/logs';
import { iso, ms } from '../../src/db/time';
import { durationText } from '../../src/features/TimelineRow';
import { todayIn } from '../../src/i18n/format';
import { afterSave } from '../../src/lib/save';
import { useReady } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { Field } from '../../src/ui/Field';
import { Scale } from '../../src/ui/Scale';
import { TimeField } from '../../src/ui/TimeField';
import { Stepper } from '../../src/ui/bits';
import { Sheet } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';

export default function SleepSheet() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { repo, profile, tz } = useReady();
  const today = todayIn(tz);
  // Defaults: last night's usual bedtime to this morning's usual wake time (never in the future).
  const [start, setStart] = useState(iso(zonedToUtc(addDays(today, -1), parseHHMM(profile.wakeEnd), tz)));
  const [end, setEnd] = useState(iso(Math.min(Date.now(), zonedToUtc(today, parseHHMM(profile.wakeStart), tz))));
  const [wakings, setWakings] = useState(0);
  const [quality, setQuality] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    void getSleep(repo.db, id).then((s) => {
      if (!s) return;
      setStart(s.sleep_start); setEnd(s.sleep_end); setWakings(s.night_wakings ?? 0); setQuality(s.quality);
    });
  }, [id, repo]);

  const minutes = Math.round((ms(end) - ms(start)) / 60_000);
  const valid = minutes > 0 && minutes < 20 * 60;
  const save = async () => {
    await logSleep(repo, profile.id, { sleepStart: start, sleepEnd: end, nightWakings: wakings, quality }, id);
    afterSave();
    router.back();
  };
  return (
    <Sheet title={t('sleep.title', { name: profile.nickname })} footer={<Button label={t('common.save')} onPress={() => void save()} disabled={!valid} />}>
      <Field label={t('sleep.bedtime')}>
        <TimeField label={t('sleep.bedtime')} value={start} onChange={setStart} tz={tz} maxDaysBack={8} />
      </Field>
      <Field label={t('sleep.wake')}>
        <TimeField label={t('sleep.wake')} value={end} onChange={setEnd} tz={tz} />
      </Field>
      <Card tone="soft"><T variant="callout">{valid ? t('sleep.total', { duration: durationText(t, minutes) }) : t('sleep.invalid')}</T></Card>
      <Field label={t('sleep.wakings')}>
        <Stepper label={t('sleep.wakings')} value={wakings} min={0} max={10} onChange={setWakings} />
      </Field>
      <Field label={t('sleep.quality')} optional={t('common.optional')}>
        <Scale label={t('sleep.quality')} labels={[1, 2, 3, 4, 5].map((n) => t(`sleep.qualities.${n}`))} value={quality} onChange={setQuality} />
      </Field>
    </Sheet>
  );
}
