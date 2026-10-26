/**
 * Today's "Ask EmoLens" entry bar (SPEC 9.2). With AI features off it says "Turn on AI features" instead and opens
 * that settings screen.
 */
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Bot, MessageCircle } from 'lucide-react-native';
import { useSession } from '../../store/session';
import { T } from '../../ui/Text';
import { radius, space, useTheme } from '../../ui/theme';

export function AskBar() {
  const { t } = useTranslation();
  const { c, accent } = useTheme();
  const on = useSession((s) => s.settings.cloud_ai_enabled);
  const name = useSession((s) => s.profile?.nickname ?? '');
  const Icon = on ? MessageCircle : Bot;
  return (
    <Pressable testID="today-ask" accessibilityRole="button" accessibilityLabel={on ? t('ask.title') : t('ask.turnOnTitle')}
      onPress={() => router.push((on ? '/ask' : '/settings/ai') as never)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, paddingHorizontal: space.md,
        borderRadius: radius.control, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, opacity: pressed ? 0.8 : 1 })}>
      <Icon size={20} color={on ? accent.strategy : c.textMuted} />
      <View style={{ flex: 1 }}>
        <T variant="callout" color="muted">{on ? t('today.askBar', { name }) : t('ask.turnOnTitle')}</T>
      </View>
    </Pressable>
  );
}
