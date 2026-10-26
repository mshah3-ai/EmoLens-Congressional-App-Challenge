/** Bottom toast, e.g. "Saved. Thanks." or "Deleted · Undo" (5 s, SPEC 9.3). Announced to screen readers. */
import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { T } from './Text';
import { radius, space, useTheme } from './theme';

interface ToastState {
  message: string | null; actionLabel?: string; onAction?: () => void; key: number;
  show: (message: string, action?: { label: string; onPress: () => void }, ms?: number) => void;
  hide: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useToast = create<ToastState>((set) => ({
  message: null, key: 0,
  show: (message, action, ms = 5000) => {
    if (timer) clearTimeout(timer);
    set((s) => ({ message, actionLabel: action?.label, onAction: action?.onPress, key: s.key + 1 }));
    AccessibilityInfo.announceForAccessibility(message);
    timer = setTimeout(() => set({ message: null, onAction: undefined, actionLabel: undefined }), ms);
  },
  hide: () => set({ message: null, onAction: undefined, actionLabel: undefined }),
}));

export const toast = (message: string, action?: { label: string; onPress: () => void }) => useToast.getState().show(message, action);

export function ToastHost({ bottomOffset = 96 }: { bottomOffset?: number }) {
  const { message, actionLabel, onAction, hide, key } = useToast();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  useEffect(() => () => { if (timer) clearTimeout(timer); }, []);
  if (!message) return null;
  return (
    <Animated.View key={key} entering={FadeInDown.duration(200)} exiting={FadeOutDown.duration(200)} pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + bottomOffset }]}>
      <View accessibilityLiveRegion="polite" style={[styles.toast, { backgroundColor: c.text }]}>
        <T variant="callout" color={c.bg} style={{ flex: 1 }}>{message}</T>
        {actionLabel && onAction ? (
          <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={() => { onAction(); hide(); }} hitSlop={8} style={styles.action}>
            <T variant="headline" color={c.bg} style={{ textDecorationLine: 'underline' }}>{actionLabel}</T>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: space.lg, right: space.lg },
  toast: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.card, minHeight: 52 },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.sm },
});
