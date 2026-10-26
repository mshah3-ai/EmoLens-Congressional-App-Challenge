/** Alert preferences, shared by onboarding step 12 and More → Alerts & quiet hours. */
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Settings } from '../db/repo/settings';
import { Card } from '../ui/Card';
import { Field } from '../ui/Field';
import { Segmented } from '../ui/Segmented';
import { ClockField } from '../ui/TimeField';
import { Stepper } from '../ui/bits';
import { T } from '../ui/Text';
import { space } from '../ui/theme';

type AlertPrefs = Pick<Settings, 'alert_sensitivity' | 'max_alerts_per_day' | 'quiet_hours' | 'end_of_day_time'>;

export function AlertFields({ value, onChange }: { value: AlertPrefs; onChange: (patch: Partial<AlertPrefs>) => void }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: space.xl }}>
      <Field label={t('alertsStep.sensitivity')}>
        <View style={{ gap: space.sm }}>
          <Segmented<Settings['alert_sensitivity']> value={value.alert_sensitivity} onChange={(alert_sensitivity) => onChange({ alert_sensitivity })}
            options={[{ value: 'fewer', label: t('alertsStep.fewer') }, { value: 'balanced', label: t('alertsStep.balanced') }, { value: 'more', label: t('alertsStep.more') }]} />
          <Card tone="soft"><T variant="callout">{t(`alertsStep.example.${value.alert_sensitivity}`)}</T></Card>
        </View>
      </Field>
      <Field label={t('alertsStep.maxPerDay')}>
        <Stepper label={t('alertsStep.maxPerDay')} value={value.max_alerts_per_day} min={1} max={6} onChange={(max_alerts_per_day) => onChange({ max_alerts_per_day })} />
      </Field>
      <Field label={t('alertsStep.quietHours')} hint={t('alertsStep.quietHoursHint')}>
        <View style={{ gap: space.sm }}>
          <ClockField label={t('alertsStep.quietFrom')} value={value.quiet_hours.start} onChange={(start) => onChange({ quiet_hours: { ...value.quiet_hours, start } })} />
          <ClockField label={t('alertsStep.quietTo')} value={value.quiet_hours.end} onChange={(end) => onChange({ quiet_hours: { ...value.quiet_hours, end } })} />
        </View>
      </Field>
      <Field label={t('alertsStep.eod')} hint={t('alertsStep.eodHint')}>
        <ClockField label={t('alertsStep.eod')} value={value.end_of_day_time} onChange={(end_of_day_time) => onChange({ end_of_day_time })} />
      </Field>
    </View>
  );
}
