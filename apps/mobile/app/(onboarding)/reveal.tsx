/** Step 13: Your starting profile, "the reveal" (SPEC 8.13). Saves everything, then "Go to Today". */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { DEFAULT_STRATEGIES, SUSPECTED_TRIGGERS } from '@emolens/shared';
import { completeOnboarding } from '../../src/db/repo/onboarding';
import { recordError } from '../../src/db/repo/errors';
import { OnboardingFrame } from '../../src/features/OnboardingFrame';
import { SOURCES } from '../../src/features/sources';
import type { IntegrationId } from '../../src/integrations/types';
import { useOnboarding } from '../../src/store/onboarding';
import { useSession } from '../../src/store/session';
import { Card } from '../../src/ui/Card';
import { toast } from '../../src/ui/Toast';
import { T } from '../../src/ui/Text';
import { radius, space, useTheme } from '../../src/ui/theme';

function Row({ label, value, delay }: { label: string; value: string; delay: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(300)} style={{ gap: 2 }}>
      <T variant="footnote" color="onPrimary" style={{ opacity: 0.85 }}>{label}</T>
      <T variant="headline" color="onPrimary">{value}</T>
    </Animated.View>
  );
}

export default function Reveal() {
  const { t } = useTranslation();
  const { c } = useTheme();
  const draft = useOnboarding((s) => s.draft);
  const notificationsOn = useOnboarding((s) => s.notificationsOn);
  const reset = useOnboarding((s) => s.reset);
  const repo = useSession((s) => s.repo);
  const reload = useSession((s) => s.reload);
  const [saving, setSaving] = useState(false);
  const lang = draft.language;
  const none = t('reveal.none');
  const favorites = [...draft.favoriteDefaults.map((i) => DEFAULT_STRATEGIES[i].name[lang]), ...draft.customStrategies];
  const triggers = SUSPECTED_TRIGGERS.filter((o) => draft.suspectedTriggers.includes(o.id)).map((o) => o.label[lang]);
  const sourceNames = (Object.entries(draft.integrations) as [IntegrationId, boolean][]).filter(([, v]) => v).map(([id]) => t(SOURCES[id].titleKey));
  const sources = [notificationsOn ? t('connect.notifications') : null, ...sourceNames,
    draft.places.length ? t('reveal.placesN', { count: draft.places.length }) : null,
    draft.medications.length ? t('reveal.medsN', { count: draft.medications.length }) : null].filter(Boolean) as string[];

  const go = async () => {
    if (!repo) return;
    setSaving(true);
    try {
      await completeOnboarding(repo, draft);
      await reload();
      reset();
      router.replace('/');
    } catch (e) {
      await recordError(repo.db, 'onboarding', e);
      toast(t('errors.saveFailed'));
      setSaving(false);
    }
  };

  const milestones = [
    { title: t('reveal.m1Title'), body: t('reveal.m1Body') },
    { title: t('reveal.m2Title'), body: t('reveal.m2Body') },
    { title: t('reveal.m3Title'), body: t('reveal.m3Body') },
  ];
  return (
    <OnboardingFrame step={13} title={t('reveal.title')} nextLabel={t('reveal.go')} onNext={go} loading={saving}>
      <Animated.View entering={ZoomIn.duration(350)}>
        <LinearGradient colors={[c.heroFrom, c.heroTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <T variant="footnote" color="onPrimary" style={{ opacity: 0.85 }}>{t('reveal.profileFor')}</T>
          <T variant="display" color="onPrimary">{draft.child.nickname}</T>
          <View style={{ gap: space.md, marginTop: space.sm }}>
            <Row delay={150} label={t('reveal.tracking')} value={draft.modeledTypes.map((k) => t(`episode.types.${k}`)).join(', ')} />
            <Row delay={300} label={t('reveal.toTest')} value={triggers.length ? triggers.join(', ') : none} />
            <Row delay={450} label={t('reveal.helps')} value={favorites.length ? favorites.join(', ') : none} />
            <Row delay={600} label={t('reveal.connected')} value={sources.length ? sources.join(', ') : none} />
          </View>
        </LinearGradient>
      </Animated.View>
      <Card style={{ gap: space.lg }}>
        <T variant="headline" accessibilityRole="header">{t('reveal.whatNext')}</T>
        {milestones.map((m, i) => (
          <Animated.View key={m.title} entering={FadeInDown.delay(750 + i * 150).duration(300)} style={{ flexDirection: 'row', gap: space.md }}>
            <View style={{ alignItems: 'center' }}>
              <View style={[styles.dot, { backgroundColor: i === 0 ? c.primary : c.primarySoft, borderColor: c.primary }]} />
              {i < milestones.length - 1 ? <View style={[styles.line, { backgroundColor: c.border }]} /> : null}
            </View>
            <View style={{ flex: 1, gap: 2, paddingBottom: space.sm }}>
              <T variant="headline">{m.title}</T>
              <T variant="callout" color="muted">{m.body}</T>
            </View>
          </Animated.View>
        ))}
      </Card>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.card + 4, padding: space.xl, gap: space.xs },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, marginTop: 3 },
  line: { width: 2, flex: 1, marginVertical: 4 },
});
