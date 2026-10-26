/** Onboarding flow (SPEC 8): a simple stack of 13 steps. */
import { Stack } from 'expo-router';
import { useTheme } from '../../src/ui/theme';

export default function OnboardingLayout() {
  const { c } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'slide_from_right' }} />;
}
