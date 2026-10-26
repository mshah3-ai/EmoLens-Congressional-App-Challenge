/**
 * Child Device mode (SPEC 9.1, 11.4): on a phone or tablet the child carries, EmoLens shows only this status screen and
 * collects place arrivals and health data in the background. No logs, no insights. Sending that data to the parents'
 * phones needs Care Team (Phase 7); until then it stays on this device, and the screen says so.
 */
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import * as Battery from 'expo-battery';
import { useTranslation } from 'react-i18next';
import { BatteryMedium, HeartPulse, MapPin, Users } from 'lucide-react-native';
import { setIntegrationEnabled, openPhoneSettings } from '../src/integrations/enable';
import { useIntegrationStatuses } from '../src/integrations/useStatuses';
import { fmtAgo } from '../src/i18n/format';
import { useDbQuery } from '../src/lib/useDbQuery';
import { useSession } from '../src/store/session';
import { SYNC_STATE_KEYS, useSyncStatus } from '../src/sync/engine';
import { Button } from '../src/ui/Button';
import { Card } from '../src/ui/Card';
import { IconCircle } from '../src/ui/bits';
import { LensMark } from '../src/ui/LensMark';
import { Screen } from '../src/ui/layout';
import { T } from '../src/ui/Text';
import { space, useTheme } from '../src/ui/theme';
import { SOURCES } from '../src/features/sources';

export default function ChildDevice() {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const profile = useSession((s) => s.profile);
  const settings = useSession((s) => s.settings);
  const sync = useSyncStatus();
  const update = useSession((s) => s.updateSettings);
  const statuses = useIntegrationStatuses();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const { data: lowPower } = useDbQuery(() => Battery.isLowPowerModeEnabledAsync().catch(() => false), [], false);

  const row = (id: 'location' | 'health', icon: typeof MapPin, color: string) => {
    const st = statuses?.[id];
    const ok = st?.health === 'ok';
    return (
      <Card style={{ gap: space.sm }}>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <IconCircle icon={icon} color={color} />
          <View style={{ flex: 1 }}>
            <T variant="headline">{t(SOURCES[id].titleKey)}</T>
            <T variant="footnote" color="muted">
              {st ? [t(`sources.status.${st.health}`), st.detailKey ? t(st.detailKey, st.detailParams) : null,
                st.lastSuccessAt ? t('sources.synced', { ago: fmtAgo(st.lastSuccessAt) }) : null].filter(Boolean).join(' · ') : '…'}
            </T>
          </View>
        </View>
        {!ok && st?.health !== 'unavailable' ? (
          st?.health === 'needs_permission'
            ? <Button small variant="secondary" label={t('sources.openSettings')} onPress={openPhoneSettings} />
            : <Button small label={t('connect.turnOn')} onPress={() => { void setIntegrationEnabled(id, true); }} />
        ) : null}
        {id === 'location' ? <Button small variant="ghost" label={t('sources.placesLink')} onPress={() => router.push('/settings/places')} /> : null}
      </Card>
    );
  };

  return (
    <Screen title={t('child.deviceTitle')} subtitle={t('child.deviceSubtitle', { name: profile?.nickname ?? '' })}>
      <View style={{ alignItems: 'center' }}><LensMark size={72} /></View>
      <Card style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
        <IconCircle icon={Users} color={accent.strategy} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headline">{t('child.careTeam')}</T>
          <T variant="callout" color="muted">
            {settings.care_team_enabled ? t('child.careTeamOn', { state: t(SYNC_STATE_KEYS[sync.state]) }) : t('child.careTeamOff')}
          </T>
        </View>
      </Card>
      {row('location', MapPin, accent.place)}
      {row('health', HeartPulse, accent.illness)}
      <Card style={{ flexDirection: 'row', gap: space.md }}>
        <IconCircle icon={BatteryMedium} color={accent.routine} />
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headline">{t('child.batteryTitle')}</T>
          <T variant="callout" color="muted">{Platform.OS === 'android' ? t('child.batteryAndroid') : t('child.batteryIos')}</T>
          {lowPower ? <T variant="callout" color="danger">{t('child.lowPower')}</T> : null}
        </View>
      </Card>
      {confirmLeave
        ? <Button variant="danger" label={t('child.confirmLeave')} onPress={async () => { await update({ device_role: 'caregiver_device' }); router.replace('/'); }} />
        : <Button variant="ghost" label={t('child.leave')} onPress={() => setConfirmLeave(true)} />}
    </Screen>
  );
}
