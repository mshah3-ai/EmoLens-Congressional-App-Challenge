/**
 * Step 3: Mode choice (SPEC 8.3, 23.2).
 *  - Keep everything on this phone (local-only).
 *  - Create an account: email + 6-digit code, then the usual steps; Care Team can be turned on later in Team.
 *  - Join a care team: someone invited you; sign in, type the invite code, and the child's data arrives (join.tsx).
 */
import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Cloud, Smartphone, UserPlus } from 'lucide-react-native';
import { rememberSignIn } from '../../src/cloud/account';
import { SignIn } from '../../src/features/cloud/SignIn';
import { OnboardingFrame } from '../../src/features/OnboardingFrame';
import { useOnboarding } from '../../src/store/onboarding';
import { useSession } from '../../src/store/session';
import { Card } from '../../src/ui/Card';
import { ChoiceCard } from '../../src/ui/ChoiceCard';
import { T } from '../../src/ui/Text';
import { space, useTheme } from '../../src/ui/theme';

export default function Mode() {
  const { t } = useTranslation();
  const { accent, c } = useTheme();
  const repo = useSession((s) => s.repo);
  const reload = useSession((s) => s.reload);
  const email = useSession((s) => s.settings.account_email);
  const setDraft = useOnboarding((s) => s.set);
  const [choice, setChoice] = useState<'local' | 'account' | 'join'>(email ? 'account' : 'local');

  const next = () => {
    if (choice === 'join') { router.push('/(onboarding)/join'); return; }
    setDraft({ mode: choice === 'account' ? 'account' : 'local_only' });
    router.push('/(onboarding)/child');
  };

  return (
    <OnboardingFrame step={3} title={t('mode.title')} subtitle={t('mode.subtitle')} onNext={next}
      nextDisabled={choice === 'account' && !email}>
      <View style={{ gap: space.md }}>
        <ChoiceCard icon={Smartphone} color={accent.place} title={t('mode.localTitle')} body={t('mode.localBody')} selected={choice === 'local'}
          onPress={() => setChoice('local')} testID="mode-local" />
        <ChoiceCard icon={Cloud} color={accent.strategy} title={t('mode.accountTitle')} body={t('mode.accountBody')}
          selected={choice === 'account'} onPress={() => setChoice('account')} testID="mode-account" />
        <ChoiceCard icon={UserPlus} color={accent.routine} title={t('mode.joinTitle')} body={t('mode.joinBody')}
          selected={choice === 'join'} onPress={() => setChoice('join')} testID="mode-join" />
      </View>
      {choice === 'account' ? (
        email ? (
          <Card tone="soft" style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }} testID="mode-signed-in">
            <CheckCircle2 color={c.primary} size={22} />
            <T variant="callout" style={{ flex: 1 }}>{t('account.signedInAs', { email })}</T>
          </Card>
        ) : (
          <Card style={{ gap: space.md }}>
            <T variant="callout" color="muted">{t('mode.accountExplain')}</T>
            <SignIn onSignedIn={async (a) => {
              if (!repo) return;
              await rememberSignIn(repo, a.userId, a.email);
              await reload();
            }} />
          </Card>
        )
      ) : null}
    </OnboardingFrame>
  );
}
