/**
 * More → Device role (SPEC 9.1, 11.4). "Child device" turns this phone into a quiet collector (place arrivals and
 * health data) with only a status screen; with Care Team on, what it collects reaches the family's phones.
 * With Care Team on, two more switches (SPEC 6.3, 23.3): "Get heads-ups on this phone" (receive_alerts) and
 * "This phone makes the forecast" (primary_forecaster: creates the heads-ups everyone gets and shares the day's
 * patterns with the portal). The owner's first phone is the forecasting phone; there should be only one.
 */
import { useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Smartphone, Tablet } from 'lucide-react-native';
import { useSession } from '../../src/store/session';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { ChoiceCard } from '../../src/ui/ChoiceCard';
import { RowGroup, Section, ToggleRow } from '../../src/ui/bits';
import { Screen } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/theme';

export default function DeviceRole() {
  const { t } = useTranslation();
  const { accent } = useTheme();
  const role = useSession((s) => s.settings.device_role);
  const settings = useSession((s) => s.settings);
  const update = useSession((s) => s.updateSettings);
  const [pickChild, setPickChild] = useState(false);
  return (
    <Screen back title={t('more.deviceRole')}>
      <ChoiceCard icon={Smartphone} color={accent.episode} title={t('settings.roleCaregiver')} body={t('settings.roleCaregiverBody')}
        selected={role === 'caregiver_device' && !pickChild} onPress={() => setPickChild(false)} />
      <ChoiceCard testID="role-child" icon={Tablet} color={accent.strategy} title={t('settings.roleChild')} body={t('settings.roleChildBody')}
        selected={role === 'child_device' || pickChild} onPress={() => setPickChild(true)} />
      <Card tone="soft"><T variant="callout">{t('settings.roleNote')}</T></Card>
      {pickChild ? <Button testID="role-child-confirm" label={t('settings.roleChildConfirm')} onPress={async () => { await update({ device_role: 'child_device' }); router.replace('/child-device'); }} /> : null}
      {settings.care_team_enabled && settings.member_role !== 'teacher' && !pickChild ? (
        <Section title={t('settings.teamPhone')}>
          <RowGroup>
            <ToggleRow testID="role-receive-alerts" title={t('settings.receiveAlerts')} subtitle={t('settings.receiveAlertsBody')}
              value={settings.receive_alerts} onChange={(v) => void update({ receive_alerts: v })} />
            <ToggleRow testID="role-primary" title={t('settings.primaryForecaster')} subtitle={t('settings.primaryForecasterBody')}
              value={settings.primary_forecaster} onChange={(v) => void update({ primary_forecaster: v })} />
          </RowGroup>
        </Section>
      ) : null}
    </Screen>
  );
}
