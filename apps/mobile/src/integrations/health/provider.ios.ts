/**
 * Apple Health on iPhone via @kingstinct/react-native-healthkit (SPEC 11.1). Read-only: EmoLens never writes to Health.
 * Note: iOS never tells an app whether *read* access was granted (a privacy rule). "Permission" here means "the parent
 * has already answered the Health permission screen"; if they said no, reads just return nothing.
 */
import {
  AuthorizationRequestStatus, enableBackgroundDelivery, getRequestStatusForAuthorization, isHealthDataAvailable,
  queryCategorySamples, queryQuantitySamples, requestAuthorization, subscribeToChanges, UpdateFrequency,
} from '@kingstinct/react-native-healthkit';
import type { HealthProvider, HealthRead } from './provider';
import type { HealthSampleIn, HealthSampleType } from './store';

const READ = [
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierStepCount',
] as const;

/** HealthKit sleep values that mean "asleep" (asleepUnspecified 1, core 3, deep 4, REM 5); awake (2) never counts. */
const ASLEEP_VALUES = new Set([1, 3, 4, 5]);
/** "In bed" (0): what the Health app records for sleep added by hand. Used only when a night has no asleep data. */
const IN_BED = 0;

export const healthProvider: HealthProvider = {
  source: 'healthkit',
  isAvailable: async () => isHealthDataAvailable(),
  hasPermission: async () => (await getRequestStatusForAuthorization({ toRead: READ })) === AuthorizationRequestStatus.unnecessary,
  requestPermission: async () => requestAuthorization({ toRead: READ }),
  async read(since, until): Promise<HealthRead> {
    const filter = { date: { startDate: since, endDate: until } };
    const sleep = await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', { limit: 0, filter });
    const toInterval = (s: (typeof sleep)[number]) => ({ start: new Date(s.startDate).getTime(), end: new Date(s.endDate).getTime() });
    const asleep = sleep.filter((s) => ASLEEP_VALUES.has(Number(s.value))).map(toInterval);
    const inBed = sleep.filter((s) => Number(s.value) === IN_BED).map(toInterval);

    const samples: HealthSampleIn[] = [];
    const add = (type: HealthSampleType, unit: string, rows: readonly { uuid: string; startDate: Date; endDate: Date; quantity: number }[]) => {
      for (const r of rows) samples.push({ externalId: r.uuid, type, start: new Date(r.startDate).getTime(), end: new Date(r.endDate).getTime(), value: r.quantity, unit });
    };
    add('heart_rate', 'count/min', await queryQuantitySamples('HKQuantityTypeIdentifierHeartRate', { limit: 0, unit: 'count/min', filter }));
    add('resting_hr', 'count/min', await queryQuantitySamples('HKQuantityTypeIdentifierRestingHeartRate', { limit: 0, unit: 'count/min', filter }));
    add('hrv_sdnn', 'ms', await queryQuantitySamples('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', { limit: 0, unit: 'ms', filter }));
    add('steps', 'count', await queryQuantitySamples('HKQuantityTypeIdentifierStepCount', { limit: 0, unit: 'count', filter }));
    return { asleep, inBed, samples };
  },
  async enableBackground(onChange) {
    // SPEC 11.1: observer queries with background delivery for heart rate and sleep.
    await enableBackgroundDelivery('HKQuantityTypeIdentifierHeartRate', UpdateFrequency.hourly);
    await enableBackgroundDelivery('HKCategoryTypeIdentifierSleepAnalysis', UpdateFrequency.hourly);
    subscribeToChanges('HKQuantityTypeIdentifierHeartRate', onChange);
    subscribeToChanges('HKCategoryTypeIdentifierSleepAnalysis', onChange);
  },
};
