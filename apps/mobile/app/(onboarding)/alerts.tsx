/** Step 12: Alerts (SPEC 8.12): sensitivity with examples, max per day, quiet hours, end-of-day check time. */
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { OnboardingFrame } from '../../src/features/OnboardingFrame';
import { AlertFields } from '../../src/features/AlertFields';
import { useOnboarding } from '../../src/store/onboarding';

export default function Alerts() {
  const { t } = useTranslation();
  const alerts = useOnboarding((s) => s.draft.alerts);
  const set = useOnboarding((s) => s.set);
  const next = () => router.push('/(onboarding)/reveal');
  return (
    <OnboardingFrame step={12} title={t('alertsStep.title')} subtitle={t('alertsStep.subtitle')} onNext={next} onSkip={next}>
      <AlertFields value={alerts} onChange={(patch) => set({ alerts: { ...alerts, ...patch } })} />
    </OnboardingFrame>
  );
}
