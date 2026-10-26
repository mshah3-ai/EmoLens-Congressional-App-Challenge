/**
 * More → Account (SPEC 8 step 3, 27.4).
 *  - No account: sign in or create one with an emailed code (needed for Care Team, clinician sharing and, later, AI).
 *  - Signed in: who you are and your role; Sign out; Delete account (type DELETE), which removes everything you own in
 *    the cloud and then everything on this phone.
 */
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LogOut, Trash, UserRound } from 'lucide-react-native';
import { deleteCloudAccount, rememberSignIn, signOutEffect, signOutKeepingData } from '../../src/cloud/account';
import { cloudApi } from '../../src/cloud/current';
import { SignIn } from '../../src/features/cloud/SignIn';
import { useSession } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { Field, Input } from '../../src/ui/Field';
import { IconCircle, Section } from '../../src/ui/bits';
import { Screen, goBack } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { toast } from '../../src/ui/Toast';
import { space, useTheme } from '../../src/ui/theme';

export default function Account() {
  const { t } = useTranslation();
  const { c, accent } = useTheme();
  const { repo, settings, reload, deleteAllData, child, isDemo } = useSession();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  if (isDemo) return <Screen back title={t('account.title')}><Card tone="soft"><T variant="callout">{t('account.demo')}</T></Card></Screen>;

  if (!settings.account_user_id) {
    return (
      <Screen back title={t('account.title')} testID="account-screen">
        <Card style={{ gap: space.md }}>
          <T variant="body">{t('account.why')}</T>
          <SignIn onSignedIn={async (a) => {
            if (!repo) return;
            await rememberSignIn(repo, a.userId, a.email);
            await reload();
            toast(t('account.signedIn'));
            goBack();
          }} />
        </Card>
        <T variant="footnote" color="muted">{t('account.adults')}</T>
      </Screen>
    );
  }

  const effect = signOutEffect(settings);
  const signOut = () => Alert.alert(t('account.signOutTitle'),
    t(effect === 'delete' ? 'account.signOutDelete' : 'account.signOutKeep', { name: child?.nickname ?? '' }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('account.signOut'), style: effect === 'delete' ? 'destructive' : 'default', onPress: () => void (async () => {
        if (!repo) return;
        setBusy(true);
        await signOutKeepingData(repo.db, repo);
        if (effect === 'delete') await deleteAllData();
        else { await reload(); goBack(); }
      })() },
    ]);

  const deleteAccount = async () => {
    const api = cloudApi();
    if (!api) return;
    setBusy(true);
    const err = await deleteCloudAccount(api);
    if (err) { setBusy(false); toast(t('account.deleteFailed')); return; }
    await deleteAllData();
  };

  return (
    <Screen back title={t('account.title')} testID="account-screen">
      <Card style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
        <IconCircle icon={UserRound} color={accent.strategy} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headline">{settings.account_email}</T>
          <T variant="footnote" color="muted">
            {settings.member_role ? t('account.roleFor', { role: t(`team.role.${settings.member_role}`), name: child?.nickname ?? '' }) : t('account.noTeam')}
          </T>
        </View>
      </Card>
      <Button variant="secondary" icon={LogOut} label={t('account.signOut')} loading={busy} onPress={signOut} testID="account-sign-out" />
      <Section title={t('account.deleteTitle')}>
        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
            <IconCircle icon={Trash} color={c.danger} />
            <T variant="callout" style={{ flex: 1 }}>{t('account.deleteBody')}</T>
          </View>
          <Field label={t('settings.deleteType')}>
            <Input testID="account-delete-confirm" label={t('settings.deleteType')} value={confirm} onChangeText={setConfirm} autoCapitalize="characters" autoCorrect={false} />
          </Field>
          <Button variant="danger" icon={Trash} label={t('account.deleteButton')} loading={busy} disabled={confirm.trim() !== 'DELETE'}
            onPress={() => void deleteAccount()} testID="account-delete" />
        </Card>
      </Section>
    </Screen>
  );
}
