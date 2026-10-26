/** More (SPEC 9.9): profile, settings (including AI features, Phase 8), demo mode, about. Rows for later phases are shown with a "Soon" label. */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Bell, BookOpen, Bot, CalendarClock, CircleUserRound, Database, FileText, FlaskConical, Info, Languages, MapPin, Moon,
  Pill as PillIcon, ScrollText, ShieldCheck, Smartphone, UserRound,
} from 'lucide-react-native';
import { useSession } from '../../../src/store/session';
import { Screen } from '../../../src/ui/layout';
import { ListRow, Pill, RowGroup } from '../../../src/ui/bits';
import { T } from '../../../src/ui/Text';
import { space, useTheme } from '../../../src/ui/theme';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <T variant="footnote" color="muted" weight="600" accessibilityRole="header" style={{ textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: space.xs }}>{title}</T>
      <RowGroup>{children}</RowGroup>
    </View>
  );
}

export default function More() {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const isDemo = useSession((s) => s.isDemo);
  const settings = useSession((s) => s.settings);
  // A teacher's phone only has what teachers may see (SPEC 7.1): no medications, places, data sources or reports.
  const teacher = settings.member_role === 'teacher' && settings.care_team_enabled;
  const nickname = useSession((s) => s.profile?.nickname ?? '');
  const go = (path: string) => () => router.push(path as never);
  return (
    <Screen title={t('more.title')}>
      <Group title={t('more.child', { name: nickname })}>
        <ListRow icon={UserRound} iconColor={accent.episode} title={t('more.childProfile')} onPress={go('/settings/child')} />
        {teacher ? null : <ListRow icon={PillIcon} iconColor={accent.med} title={t('more.medications')} onPress={go('/settings/medications')} />}
        {teacher ? null : <ListRow icon={MapPin} iconColor={accent.place} title={t('more.places')} onPress={go('/settings/places')} />}
        {teacher ? null : <ListRow testID="more-data-sources" icon={Database} iconColor={accent.strategy} title={t('more.dataSources')} subtitle={t('more.dataSourcesSub')} onPress={go('/settings/data-sources')} />}
      </Group>
      <Group title={t('more.app')}>
        <ListRow icon={Bell} iconColor={accent.routine} title={t('more.alerts')} onPress={go('/settings/alerts')} />
        <ListRow testID="more-eod" icon={Moon} iconColor={accent.sleep} title={t('more.eod')} subtitle={t('more.eodSub')} onPress={go('/end-of-day/today')} />
        <ListRow testID="more-digests" icon={CalendarClock} iconColor={accent.routine} title={t('more.digests')} onPress={go('/settings/digests')} />
        {teacher ? null : <ListRow testID="more-reports" icon={FileText} iconColor={accent.note} title={t('more.reports')} subtitle={t('more.reportsSub')} onPress={go('/reports')} />}
        <ListRow testID="more-account" icon={CircleUserRound} iconColor={accent.strategy} title={t('more.account')}
          subtitle={settings.account_email ?? t('more.accountSub')} onPress={go('/settings/account')} />
        <ListRow testID="more-ai" icon={Bot} iconColor={accent.strategy} title={t('more.ai')} subtitle={t('more.aiSub')}
          right={<Pill label={settings.cloud_ai_enabled ? t('more.aiOn') : t('more.aiOff')} />} onPress={go('/settings/ai')} />
        <ListRow icon={ShieldCheck} iconColor={accent.place} title={t('more.privacy')} onPress={go('/settings/privacy')} />
        <ListRow icon={Languages} iconColor={accent.strategy} title={t('more.language')} onPress={go('/settings/language')} />
        <ListRow icon={Smartphone} iconColor={accent.note} title={t('more.deviceRole')} onPress={go('/settings/device-role')} />
      </Group>
      <Group title={t('more.demoGroup')}>
        <ListRow testID="more-demo" icon={FlaskConical} iconColor={accent.routine} title={isDemo ? t('more.demoExit') : t('more.demo')} subtitle={t('more.demoSub')} onPress={go('/demo')} />
      </Group>
      <Group title={t('more.aboutGroup')}>
        <ListRow icon={Info} iconColor={accent.note} title={t('more.about')} onPress={go('/settings/about')} />
        <ListRow icon={ScrollText} iconColor={accent.note} title={t('more.disclosure')} onPress={go('/settings/disclosures')} />
        <ListRow icon={BookOpen} iconColor={accent.note} title={t('more.howItWorks')} onPress={go('/settings/how')} />
      </Group>
    </Screen>
  );
}
