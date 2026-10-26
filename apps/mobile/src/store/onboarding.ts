/** Onboarding answers kept in memory until "Go to Today" saves them all at once (db/repo/onboarding.ts). */
import { create } from 'zustand';
import type { OnboardingDraft } from '../db/repo/onboarding';
import { deviceLanguage, deviceTimeZone, deviceUnits } from '../i18n';

/** Onboarding step 5 choices (SPEC 8) and their episodes-per-week values. Skipping uses "a few times a week". */
export const FREQUENCY_OPTIONS = [
  { key: 'severalDaily', perWeek: 14 },
  { key: 'daily', perWeek: 7 },
  { key: 'fewWeekly', perWeek: 3 },
  { key: 'weekly', perWeek: 1 },
  { key: 'lessWeekly', perWeek: 0.5 },
] as const;
export const DEFAULT_EPISODES_PER_WEEK = 3;

export function freshDraft(): OnboardingDraft {
  return {
    language: deviceLanguage(),
    mode: 'local_only',
    child: { nickname: '', birthYear: null, homeTz: deviceTimeZone(), communication: null, wakeStart: '07:00', wakeEnd: '20:30', typicalSleepHours: 10 },
    episodesPerWeek: DEFAULT_EPISODES_PER_WEEK,
    modeledTypes: ['meltdown', 'shutdown', 'other'],
    suspectedTriggers: [],
    favoriteDefaults: [],
    customStrategies: [],
    medications: [],
    places: [],
    locationTracking: 'my_phone',
    integrations: {},
    calendarIds: [],
    alerts: { alert_sensitivity: 'balanced', max_alerts_per_day: 3, quiet_hours: { start: '21:00', end: '07:00' }, end_of_day_time: '20:30' },
    units: deviceUnits(),
  };
}

interface OnboardingState {
  draft: OnboardingDraft;
  ageConfirmed: boolean;
  frequencyChosen: string | null;
  notificationsOn: boolean;
  set: (patch: Partial<OnboardingDraft>) => void;
  setChild: (patch: Partial<OnboardingDraft['child']>) => void;
  patch: (p: Partial<Omit<OnboardingState, 'draft' | 'set' | 'setChild' | 'patch' | 'reset'>>) => void;
  reset: () => void;
}

export const useOnboarding = create<OnboardingState>((set) => ({
  draft: freshDraft(),
  ageConfirmed: false,
  frequencyChosen: null,
  notificationsOn: false,
  set: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  setChild: (patch) => set((s) => ({ draft: { ...s.draft, child: { ...s.draft.child, ...patch } } })),
  patch: (p) => set(p),
  reset: () => set({ draft: freshDraft(), ageConfirmed: false, frequencyChosen: null, notificationsOn: false }),
}));

export const toggle = <T,>(list: T[], item: T): T[] => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
