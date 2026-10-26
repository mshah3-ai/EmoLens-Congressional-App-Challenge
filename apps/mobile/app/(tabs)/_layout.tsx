/** Bottom tabs: Today, Timeline, Insights, Team, More (SPEC 9.1). */
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ellipsis, House, Lightbulb, ListTree, Users } from 'lucide-react-native';
import { useTheme } from '../../src/ui/theme';

export default function TabLayout() {
  const { c } = useTheme();
  const { t } = useTranslation();
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: c.primary,
      tabBarInactiveTintColor: c.textMuted,
      tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
      tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
    }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.today'), tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }} />
      <Tabs.Screen name="timeline" options={{ title: t('tabs.timeline'), tabBarIcon: ({ color, size }) => <ListTree color={color} size={size} /> }} />
      <Tabs.Screen name="insights" options={{ title: t('tabs.insights'), tabBarIcon: ({ color, size }) => <Lightbulb color={color} size={size} /> }} />
      <Tabs.Screen name="team/index" options={{ title: t('tabs.team'), tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }} />
      <Tabs.Screen name="more/index" options={{ title: t('tabs.more'), tabBarIcon: ({ color, size }) => <Ellipsis color={color} size={size} /> }} />
    </Tabs>
  );
}
