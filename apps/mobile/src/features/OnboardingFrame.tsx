/** Shared frame for the 13 onboarding steps: progress at the top (SPEC 8), content, Continue / Skip at the bottom. */
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ChevronLeft } from 'lucide-react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/Button';
import { ProgressBar } from '../ui/bits';
import { T } from '../ui/Text';
import { space, useTheme } from '../ui/theme';

export const ONBOARDING_STEPS = 13;
/** Step N's route is ONBOARDING_ROUTES[N - 1]. */
export const ONBOARDING_ROUTES = ['/(onboarding)', '/(onboarding)/who', '/(onboarding)/mode', '/(onboarding)/child', '/(onboarding)/frequency',
  '/(onboarding)/types', '/(onboarding)/triggers', '/(onboarding)/helps', '/(onboarding)/meds', '/(onboarding)/places', '/(onboarding)/connect',
  '/(onboarding)/alerts', '/(onboarding)/reveal'] as const;

/** Back to the previous step. If this step was opened without history (app reloaded here, or a link), go there directly. */
export function previousStep(step: number): void {
  if (router.canGoBack()) router.back();
  else router.replace(ONBOARDING_ROUTES[Math.max(0, step - 2)]);
}

/** `onBack` replaces "previous step" when the step shows a form of its own (step 9's Add medication): Back closes it. */
export function OnboardingFrame({ step, title, subtitle, children, onNext, nextLabel, nextDisabled, onSkip, onBack, loading }: {
  step: number; title: string; subtitle?: string; children?: ReactNode; onNext: () => void; nextLabel?: string;
  nextDisabled?: boolean; onSkip?: () => void; onBack?: () => void; loading?: boolean;
}) {
  const { c } = useTheme();
  const { t } = useTranslation();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {step > 1 ? (
          <View style={styles.top}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={onBack ?? (() => previousStep(step))} hitSlop={8} style={styles.back}>
              <ChevronLeft size={26} color={c.primary} />
            </Pressable>
            <View style={{ flex: 1, gap: 4 }}>
              <T variant="footnote" color="muted">{t('onboarding.stepOf', { step, total: ONBOARDING_STEPS })}</T>
              <ProgressBar value={step / ONBOARDING_STEPS} label={t('onboarding.stepOf', { step, total: ONBOARDING_STEPS })} />
            </View>
          </View>
        ) : null}
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeIn.duration(200)} style={{ gap: space.sm }}>
            <T variant="display" accessibilityRole="header">{title}</T>
            {subtitle ? <T variant="body" color="muted">{subtitle}</T> : null}
          </Animated.View>
          {children}
        </ScrollView>
        <View style={[styles.footer, { borderTopColor: c.border, backgroundColor: c.bg }]}>
          <Button testID="onboarding-next" label={nextLabel ?? t('common.continue')} onPress={onNext} disabled={nextDisabled} loading={loading} />
          {onSkip ? <Button label={t('onboarding.skip')} variant="ghost" onPress={onSkip} small /> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: space.xl, gap: space.xl, paddingBottom: space.xxl },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.md, gap: space.xs, borderTopWidth: StyleSheet.hairlineWidth },
});
