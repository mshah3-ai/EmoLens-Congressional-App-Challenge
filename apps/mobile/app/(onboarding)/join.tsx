/**
 * "Join a care team" (SPEC 23.2): for a caregiver, teacher or clinician invited by the child's parent.
 *  1. Sign in with an emailed code.
 *  2. Choose how this phone is used (caregivers: their own phone or the child's device; heads-ups on or off).
 *  3. Type the 8-character invite code. The invite-accept function adds you to the team, then this phone downloads the
 *     child's profile and what your role may see. Teachers and clinicians skip the child's profile steps.
 * Clinicians mostly use the web portal; the app tells them where it is.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Baby, BellRing, Laptop, Smartphone, Users } from 'lucide-react-native';
import { rememberSignIn } from '../../src/cloud/account';
import { PORTAL_URL } from '../../src/cloud/client';
import { cloudApi } from '../../src/cloud/current';
import { setSettings } from '../../src/db/repo/settings';
import { SignIn } from '../../src/features/cloud/SignIn';
import { OnboardingFrame } from '../../src/features/OnboardingFrame';
import { joinCareTeam, type JoinError } from '../../src/sync/enable';
import { useOnboarding } from '../../src/store/onboarding';
import { useSession } from '../../src/store/session';
import { Card } from '../../src/ui/Card';
import { ChoiceCard } from '../../src/ui/ChoiceCard';
import { Field, Input } from '../../src/ui/Field';
import { ToggleRow } from '../../src/ui/bits';
import { T } from '../../src/ui/Text';
import { space, useTheme } from '../../src/ui/theme';

export default function Join() {
  const { t } = useTranslation();
  const { accent, c } = useTheme();
  const repo = useSession((s) => s.repo);
  const settings = useSession((s) => s.settings);
  const reload = useSession((s) => s.reload);
  const language = useOnboarding((s) => s.draft.language);
  const [code, setCode] = useState('');
  const [childDevice, setChildDevice] = useState(false);
  const [receiveAlerts, setReceiveAlerts] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<JoinError | null>(null);
  const [clinician, setClinician] = useState<string | null>(null);
  const signedIn = !!settings.account_user_id;

  const join = async () => {
    const api = cloudApi();
    if (!repo || !api || !settings.account_user_id) return;
    setBusy(true); setError(null);
    try {
      const r = await joinCareTeam(repo.db, api, settings.account_user_id, code, { receiveAlerts, childDevice });
      if ('error' in r) { setError(r.error); return; }
      if (r.role === 'clinician') { setClinician(r.nickname ?? ''); return; }
      await setSettings(repo.db, { onboarding_complete: true, language });
      await reload();
      router.replace('/');
    } finally { setBusy(false); }
  };

  if (clinician != null) {
    return (
      <OnboardingFrame step={3} title={t('join.clinicianTitle')} onNext={() => router.replace('/(onboarding)')} nextLabel={t('common.done')}>
        <Card style={{ gap: space.md }} testID="join-clinician">
          <Laptop color={c.primary} size={28} />
          <T variant="body">{t('join.clinicianBody', { name: clinician || t('join.theChild') })}</T>
          <T variant="headline" selectable>{PORTAL_URL || t('join.portalUnknown')}</T>
        </Card>
      </OnboardingFrame>
    );
  }

  return (
    <OnboardingFrame step={3} title={t('join.title')} subtitle={t('join.subtitle')} onNext={() => void join()} nextLabel={t('join.join')}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/(onboarding)/mode'))}
      nextDisabled={!signedIn || code.replace(/[\s-]/g, '').length !== 8} loading={busy}>
      {!signedIn ? (
        <Card style={{ gap: space.md }}>
          <T variant="callout" color="muted">{t('join.signInFirst')}</T>
          <SignIn onSignedIn={async (a) => { if (repo) { await rememberSignIn(repo, a.userId, a.email); await reload(); } }} />
        </Card>
      ) : (
        <>
          <T variant="callout" color="muted">{t('account.signedInAs', { email: settings.account_email ?? '' })}</T>
          <Field label={t('join.code')} hint={t('join.codeHint')}>
            <Input label={t('join.code')} value={code} onChangeText={(v) => setCode(v.toUpperCase().slice(0, 12))} testID="join-code"
              autoCapitalize="characters" autoCorrect={false} autoComplete="off" />
          </Field>
          <T variant="headline" accessibilityRole="header">{t('join.deviceTitle')}</T>
          <View style={{ gap: space.md }}>
            <ChoiceCard icon={Smartphone} color={accent.strategy} title={t('join.myPhone')} body={t('join.myPhoneBody')}
              selected={!childDevice} onPress={() => setChildDevice(false)} testID="join-my-phone" />
            <ChoiceCard icon={Baby} color={accent.place} title={t('join.childDevice')} body={t('join.childDeviceBody')}
              selected={childDevice} onPress={() => setChildDevice(true)} testID="join-child-device" />
          </View>
          {!childDevice ? (
            <Card style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                <BellRing color={c.primary} size={20} />
                <T variant="headline" style={{ flex: 1 }}>{t('join.alertsTitle')}</T>
              </View>
              <ToggleRow title={t('join.receiveAlerts')} subtitle={t('join.receiveAlertsBody')} value={receiveAlerts} onChange={setReceiveAlerts}
                testID="join-alerts" />
            </Card>
          ) : null}
          <Card tone="soft" style={{ flexDirection: 'row', gap: space.sm }}>
            <Users color={c.textMuted} size={20} />
            <T variant="footnote" color="muted" style={{ flex: 1 }}>{t('join.privacyNote')}</T>
          </Card>
          {error ? <T variant="callout" color="danger" testID="join-error" accessibilityLiveRegion="polite">{t(`join.errors.${error}`)}</T> : null}
        </>
      )}
    </OnboardingFrame>
  );
}
