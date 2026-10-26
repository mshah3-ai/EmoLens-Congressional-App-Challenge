/** Step 9: Medications (optional, SPEC 8.9). */
import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pill as PillIcon, Plus } from 'lucide-react-native';
import { localDateOf } from '@emolens/engine';
import type { MedicationInput } from '../../src/db/repo/meds';
import { OnboardingFrame } from '../../src/features/OnboardingFrame';
import { emptyMedication, MedicationForm, medicationValid } from '../../src/features/MedicationForm';
import { useOnboarding } from '../../src/store/onboarding';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { ListRow, RowGroup } from '../../src/ui/bits';
import { fmtClock } from '../../src/i18n/format';
import { T } from '../../src/ui/Text';
import { space, useTheme } from '../../src/ui/theme';

export default function Meds() {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const meds = useOnboarding((s) => s.draft.medications);
  const tz = useOnboarding((s) => s.draft.child.homeTz);
  const set = useOnboarding((s) => s.set);
  const [editing, setEditing] = useState<MedicationInput | null>(null);
  const next = () => router.push('/(onboarding)/places');
  if (editing) {
    return (
      <OnboardingFrame step={9} title={t('meds.addTitle')} nextLabel={t('meds.save')} nextDisabled={!medicationValid(editing)}
        onNext={() => { set({ medications: [...meds, editing] }); setEditing(null); }} onSkip={() => setEditing(null)}
        onBack={() => setEditing(null)}>
        <MedicationForm value={editing} onChange={setEditing} />
      </OnboardingFrame>
    );
  }
  return (
    <OnboardingFrame step={9} title={t('meds.stepTitle')} subtitle={t('meds.stepSubtitle')} onNext={next} onSkip={meds.length ? undefined : next}>
      {meds.length ? (
        <RowGroup>
          {meds.map((m, i) => (
            <ListRow key={i} icon={PillIcon} iconColor={accent.med} title={m.name}
              subtitle={m.asNeeded ? t('meds.asNeeded') : m.schedule.times.map(fmtClock).join(' · ')}
              right={<Button small variant="ghost" label={t('common.remove')} onPress={() => set({ medications: meds.filter((_, j) => j !== i) })} />} />
          ))}
        </RowGroup>
      ) : (
        <Card tone="soft" style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <PillIcon size={22} color={accent.med} />
          <T variant="callout" style={{ flex: 1 }}>{t('meds.privacyNote')}</T>
        </Card>
      )}
      <Button variant="secondary" icon={Plus} label={t('meds.add')} onPress={() => setEditing(emptyMedication(localDateOf(Date.now(), tz)))} />
    </OnboardingFrame>
  );
}
