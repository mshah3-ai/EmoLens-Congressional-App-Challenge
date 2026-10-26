/**
 * Sign in or create an account with an emailed 6-digit code (SPEC 8 step 3). No passwords: the code proves the email
 * address is yours. Used in onboarding (create / join) and in More → Account.
 */
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Mail } from 'lucide-react-native';
import { sendCode, verifyCode, cloudConfigured, type AuthError } from '../../cloud/client';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { Field, Input } from '../../ui/Field';
import { T } from '../../ui/Text';
import { space } from '../../ui/theme';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignIn({ onSignedIn }: { onSignedIn: (a: { userId: string; email: string }) => Promise<void> | void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthError | null>(null);

  if (!cloudConfigured()) {
    return <Card tone="soft" testID="signin-not-configured"><T variant="callout">{t('account.errors.not_configured')}</T></Card>;
  }

  const send = async () => {
    const e = email.trim();
    if (!EMAIL.test(e)) { setError('invalid_email'); return; }
    setBusy(true); setError(null);
    const err = await sendCode(e);
    setBusy(false);
    if (err) setError(err); else { setSentTo(e); setCode(''); }
  };

  const verify = async () => {
    if (!sentTo) return;
    setBusy(true); setError(null);
    const r = await verifyCode(sentTo, code);
    if ('error' in r) { setBusy(false); setError(r.error); return; }
    try { await onSignedIn(r); } finally { setBusy(false); }
  };

  return (
    <View style={{ gap: space.md }} testID="signin">
      {!sentTo ? (
        <>
          <Field label={t('account.email')} hint={t('account.emailHint')}>
            <Input label={t('account.email')} value={email} onChangeText={setEmail} testID="signin-email" autoCapitalize="none"
              autoComplete="email" keyboardType="email-address" textContentType="emailAddress" inputMode="email" onSubmitEditing={() => void send()} />
          </Field>
          <Button label={t('account.sendCode')} icon={Mail} loading={busy} disabled={!email.trim()} onPress={() => void send()} testID="signin-send" />
        </>
      ) : (
        <>
          <T variant="callout" color="muted">{t('account.codeSent', { email: sentTo })}</T>
          <Field label={t('account.code')}>
            <Input label={t('account.code')} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))} testID="signin-code"
              keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={6} />
          </Field>
          <Button label={t('account.signIn')} loading={busy} disabled={code.length !== 6} onPress={() => void verify()} testID="signin-verify" />
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            <Button small variant="secondary" label={t('account.resend')} onPress={() => void send()} disabled={busy} />
            <Button small variant="ghost" label={t('account.changeEmail')} onPress={() => { setSentTo(null); setError(null); }} disabled={busy} />
          </View>
        </>
      )}
      {error ? <T variant="callout" color="danger" accessibilityLiveRegion="polite" testID="signin-error">{t(`account.errors.${error}`)}</T> : null}
    </View>
  );
}
