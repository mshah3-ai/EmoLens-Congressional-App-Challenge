/**
 * More → Data sources (SPEC 11): every automatic source with what it reads, its status and last sync, and an on/off
 * switch. Switching on shows the OS permission prompt only after the explanation on the card (SPEC 8.11).
 */
import { useState } from 'react';
import { Switch, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react-native';
import { SOURCES } from '../../src/features/sources';
import { refreshNow } from '../../src/integrations/appRefresh';
import { openPhoneSettings, setIntegrationEnabled } from '../../src/integrations/enable';
import { importSummaryText } from '../../src/integrations/importSummary';
import { INTEGRATIONS } from '../../src/integrations/registry';
import type { IntegrationId, IntegrationStatus } from '../../src/integrations/types';
import { useIntegrationStatuses } from '../../src/integrations/useStatuses';
import { fmtAgo } from '../../src/i18n/format';
import { useSession } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { toast } from '../../src/ui/Toast';
import { IconCircle } from '../../src/ui/bits';
import { Screen } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { space, useTheme } from '../../src/ui/theme';

function StatusLine({ status }: { status: IntegrationStatus }) {
  const { t } = useTranslation();
  const { c } = useTheme();
  const color = { ok: c.riskLow, limited: c.riskModerate, off: c.textMuted, unavailable: c.textMuted, needs_permission: c.riskModerate, needs_setup: c.riskModerate, no_data: c.riskModerate, error: c.danger }[status.health];
  const parts = [t(`sources.status.${status.health}`)];
  if (status.detailKey && status.health !== 'off') parts.push(t(status.detailKey, status.detailParams));
  if (status.health === 'ok' && status.lastSuccessAt) parts.push(t('sources.synced', { ago: fmtAgo(status.lastSuccessAt) }));
  return (
    <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginTop: 5 }} />
      <T variant="footnote" style={{ flex: 1 }}>{parts.join(' · ')}</T>
    </View>
  );
}

export default function DataSources() {
  const { t } = useTranslation();
  const { c, accent } = useTheme();
  const statuses = useIntegrationStatuses();
  const settings = useSession((s) => s.settings);
  const update = useSession((s) => s.updateSettings);
  const [busy, setBusy] = useState<IntegrationId | 'all' | null>(null);

  const name = (id: IntegrationId) => t(SOURCES[id].titleKey);
  const toggle = async (id: IntegrationId, on: boolean) => {
    setBusy(id);
    const r = await setIntegrationEnabled(id, on);
    setBusy(null);
    // Calendar reads nothing until calendars are chosen, so go straight to the picker once access is granted.
    if (r.state === 'on' && id === 'calendar' && !useSession.getState().settings.calendar_ids.length) {
      router.push('/settings/calendars');
      return;
    }
    if (r.state === 'denied') toast(t('sources.denied'), { label: t('sources.openSettings'), onPress: openPhoneSettings });
    else if (r.report) toast(importSummaryText(r.report, t, name));
  };
  const syncAll = async () => {
    setBusy('all');
    const report = await refreshNow({ force: true });
    setBusy(null);
    if (report) toast(importSummaryText(report, t, name));
  };

  const extra = (id: IntegrationId) => {
    switch (id) {
      case 'weather': return <Button small variant="ghost" label={t(settings.weather_lat != null ? 'sources.changeHome' : 'sources.setHome')}
        onPress={() => router.push('/settings/places')} />;
      case 'calendar': return (
        <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
          <Button small variant="secondary" label={t('sources.chooseCalendars')} onPress={() => router.push('/settings/calendars')} />
          <Button small variant="ghost" label={t('sources.reviewEvents')} onPress={() => router.push('/settings/calendar-events')} />
        </View>
      );
      case 'location': return <Button small variant="ghost" label={t('sources.placesLink')} onPress={() => router.push('/settings/places')} />;
      case 'sound': return (
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <T variant="callout" style={{ flex: 1 }}>{t('sources.soundOnEpisode')}</T>
            <Switch accessibilityLabel={t('sources.soundOnEpisode')} value={settings.sound_check_on_episode}
              onValueChange={(v) => void update({ sound_check_on_episode: v })} trackColor={{ true: c.primary, false: c.border }} thumbColor="#FFFFFF" />
          </View>
          <Button small variant="secondary" label={t('sources.runSoundCheck')} onPress={() => router.push('/log/sound')} />
        </View>
      );
      case 'health': return <T variant="footnote" color="muted">{t('sources.healthWhose')}</T>;
    }
  };

  return (
    <Screen back title={t('more.dataSources')} subtitle={t('sources.subtitle')}
      right={<Button small variant="ghost" icon={RefreshCw} label={t('sources.syncNow')} loading={busy === 'all'}
        onPress={() => void syncAll()} />}>
      {INTEGRATIONS.map((i) => {
        const info = SOURCES[i.id];
        const status = statuses?.[i.id];
        const on = !!settings.integration_state[i.id]?.enabled;
        const unavailable = status?.health === 'unavailable';
        return (
          <Card key={i.id} style={{ gap: space.md }}>
            <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
              <IconCircle icon={info.icon} color={unavailable ? c.textMuted : accent[info.accent]} />
              <T variant="headline" style={{ flex: 1 }}>{t(info.titleKey)}</T>
              <Switch testID={`source-${i.id}`} accessibilityLabel={t(info.titleKey)} value={on} disabled={unavailable || busy === i.id}
                onValueChange={(v) => void toggle(i.id, v)} trackColor={{ true: c.primary, false: c.border }} thumbColor="#FFFFFF" />
            </View>
            <T variant="callout" color="muted">{t(info.bodyKey)}</T>
            {status ? <StatusLine status={status} /> : null}
            {status?.health === 'needs_permission' ? (
              <Button small variant="secondary" label={t('sources.allowAccess')} loading={busy === i.id} onPress={() => void toggle(i.id, true)} />
            ) : null}
            {status?.health === 'no_data' ? (
              <View style={{ gap: space.sm }}>
                <T variant="footnote" color="muted">{t(i.id === 'health' ? 'sources.healthNoData' : 'sources.noDataHint')}</T>
                <Button small variant="secondary" label={t('sources.openSettings')} onPress={openPhoneSettings} />
              </View>
            ) : null}
            {on && !unavailable ? extra(i.id) : null}
          </Card>
        );
      })}
    </Screen>
  );
}
