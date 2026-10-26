/**
 * Team (SPEC 9.8).
 *  - No account: what Care Team is, and "Create account to invite your team" (More → Account).
 *  - Account, Care Team off (owner): what syncs and what never leaves the phone, and "Turn on Care Team" (SPEC 23.1).
 *  - Care Team on: sync status + "Sync now", your name, the members with their roles (the owner can invite and
 *    remove), share links (owner), and the activity feed: the last 50 entries by others.
 */
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  CloudOff, GraduationCap, HeartHandshake, Link2, RefreshCw, ShieldCheck, Stethoscope, UserPlus, Users,
} from 'lucide-react-native';
import { cloudApi } from '../../../src/cloud/current';
import { fmtDayTime } from '../../../src/i18n/format';
import { useDbQuery } from '../../../src/lib/useDbQuery';
import { turnOnCareTeam } from '../../../src/sync/enable';
import { SYNC_STATE_KEYS, requestSync, syncNow, useSyncStatus } from '../../../src/sync/engine';
import { activityFeed, teamMembers, type TeamRow } from '../../../src/sync/team';
import { ShareLinks } from '../../../src/features/cloud/ShareLinks';
import { useSession } from '../../../src/store/session';
import { Screen } from '../../../src/ui/layout';
import { Button } from '../../../src/ui/Button';
import { Card } from '../../../src/ui/Card';
import { Field, Input } from '../../../src/ui/Field';
import { EmptyState, IconCircle, ListRow, Pill, RowGroup, Section } from '../../../src/ui/bits';
import { T } from '../../../src/ui/Text';
import { toast } from '../../../src/ui/Toast';
import { space, useTheme } from '../../../src/ui/theme';

export default function Team() {
  const { t } = useTranslation();
  const settings = useSession((s) => s.settings);
  const isDemo = useSession((s) => s.isDemo);
  if (isDemo) return <Screen title={t('team.title')}><Card tone="soft"><T variant="callout">{t('team.demoNote')}</T></Card><Roles /></Screen>;
  if (!settings.account_user_id) return <NoAccount />;
  if (!settings.care_team_enabled) return <TurnOn />;
  return <CareTeam />;
}

function Roles() {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const roles = [
    { icon: HeartHandshake, color: accent.illness, title: t('team.roles.caregiver'), body: t('team.roles.caregiverBody') },
    { icon: GraduationCap, color: accent.routine, title: t('team.roles.teacher'), body: t('team.roles.teacherBody') },
    { icon: Stethoscope, color: accent.med, title: t('team.roles.clinician'), body: t('team.roles.clinicianBody') },
  ];
  return (
    <View style={{ gap: space.md }}>
      <T variant="title" accessibilityRole="header">{t('team.whoTitle')}</T>
      {roles.map((r) => (
        <Card key={r.title} style={{ flexDirection: 'row', gap: space.md }}>
          <IconCircle icon={r.icon} color={r.color} />
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="headline">{r.title}</T>
            <T variant="callout" color="muted">{r.body}</T>
          </View>
        </Card>
      ))}
    </View>
  );
}

function NoAccount() {
  const { t } = useTranslation();
  const { accent } = useTheme();
  return (
    <Screen title={t('team.title')}>
      <Card style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <IconCircle icon={ShieldCheck} color={accent.place} />
          <T variant="headline" style={{ flex: 1 }}>{t('team.localTitle')}</T>
        </View>
        <T variant="body" color="muted">{t('team.localBody')}</T>
        <Button label={t('team.createAccount')} icon={Users} onPress={() => router.push('/settings/account')} testID="team-create-account" />
      </Card>
      <Roles />
    </Screen>
  );
}

function TurnOn() {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const { repo, settings, reload, child } = useSession();
  const [busy, setBusy] = useState(false);
  const turnOn = () => Alert.alert(t('team.turnOnConfirmTitle'), t('team.turnOnConfirmBody', { name: child?.nickname ?? '' }), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('team.turnOn'), onPress: () => void (async () => {
      if (!repo || !settings.account_user_id) return;
      setBusy(true);
      try {
        await turnOnCareTeam(repo.db, settings.account_user_id);
        await reload();
        await syncNow();
        toast(t('team.turnedOn'));
      } finally { setBusy(false); }
    })() },
  ]);
  return (
    <Screen title={t('team.title')}>
      <Card style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <IconCircle icon={Users} color={accent.strategy} />
          <T variant="headline" style={{ flex: 1 }}>{t('team.turnOnTitle')}</T>
        </View>
        <T variant="body" color="muted">{t('team.turnOnBody')}</T>
        <T variant="headline">{t('team.syncsTitle')}</T>
        <T variant="callout">{t('team.syncsList')}</T>
        <T variant="headline">{t('team.neverTitle')}</T>
        <T variant="callout">{t('team.neverList')}</T>
        <Button label={t('team.turnOn')} icon={Users} loading={busy} onPress={turnOn} testID="team-turn-on" />
      </Card>
      <Roles />
    </Screen>
  );
}

