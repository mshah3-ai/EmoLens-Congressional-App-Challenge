/** Step 7: What do you think sets things off? Each pick nudges that feature's starting guess (SPEC 8.7, B.4). */
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SUSPECTED_TRIGGERS } from '@emolens/shared';
import { OnboardingFrame } from '../../src/features/OnboardingFrame';
import { toggle, useOnboarding } from '../../src/store/onboarding';
import { Card } from '../../src/ui/Card';
import { Chip, ChipGroup } from '../../src/ui/Chip';
import { T } from '../../src/ui/Text';

export default function Triggers() {
  const { t } = useTranslation();
  const lang = useOnboarding((s) => s.draft.language);
  const picked = useOnboarding((s) => s.draft.suspectedTriggers);
  const set = useOnboarding((s) => s.set);
  const next = () => router.push('/(onboarding)/helps');
  return (
    <OnboardingFrame step={7} title={t('triggers.title')} subtitle={t('triggers.subtitle')} onNext={next} onSkip={() => { set({ suspectedTriggers: [] }); next(); }}>
      <ChipGroup>
        {SUSPECTED_TRIGGERS.map((o) => (
          <Chip key={o.id} label={o.label[lang]} selected={picked.includes(o.id)} onPress={() => set({ suspectedTriggers: toggle(picked, o.id) })} />
        ))}
      </ChipGroup>
      <Card tone="soft"><T variant="callout">{t('triggers.note')}</T></Card>
    </OnboardingFrame>
  );
}
