/**
 * Step 11: Connect data (SPEC 8.11). Every source is optional and explained on its card before the phone's permission
 * prompt appears. Weather needs no permission (it uses the Home location from step 10). Fitbit's old API is shutting
 * down (DECISIONS #40); the room sensor is future work (DECISIONS #138). Everything can be changed later in More → Data sources.
 */
import { useState, type ComponentType, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Bell, CalendarDays, CircleCheck, HeartPulse, MapPin, Mic, type LucideProps } from 'lucide-react-native';
import { calendarIntegration, listPhoneCalendars, type CalendarChoice } from '../../src/integrations/calendar';
import { healthProvider } from '../../src/integrations/health';
import { requestLocation } from '../../src/integrations/location';
import { soundIntegration } from '../../src/integrations/sound';
import type { IntegrationId } from '../../src/integrations/types';
import { OnboardingFrame } from '../../src/features/OnboardingFrame';
import { requestNotificationPermission } from '../../src/notifications';
import { toggle, useOnboarding } from '../../src/store/onboarding';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { Chip, ChipGroup } from '../../src/ui/Chip';
import { IconCircle } from '../../src/ui/bits';
import { T } from '../../src/ui/Text';
import { space, useTheme } from '../../src/ui/theme';

function SourceCard({ icon, color, title, body, action, children }: {
  icon: ComponentType<LucideProps>; color: string; title: string; body: string; action: ReactNode; children?: ReactNode;
}) {
  return (
    <Card style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
        <IconCircle icon={icon} color={color} />
        <View style={{ flex: 1, gap: space.xs }}>
          <T variant="headline">{title}</T>
          <T variant="callout" color="muted">{body}</T>
          <View style={{ flexDirection: 'row', marginTop: space.xs, flexWrap: 'wrap', gap: space.sm }}>{action}</View>
        </View>
      </View>
      {children}
    </Card>
  );
}

export default function Connect() {
  const { t } = useTranslation();
  const { c, accent } = useTheme();
  const notificationsOn = useOnboarding((s) => s.notificationsOn);
  const integrations = useOnboarding((s) => s.draft.integrations);
  const calendarIds = useOnboarding((s) => s.draft.calendarIds);
  const set = useOnboarding((s) => s.set);
  const patch = useOnboarding((s) => s.patch);
  const [denied, setDenied] = useState<Partial<Record<IntegrationId, boolean>>>({});
  const [whileUsingOnly, setWhileUsingOnly] = useState(false);
  const [calendars, setCalendars] = useState<CalendarChoice[]>([]);
  const next = () => router.push('/(onboarding)/alerts');

  const on = <View style={{ flexDirection: 'row', gap: space.xs, alignItems: 'center' }}><CircleCheck size={18} color={c.riskLow} /><T variant="callout" weight="600">{t('connect.on')}</T></View>;
  const enable = (id: IntegrationId, granted: boolean) => {
    set({ integrations: { ...integrations, [id]: granted } });
    setDenied((d) => ({ ...d, [id]: !granted }));
  };
  const action = (id: IntegrationId, ask: () => Promise<boolean>) => (integrations[id] ? on : (
    <>
      <Button small label={t('connect.turnOn')} onPress={async () => enable(id, await ask().catch(() => false))} />
      {denied[id] ? <T variant="footnote" color="muted">{t('connect.deniedLater')}</T> : null}
    </>
  ));

  const askCalendar = async () => {
    const granted = await calendarIntegration.requestPermission();
    if (granted) setCalendars(await listPhoneCalendars().catch(() => []));
    return granted;
  };
  const askLocation = async () => {
    const r = await requestLocation();
    setWhileUsingOnly(r.foreground && !r.background);
    return r.foreground;
  };

  return (
    <OnboardingFrame step={11} title={t('connect.title')} subtitle={t('connect.subtitle')} onNext={next} onSkip={next}>
      <View style={{ gap: space.md }}>
        <SourceCard icon={Bell} color={accent.episode} title={t('connect.notifications')} body={t('connect.notificationsBody')}
          action={notificationsOn ? on : <Button small label={t('connect.turnOn')} onPress={async () => patch({ notificationsOn: await requestNotificationPermission() })} />} />
        <SourceCard icon={HeartPulse} color={accent.illness} title={Platform.OS === 'android' ? t('connect.healthConnect') : t('connect.appleHealth')}
          body={t('connect.healthBody')} action={action('health', async () => (await healthProvider.isAvailable()) && healthProvider.requestPermission())} />
        <SourceCard icon={CalendarDays} color={accent.routine} title={t('connect.calendar')} body={t('connect.calendarBody')} action={action('calendar', askCalendar)}>
          {integrations.calendar && calendars.length ? (
            <View style={{ gap: space.xs }}>
              <T variant="footnote" weight="600">{t('calendars.which')}</T>
              <ChipGroup>
                {calendars.map((cal) => <Chip key={cal.id} label={cal.title} selected={calendarIds.includes(cal.id)} onPress={() => set({ calendarIds: toggle(calendarIds, cal.id) })} />)}
              </ChipGroup>
            </View>
          ) : null}
        </SourceCard>
        <SourceCard icon={MapPin} color={accent.place} title={t('connect.location')} body={t('connect.locationAlways')} action={action('location', askLocation)}>
          {integrations.location && whileUsingOnly ? <T variant="footnote" color="muted">{t('sources.whileUsingExplain')}</T> : null}
        </SourceCard>
        <SourceCard icon={Mic} color={accent.meal} title={t('connect.microphone')} body={t('connect.microphoneBody')} action={action('sound', () => soundIntegration.requestPermission())} />
      </View>
    </OnboardingFrame>
  );
}