function CareTeam() {
  const { t } = useTranslation();
  const { c, accent } = useTheme();
  const { repo, child, settings, dataVersion } = useSession();
  const status = useSyncStatus();
  const me = settings.account_user_id as string;
  const isOwner = settings.member_role === 'owner';
  const { data } = useDbQuery(async () => repo && child
    ? { members: await teamMembers(repo.db, child.id), feed: await activityFeed(repo.db, child.id, me) }
    : { members: [] as TeamRow[], feed: [] }, [dataVersion, status.lastSyncAt], { members: [] as TeamRow[], feed: [] });
  const myName = data.members.find((m) => m.user_id === me)?.display_name ?? '';
  const [name, setName] = useState<string | null>(null);

  const saveName = async () => {
    const api = cloudApi();
    if (!api || name == null) return;
    const res = await api.setDisplayName(me, name.trim().slice(0, 80));
    if (res.error) { toast(t('team.nameFailed')); return; }
    setName(null);
    toast(t('team.nameSaved'));
    requestSync(0);
  };

  const remove = (m: TeamRow) => Alert.alert(t('team.removeTitle', { name: m.display_name ?? t(`team.role.${m.role}`) }), t('team.removeBody'), [
    { text: t('common.cancel'), style: 'cancel' },
    { text: t('team.remove'), style: 'destructive', onPress: () => void (async () => {
      const api = cloudApi();
      if (!api || !child) return;
      const res = await api.call('member-remove', { child_id: child.id, user_id: m.user_id });
      toast(res.error ? t('team.removeFailed') : t('team.removed'));
      requestSync(0);
    })() },
  ]);

  const kindLabel = (k: string) => t(`team.activity.${k}`);
  return (
    <Screen title={t('team.title')}>
      {status.attempts >= 10 || status.state === 'error' ? (
        <Card tone="soft" testID="sync-error-banner" style={{ flexDirection: 'row', gap: space.sm, borderColor: c.danger, borderWidth: 1 }}>
          <CloudOff color={c.danger} size={20} />
          <T variant="callout" style={{ flex: 1 }}>{t('team.sync.errorBanner')}</T>
        </Card>
      ) : null}
      <Card style={{ gap: space.sm }} testID="sync-status">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <RefreshCw color={c.primary} size={20} />
          <T variant="headline" style={{ flex: 1 }}>{t(SYNC_STATE_KEYS[status.state])}</T>
        </View>
        <T variant="footnote" color="muted">
          {status.lastSyncAt ? t('team.sync.last', { time: fmtDayTime(status.lastSyncAt, child?.home_tz ?? 'UTC') }) : t('team.sync.never')}
          {status.pending ? ` · ${t('team.sync.pending', { count: status.pending })}` : ''}
        </T>
        <Button small variant="secondary" label={t('team.sync.now')} loading={status.state === 'syncing'} onPress={() => void syncNow()} testID="sync-now" />
      </Card>

      <Section title={t('team.yourName')}>
        <Field label={t('team.yourName')} hint={t('team.yourNameHint')}>
          <Input label={t('team.yourName')} value={name ?? myName} onChangeText={setName} testID="team-name" maxLength={80}
            onSubmitEditing={() => void saveName()} returnKeyType="done" />
        </Field>
        {name != null && name.trim() !== myName ? <Button small label={t('common.save')} onPress={() => void saveName()} testID="team-name-save" /> : null}
      </Section>

      <Section title={t('team.members')} action={isOwner ? <Button small label={t('team.invite')} icon={UserPlus} onPress={() => router.push('/team/invite')} testID="team-invite" /> : undefined}>
        <RowGroup>
          {data.members.map((m) => (
            <ListRow key={m.user_id} testID={`member-${m.role}`}
              title={m.user_id === me ? (m.display_name ? t('team.youNamed', { name: m.display_name }) : t('team.youAlone')) : m.display_name ?? t('team.noName')}
              right={<View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                <Pill label={t(`team.role.${m.role}`)} color={m.role === 'owner' ? accent.strategy : undefined} />
                {isOwner && m.role !== 'owner' ? <Button small variant="ghost" label={t('team.remove')} onPress={() => remove(m)} testID={`remove-${m.role}`} /> : null}
              </View>} />
          ))}
        </RowGroup>
      </Section>

      {isOwner ? <ShareLinks /> : null}

      <Section title={t('team.activityTitle')}>
        {data.feed.length ? (
          <RowGroup>
            {data.feed.map((f, i) => (
              <ListRow key={`${f.at}-${i}`} title={t('team.activity.line', { name: f.name ?? t(`team.role.${f.role ?? 'caregiver'}`), what: kindLabel(f.kind) })}
                subtitle={fmtDayTime(f.at, child?.home_tz ?? 'UTC')} />
            ))}
          </RowGroup>
        ) : <EmptyState icon={Link2} title={t('team.activityEmpty')} />}
      </Section>
    </Screen>
  );
}
