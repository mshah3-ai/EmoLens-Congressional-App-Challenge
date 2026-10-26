/** More → Alerts & quiet hours, end-of-day check time, early alerts, morning outlook (SPEC 6.3, 15). */
import { useTranslation } from 'react-i18next';
import { AlertFields } from '../../src/features/AlertFields';
import { useSession } from '../../src/store/session';
import { Card } from '../../src/ui/Card';
import { RowGroup, ToggleRow } from '../../src/ui/bits';
import { Screen } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';

export default function AlertSettings() {
  const { t } = useTranslation();
  const settings = useSession((s) => s.settings);
  const update = useSession((s) => s.updateSettings);
  return (
    <Screen back title={t('more.alerts')}>
      <Card tone="soft"><T variant="callout">{t('settings.alertsNote')}</T></Card>
      <AlertFields value={settings} onChange={(p) => void update(p)} />
      <RowGroup>
        <ToggleRow title={t('settings.earlyAlerts')} subtitle={t('settings.earlyAlertsHint')} value={settings.early_alerts_enabled} onChange={(v) => void update({ early_alerts_enabled: v })} />
        <ToggleRow title={t('settings.morningOutlook')} subtitle={t('settings.morningOutlookHint')} value={settings.morning_outlook} onChange={(v) => void update({ morning_outlook: v })} />
      </RowGroup>
    </Screen>
  );
}
