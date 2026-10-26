/** How each data source is shown: icon, color, and the i18n keys for its name and plain-language explanation. */
import type { ComponentType } from 'react';
import { Platform } from 'react-native';
import { CalendarDays, CloudSun, HeartPulse, MapPin, Mic, type LucideProps } from 'lucide-react-native';
import type { IntegrationId } from '../integrations/types';
import type { AccentKey } from '../ui/theme';

export interface SourceInfo { icon: ComponentType<LucideProps>; accent: AccentKey; titleKey: string; bodyKey: string }

export const SOURCES: Record<IntegrationId, SourceInfo> = {
  weather: { icon: CloudSun, accent: 'strategy', titleKey: 'sources.weather', bodyKey: 'sources.weatherBody' },
  health: { icon: HeartPulse, accent: 'illness', titleKey: Platform.OS === 'android' ? 'connect.healthConnect' : 'connect.appleHealth', bodyKey: 'sources.healthBody' },
  calendar: { icon: CalendarDays, accent: 'routine', titleKey: 'connect.calendar', bodyKey: 'connect.calendarBody' },
  location: { icon: MapPin, accent: 'place', titleKey: 'connect.location', bodyKey: 'sources.locationBody' },
  sound: { icon: Mic, accent: 'meal', titleKey: 'sources.sound', bodyKey: 'connect.microphoneBody' },
};
