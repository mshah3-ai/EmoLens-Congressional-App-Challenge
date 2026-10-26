/** Illness and discomfort (SPEC 10.7): kind, severity 1-3, start, "still ongoing". Ongoing ones show on Today. */
import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getIllness, logIllness } from '../../src/db/repo/logs';
import { ILLNESS_KINDS, type IllnessKind } from '../../src/db/rows';
import { nowIso } from '../../src/db/time';
import { afterSave } from '../../src/lib/save';
import { useReady } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Chip, ChipGroup } from '../../src/ui/Chip';
import { Field, Input } from '../../src/ui/Field';
import { Scale } from '../../src/ui/Scale';
import { TimeField } from '../../src/ui/TimeField';
import { RowGroup, ToggleRow } from '../../src/ui/bits';
import { Sheet } from '../../src/ui/layout';

export default function IllnessSheet() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { repo, profile, tz } = useReady();
  const [kind, setKind] = useState<IllnessKind | null>(null);
  const [severity, setSeverity] = useState<number | null>(2);
  const [startedAt, setStartedAt] = useState(nowIso());
  const [ongoing, setOngoing] = useState(true);
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (!id) return;
    void getIllness(repo.db, id).then((i) => {
      if (!i) return;
      setKind(i.kind); setSeverity(i.severity); setStartedAt(i.started_at); setOngoing(!i.ended_at); setNotes(i.notes ?? '');
    });
  }, [id, repo]);
  const save = async () => {
    if (!kind) return;
    await logIllness(repo, profile.id, { kind, severity: severity ?? 2, startedAt, ongoing, notes: notes.trim() || null }, id);
    afterSave(t('illness.saved'));
    router.back();
  };
  return (
    <Sheet title={t('illness.title')} footer={<Button label={t('common.save')} onPress={() => void save()} disabled={!kind} />}>
      <Field label={t('illness.kind')}>
        <ChipGroup>
          {ILLNESS_KINDS.map((k) => <Chip key={k} label={t(`illness.kinds.${k}`)} selected={kind === k} onPress={() => setKind(k)} />)}
        </ChipGroup>
      </Field>
      <Field label={t('illness.severityLabel')}>
        <Scale label={t('illness.severityLabel')} labels={[1, 2, 3].map((n) => t(`illness.severity.${n}`))} value={severity} onChange={setSeverity} />
      </Field>
      <Field label={t('illness.started')}>
        <TimeField label={t('illness.started')} value={startedAt} onChange={setStartedAt} tz={tz} maxDaysBack={14} />
      </Field>
      <RowGroup>
        <ToggleRow title={t('illness.ongoing')} subtitle={t('illness.ongoingHint')} value={ongoing} onChange={setOngoing} />
      </RowGroup>
      <Field label={t('common.notes')} optional={t('common.optional')}>
        <Input label={t('common.notes')} value={notes} onChangeText={setNotes} multiline />
      </Field>
    </Sheet>
  );
}
