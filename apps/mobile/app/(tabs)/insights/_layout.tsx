/** Insights tab stack (SPEC 9.1): the hub, then trigger detail, worth watching, strategies and model health, with the tab bar kept. */
import { Stack } from 'expo-router';
import { useTheme } from '../../../src/ui/theme';

export default function InsightsLayout() {
  const { c } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }} />;
}
