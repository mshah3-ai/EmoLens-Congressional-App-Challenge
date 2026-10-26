/**
 * Page layouts.
 *  - `Screen`: a scrolling tab or settings page with a large title.
 *  - `Sheet`: a log form in a modal sheet with a close button and a sticky Save button (SPEC 10).
 */
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { DemoBanner } from './DemoBanner';
import { T } from './Text';
import { space, useTheme } from './theme';

/** Back / Close: the previous screen, or Today if there is none (screen opened after a reload or from a link). */
export function goBack(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export function Screen({ title, subtitle, children, back, right, overlay, scroll = true, testID }: {
  title?: string; subtitle?: string; children: ReactNode; back?: boolean; right?: ReactNode; overlay?: ReactNode; scroll?: boolean; testID?: string;
}) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const header = (title || back) ? (
    <View style={styles.header}>
      {back ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={goBack} hitSlop={8} style={styles.backBtn}>
          <ChevronLeft size={26} color={c.primary} />
          <T variant="body" color="primary">{t('common.back')}</T>
        </Pressable>
      ) : null}
      <View style={styles.titleRow}>
        {title ? <T variant="display" accessibilityRole="header" style={{ flex: 1 }}>{title}</T> : <View style={{ flex: 1 }} />}
        {right}
      </View>
      {subtitle ? <T variant="callout" color="muted">{subtitle}</T> : null}
    </View>
  ) : null;
  return (
    <SafeAreaView testID={testID} edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
      <DemoBanner />
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {header}
          {children}
        </ScrollView>
      ) : (<View style={{ flex: 1 }}>{header}{children}</View>)}
      {overlay}
    </SafeAreaView>
  );
}

export function Sheet({ title, children, footer, onClose, testID }: { title: string; children: ReactNode; footer?: ReactNode; onClose?: () => void; testID?: string }) {
  const { c } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView testID={testID} behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.sheetHeader, { borderBottomColor: c.border, paddingTop: Platform.OS === 'ios' ? space.lg : insets.top + space.sm }]}>
        <T variant="title" accessibilityRole="header" style={{ flex: 1 }}>{title}</T>
        <Pressable testID="sheet-close" accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose ?? goBack}
          hitSlop={8} style={[styles.close, { backgroundColor: c.surfaceAlt }]}>
          <X size={20} color={c.text} />
        </Pressable>
      </View>
      <DemoBanner />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: space.xxl }]} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { backgroundColor: c.surface, borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, space.lg) }]}>
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xl, paddingBottom: 120 },
  header: { gap: space.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  backBtn: { flexDirection: 'row', alignItems: 'center', minHeight: 44, marginLeft: -6 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth },
});
