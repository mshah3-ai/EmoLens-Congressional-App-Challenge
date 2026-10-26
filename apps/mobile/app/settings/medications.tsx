/** More → Medications: current and stopped medications. */
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pill as PillIcon, Plus } from 'lucide-react-native';
import { listMedications } from '../../src/db/repo/meds';
import { parseJson, type MedicationRow, type MedSchedule } from '../../src/db/rows';
import { fmtClock } from '../../src/i18n/format';
import { useDbQuery } from '../../src/lib/useDbQuery';
import { useReady } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { EmptyState, ListRow, RowGroup, Section } from '../../src/ui/bits';
import { Screen } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/theme';

export default function Medications() {
  const { t } = useTranslation();
  const { accent, c } = useTheme();
  const { repo, profile } = useReady();
  const { data: meds } = useDbQuery<MedicationRow[]>(() => listMedications(repo.db, profile.id, true), [profile.id], []);
  const current = meds.filter((m) => !m.active_to);
  const stopped = meds.filter((m) => m.active_to);
  const row = (m: MedicationRow, muted = false) => {
    const s = parseJson<MedSchedule>(m.schedule, { times: [], days: [] });
    return (
      <ListRow key={m.id} icon={PillIcon} iconColor={muted ? c.textMuted : accent.med} title={m.name}
        subtitle={[m.strength, m.as_needed ? t('meds.asNeeded') : s.times.map(fmtClock).join(' · '), muted ? t('meds.stoppedOn', { date: m.active_to }) : null].filter(Boolean).join(' · ')}
        onPress={() => router.push({ pathname: '/settings/medication', params: { id: m.id } })} />
    );
  };
  return (
    <Screen back title={t('more.medications')}>
      <Button icon={Plus} label={t('meds.add')} onPress={() => router.push('/settings/medication')} />
      {current.length ? <RowGroup>{current.map((m) => row(m))}</RowGroup> : <Card><EmptyState icon={PillIcon} title={t('meds.empty')} body={t('meds.emptyBody')} /></Card>}
      {stopped.length ? <Section title={t('meds.stopped')}><RowGroup>{stopped.map((m) => row(m, true))}</RowGroup></Section> : null}
      <T variant="footnote" color="muted">{t('meds.prescriberNote')}</T>
    </Screen>
  );
}
