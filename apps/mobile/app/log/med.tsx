/**
 * Log → Med (SPEC 10.3): mark today's scheduled doses taken or skipped, or log an as-needed / extra dose.
 * Opened with ?doseId=… from the Timeline to change one dose.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pill as PillIcon } from 'lucide-react-native';
import { dosesBetween, getDose, listMedications, logAsNeededDose, markDoseTaken, skipDose, type DoseWithMed } from '../../src/db/repo/meds';
import type { MedicationRow } from '../../src/db/rows';
import { nowIso } from '../../src/db/time';
import { dayBounds, fmtTime, todayIn } from '../../src/i18n/format';
import { afterSave } from '../../src/lib/save';
import { useReady } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { Chip, ChipGroup } from '../../src/ui/Chip';
import { Field, Input } from '../../src/ui/Field';
import { TimeField } from '../../src/ui/TimeField';
import { EmptyState, IconCircle, Section } from '../../src/ui/bits';
import { Sheet } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { space, useTheme } from '../../src/ui/theme';

export default function MedSheet() {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const { doseId } = useLocalSearchParams<{ doseId?: string }>();
  const { repo, profile, tz, bump } = useReady();
  const [meds, setMeds] = useState<MedicationRow[]>([]);
  const [doses, setDoses] = useState<DoseWithMed[]>([]);
  const [editDose, setEditDose] = useState<DoseWithMed | null>(null);
  const [medId, setMedId] = useState<string | null>(null);
  const [takenAt, setTakenAt] = useState(nowIso());
  const [doseText, setDoseText] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    void (async () => {
      const [start, end] = dayBounds(todayIn(tz), tz);
      const [m, d] = await Promise.all([listMedications(repo.db, profile.id), dosesBetween(repo.db, profile.id, start, end)]);
      setMeds(m); setDoses(d);
      if (m.length === 1) setMedId(m[0].id);
      if (doseId) {
        const one = await getDose(repo.db, doseId);
        setEditDose(one);
        if (one?.taken_at) setTakenAt(one.taken_at);
      }
    })();
  }, [repo, profile.id, tz, doseId, version]);

  const refresh = () => { setVersion((v) => v + 1); bump(); };

  if (editDose) {
    return (
      <Sheet title={editDose.med_name} footer={
        <>
          <Button label={t('meds.markTakenAt')} onPress={async () => { await markDoseTaken(repo, profile.id, editDose, takenAt); afterSave(); router.back(); }} />
          {editDose.scheduled_for ? <Button variant="secondary" label={t('today.skip')} onPress={async () => { await skipDose(repo, profile.id, editDose); afterSave(t('today.skipped')); router.back(); }} /> : null}
        </>
      }>
        <Card style={{ gap: space.xs }}>
          <T variant="headline">{t(`timeline.dose.${editDose.status}`)}</T>
          {editDose.scheduled_for ? <T variant="callout" color="muted">{t('meds.scheduledAt', { time: fmtTime(editDose.scheduled_for, tz) })}</T> : null}
        </Card>
        <Field label={t('meds.takenAt')}>
          <TimeField label={t('meds.takenAt')} value={takenAt} onChange={setTakenAt} tz={tz} />
        </Field>
      </Sheet>
    );
  }

  if (!meds.length) {
    return (
      <Sheet title={t('meds.logTitle')}>
        <Card><EmptyState icon={PillIcon} title={t('meds.empty')} body={t('meds.emptyBody')}
          action={<Button small label={t('meds.add')} onPress={() => router.replace('/settings/medication')} />} /></Card>
      </Sheet>
    );
  }

  const selected = meds.find((m) => m.id === medId);
  return (
    <Sheet title={t('meds.logTitle')} footer={
      <Button label={t('meds.logDose')} disabled={!selected} onPress={async () => {
        if (!selected) return;
        await logAsNeededDose(repo, profile.id, selected.id, takenAt, doseText.trim() || selected.strength);
        afterSave(); router.back();
      }} />
    }>
      {doses.length ? (
        <Section title={t('meds.todayDoses')}>
          {doses.map((d) => (
            <Card key={d.id} style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
                <IconCircle icon={PillIcon} color={accent.med} />
                <View style={{ flex: 1 }}>
                  <T variant="headline">{d.med_name}</T>
                  <T variant="callout" color="muted">{`${fmtTime(d.scheduled_for ?? '', tz)} · ${t(`timeline.dose.${d.status}`)}`}</T>
                </View>
              </View>
              {d.status === 'pending' || d.status === 'missed' ? (
                <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                  <Button small label={t('today.markTaken')} onPress={async () => { await markDoseTaken(repo, profile.id, d, nowIso()); refresh(); }} />
                  <Button small variant="secondary" label={t('today.skip')} onPress={async () => { await skipDose(repo, profile.id, d); refresh(); }} />
                </View>
              ) : null}
            </Card>
          ))}
        </Section>
      ) : null}
      <Section title={t('meds.asNeededTitle')}>
        <Field label={t('meds.which')}>
          <ChipGroup>
            {meds.map((m) => <Chip key={m.id} label={m.name} selected={medId === m.id} onPress={() => setMedId(m.id)} />)}
          </ChipGroup>
        </Field>
        <Field label={t('meds.takenAt')}>
          <TimeField label={t('meds.takenAt')} value={takenAt} onChange={setTakenAt} tz={tz} />
        </Field>
        <Field label={t('meds.doseText')} optional={t('common.optional')}>
          <Input label={t('meds.doseText')} value={doseText} onChangeText={setDoseText} placeholder={selected?.strength ?? t('meds.strengthPlaceholder')} />
        </Field>
      </Section>
    </Sheet>
  );
}
