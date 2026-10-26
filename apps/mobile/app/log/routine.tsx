/** "Something's different today" (SPEC 10.8): description, how different (1-3), optional time. */
import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { localDateOf } from '@emolens/engine';
import { getRoutine, logRoutineChange } from '../../src/db/repo/logs';
import { nowIso, ms } from '../../src/db/time';
import { dayBounds, todayIn } from '../../src/i18n/format';
import { afterSave } from '../../src/lib/save';
import { useReady } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Chip, ChipGroup } from '../../src/ui/Chip';
import { Field, Input } from '../../src/ui/Field';
import { Scale } from '../../src/ui/Scale';
import { TimeField } from '../../src/ui/TimeField';
import { RowGroup, ToggleRow } from '../../src/ui/bits';
import { Sheet } from '../../src/ui/layout';

const EXAMPLES = ['substitute', 'visitors', 'travel', 'schedule', 'newPlace'] as const;

export default function RoutineSheet() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { repo, profile, tz } = useReady();
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<number | null>(2);
  const [atTime, setAtTime] = useState(false);
  const [time, setTime] = useState(nowIso());
  const [localDate, setLocalDate] = useState(todayIn(tz));
  useEffect(() => {
    if (!id) return;
    void getRoutine(repo.db, id).then((r) => {
      if (!r) return;
      setDescription(r.description ?? ''); setSeverity(r.severity); setLocalDate(r.local_date);
      if (r.start_at) { setAtTime(true); setTime(r.start_at); }
    });
  }, [id, repo]);
  const save = async () => {
    const date = atTime ? localDateOf(ms(time), tz) : localDate;
    await logRoutineChange(repo, profile.id, { localDate: date, startAt: atTime ? time : null, description: description.trim() || null, severity: severity ?? 2 },
      dayBounds(date, tz)[0], id);
    afterSave();
    router.back();
  };
  return (
    <Sheet title={t('routine.title')} footer={<Button label={t('common.save')} onPress={() => void save()} />}>
      <Field label={t('routine.what')} optional={t('common.optional')}>
        <Input label={t('routine.what')} value={description} onChangeText={setDescription} placeholder={t('routine.placeholder')} multiline />
      </Field>
      <ChipGroup>
        {EXAMPLES.map((k) => <Chip key={k} label={t(`routine.examples.${k}`)} selected={description === t(`routine.examples.${k}`)} onPress={() => setDescription(t(`routine.examples.${k}`))} />)}
      </ChipGroup>
      <Field label={t('routine.howDifferent')}>
        <Scale label={t('routine.howDifferent')} labels={[1, 2, 3].map((n) => t(`routine.severity.${n}`))} value={severity} onChange={setSeverity} />
      </Field>
      <RowGroup>
        <ToggleRow title={t('routine.atTime')} value={atTime} onChange={setAtTime} />
      </RowGroup>
      {atTime ? <TimeField label={t('routine.time')} value={time} onChange={setTime} tz={tz} allowFuture /> : null}
    </Sheet>
  );
}
