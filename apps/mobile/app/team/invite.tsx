/**
 * Invite someone to the care team (SPEC 23.2): choose their role, get an 8-character code (valid 7 days, works once)
 * and send it with the share sheet. The message says how to join; clinicians also get the portal's address.
 * Before the code is made, a plain-language preview lists what the chosen role will and will never see (ROLE_ACCESS).
 */
import { useState } from 'react';
import { Share, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Check, GraduationCap, HeartHandshake, Send, Stethoscope, X } from 'lucide-react-native';
import { ROLE_ACCESS, type InvitedRole } from '@emolens/shared';
import { PORTAL_URL } from '../../src/cloud/client';
import { cloudApi } from '../../src/cloud/current';
import { dateYearAt } from '@emolens/reports';
import { useReady, useSession } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { ChoiceCard } from '../../src/ui/ChoiceCard';
import { Sheet } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { space, useTheme } from '../../src/ui/theme';

type Role = InvitedRole;

/** "ABCD2345" -> "ABCD 2345", easier to read aloud. */
export const spaced = (code: string) => `${code.slice(0, 4)} ${code.slice(4)}`;

export default function Invite() {
  const { t } = useTranslation();
  const { accent, c } = useTheme();
  const { profile } = useReady();
  const lang = useSession((s) => s.settings.language);
  const [role, setRole] = useState<Role>('caregiver');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [invite, setInvite] = useState<{ code: string; role: Role; expires_at: string } | null>(null);

  const create = async () => {
    const api = cloudApi();
    if (!api) return;
    setBusy(true); setError(false);
    const r = await api.call<{ code: string; role: Role; expires_at: string }>('invite-create', { child_id: profile.id, role });
    setBusy(false);
    if (r.error) setError(true); else setInvite(r.data);
  };

  if (invite) {
    const message = t('invite.message', { name: profile.nickname, code: invite.code })
      + (invite.role === 'clinician' && PORTAL_URL ? ` ${t('invite.messagePortal', { url: PORTAL_URL })}` : '');
    return (
      <Sheet title={t('invite.readyTitle')} testID="invite-ready">
        <Card style={{ gap: space.md, alignItems: 'center' }}>
          <T variant="callout" color="muted">{t('invite.codeFor', { role: t(`team.role.${invite.role}`) })}</T>
          <T variant="display" selectable testID="invite-code" accessibilityLabel={invite.code.split('').join(' ')}>{spaced(invite.code)}</T>
          <T variant="footnote" color="muted">{t('invite.expires', { date: dateYearAt(lang, Date.parse(invite.expires_at), profile.homeTz) })}</T>
          <Button label={t('invite.send')} icon={Send} onPress={() => void Share.share({ message })} testID="invite-send" />
        </Card>
        <T variant="footnote" color="muted">{t(`invite.roleNote.${invite.role}`)}</T>
      </Sheet>
    );
  }

  return (
    <Sheet title={t('invite.title')} testID="invite-new"
      footer={<Button label={t('invite.createFor', { role: t(`team.role.${role}`) })} loading={busy} onPress={() => void create()} testID="invite-submit" />}>
      <View style={{ gap: space.md }}>
        <ChoiceCard icon={HeartHandshake} color={accent.illness} title={t('team.roles.caregiver')} body={t('team.roles.caregiverBody')}
          selected={role === 'caregiver'} onPress={() => setRole('caregiver')} testID="invite-caregiver" />
        <ChoiceCard icon={GraduationCap} color={accent.routine} title={t('team.roles.teacher')} body={t('team.roles.teacherBody')}
          selected={role === 'teacher'} onPress={() => setRole('teacher')} testID="invite-teacher" />
        <ChoiceCard icon={Stethoscope} color={accent.med} title={t('team.roles.clinician')} body={t('team.roles.clinicianBody')}
          selected={role === 'clinician'} onPress={() => setRole('clinician')} testID="invite-clinician" />
      </View>
      <Card style={{ gap: space.sm }} testID={`invite-preview-${role}`}>
        <T variant="headline" accessibilityRole="header">{t('invite.previewSees', { role: t(`team.role.${role}`) })}</T>
        {ROLE_ACCESS[role].sees.map((k) => (
          <View key={k} style={{ flexDirection: 'row', gap: space.sm }} accessible>
            <Check size={18} color={c.riskLow} />
            <T variant="callout" style={{ flex: 1 }}>{t(`invite.access.${k}`, { name: profile.nickname })}</T>
          </View>
        ))}
        <T variant="headline" accessibilityRole="header" style={{ marginTop: space.sm }}>{t('invite.previewNever')}</T>
        {ROLE_ACCESS[role].never.map((k) => (
          <View key={k} style={{ flexDirection: 'row', gap: space.sm }} accessible>
            <X size={18} color={c.danger} />
            <T variant="callout" style={{ flex: 1 }}>{t(`invite.access.${k}`, { name: profile.nickname })}</T>
          </View>
        ))}
        <T variant="footnote" color="muted" style={{ marginTop: space.sm }}>{t('invite.previewFooter')}</T>
      </Card>
      {error ? <T variant="callout" color="danger" testID="invite-error">{t('invite.failed')}</T> : null}
    </Sheet>
  );
}
