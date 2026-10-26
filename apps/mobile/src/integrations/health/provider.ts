/**
 * The health data source for this platform. Metro loads `provider.ios.ts` (Apple Health) on iPhone and
 * `provider.android.ts` (Health Connect) on Android; this plain version is used anywhere else (tests, web) and
 * reports "not available".
 */
import type { AsleepInterval } from './sleep';
import type { HealthSampleIn, HealthSource } from './store';

/** `inBed`: time in bed, used only for nights without any asleep data (see sleep.ts). */
export interface HealthRead { asleep: AsleepInterval[]; inBed: AsleepInterval[]; samples: HealthSampleIn[] }

export interface HealthProvider {
  source: HealthSource | null;
  isAvailable(): Promise<boolean>;
  hasPermission(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  read(since: Date, until: Date): Promise<HealthRead>;
  /** Ask the OS to wake the app when new sleep / heart-rate data arrives (iOS background delivery). */
  enableBackground?(onChange: () => void): Promise<void>;
}

export const healthProvider: HealthProvider = {
  source: null,
  isAvailable: async () => false,
  hasPermission: async () => false,
  requestPermission: async () => false,
  read: async () => ({ asleep: [], inBed: [], samples: [] }),
};
