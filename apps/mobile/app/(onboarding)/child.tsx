/** Step 4: About your child (SPEC 8.4). Nickname required; everything else optional with sensible defaults. */
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { OnboardingFrame } from '../../src/features/OnboardingFrame';
import { ChildFields, validTimeZone } from '../../src/features/ChildFields';
import { useOnboarding } from '../../src/store/onboarding';
import { space } from '../../src/ui/theme';

export default function Child() {
  const { t } = useTranslation();
  const child = useOnboarding((s) => s.draft.child);
  const setChild = useOnboarding((s) => s.setChild);
  return (
    <OnboardingFrame step={4} title={t('child.title')} subtitle={t('child.subtitle')} nextDisabled={!child.nickname.trim() || !validTimeZone(child.homeTz)}
      onNext={() => router.push('/(onboarding)/frequency')}>
      <View style={{ gap: space.xl }}>
        <ChildFields value={child} onChange={setChild} />
      </View>
    </OnboardingFrame>
  );
}
