/** Add or edit one medication. Saving writes medication_changes for dose and time changes (SPEC 10.3). */
import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { addMedication, getMedication, stopMedication, updateMedication, type MedicationInput } from '../../src/db/repo/meds';
import { parseJson, type MedSchedule } from '../../src/db/rows';
import { emptyMedication, MedicationForm, medicationValid } from '../../src/features/MedicationForm';
import { fmtDayTime, todayIn } from '../../src/i18n/format';
import { afterSave } from '../../src/lib/save';
import { refreshMedReminders } from '../../src/integrations/appRefresh';
import { nextReminderAt } from '../../src/notifications/medReminders';
import { useReady } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Sheet } from '../../src/ui/layout';

export default function MedicationEdit() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { repo, profile, tz } = useReady();
  const [med, setMed] = useState<MedicationInput>(emptyMedication(todayIn(tz)));
  const [stopped, setStopped] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

  useEffect(() => {
    if (!id) return;
    void getMedication(repo.db, id).then((m) => {
      if (!m) return;
      setStopped(!!m.active_to);
      setMed({ name: m.name, strength: m.strength, form: m.form, schedule: parseJson<MedSchedule>(m.schedule, { times: [], days: [] }),
        asNeeded: !!m.as_needed, remindersEnabled: !!m.reminders_enabled, activeFrom: m.active_from, notes: m.notes, rxcui: m.rxcui });
    });
  }, [id, repo]);

  const save = async () => {
    if (id) await updateMedication(repo, profile.id, id, med);
    else await addMedication(repo, profile.id, med);
    // Say when the next reminder comes (or why none will), so a wrong AM/PM or blocked notifications show up now.
    const sync = await refreshMedReminders();
    const next = med.asNeeded || !med.remindersEnabled ? null : nextReminderAt(med.schedule, tz);
    if (next == null) afterSave(t('common.saved'));
    else if (sync && !sync.allowed) afterSave(t('meds.reminderBlocked'));
    else afterSave(t('meds.reminderSet', { when: fmtDayTime(next, tz) }));
    router.back();
  };
  const stop = async () => {
    if (!id) return;
    await stopMedication(repo, profile, id);
    afterSave(t('meds.stoppedToast'));
    void refreshMedReminders();
    router.back();
  };
  return (
    <Sheet title={id ? t('meds.editTitle') : t('meds.addTitle')} footer={
      <>
        <Button testID="med-save" label={t('common.save')} onPress={() => void save()} disabled={!medicationValid(med)} />
        {id && !stopped ? (
          confirmStop
            ? <Button variant="danger" label={t('meds.confirmStop')} onPress={() => void stop()} />
            : <Button variant="ghost" label={t('meds.stop')} onPress={() => setConfirmStop(true)} />
        ) : null}
      </>
    }>
      <MedicationForm value={med} onChange={setMed} />
    </Sheet>
  );
}
