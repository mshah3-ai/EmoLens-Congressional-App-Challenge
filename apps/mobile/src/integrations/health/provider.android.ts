/**
 * Health Connect on Android via react-native-health-connect (SPEC 11.1). Health Connect's Expo setup now ships inside
 * that package (the separate `expo-health-connect` package is deprecated; DECISIONS #41). Read-only.
 */
import { getGrantedPermissions, getSdkStatus, initialize, readRecords, requestPermission, SdkAvailabilityStatus } from 'react-native-health-connect';
import type { HealthProvider, HealthRead } from './provider';
import type { HealthSampleIn } from './store';

const TYPES = ['SleepSession', 'HeartRate', 'RestingHeartRate', 'HeartRateVariabilityRmssd', 'Steps'] as const;
const PERMISSIONS = TYPES.map((recordType) => ({ accessType: 'read' as const, recordType }));
/** Sleep stages that count as asleep: sleeping 2, light 4, deep 5, REM 6 (awake 1, out of bed 3, unknown 0 do not). */
const ASLEEP_STAGES = new Set([2, 4, 5, 6]);
const ms = (s: string) => Date.parse(s);

async function ready(): Promise<boolean> {
  if ((await getSdkStatus()) !== SdkAvailabilityStatus.SDK_AVAILABLE) return false;
  return initialize();
}

/** Reads every page of a record type in the time range. */
async function readAll<T extends (typeof TYPES)[number]>(type: T, since: Date, until: Date) {
  const out = [];
  let pageToken: string | undefined;
  do {
    const res = await readRecords(type, { timeRangeFilter: { operator: 'between', startTime: since.toISOString(), endTime: until.toISOString() }, pageToken });
    out.push(...res.records);
    pageToken = res.pageToken || undefined;
  } while (pageToken);
  return out;
}

export const healthProvider: HealthProvider = {
  source: 'healthconnect',
  isAvailable: async () => (await getSdkStatus()) === SdkAvailabilityStatus.SDK_AVAILABLE,
  async hasPermission() {
    if (!(await ready())) return false;
    const granted = await getGrantedPermissions();
    return granted.some((p) => p.recordType === 'SleepSession' || p.recordType === 'HeartRate');
  },
  async requestPermission() {
    if (!(await ready())) return false;
    const granted = await requestPermission(PERMISSIONS);
    return granted.length > 0;
  },
  async read(since, until): Promise<HealthRead> {
    if (!(await ready())) return { asleep: [], inBed: [], samples: [] };
    const asleep: HealthRead['asleep'] = [];
    const inBed: HealthRead['inBed'] = [];
    for (const s of await readAll('SleepSession', since, until)) {
      const stages = s.stages ?? [];
      // A session without stages is counted as asleep; the session itself is also "in bed" time for the fallback.
      inBed.push({ start: ms(s.startTime), end: ms(s.endTime) });
      if (!stages.length) asleep.push({ start: ms(s.startTime), end: ms(s.endTime) });
      for (const st of stages) if (ASLEEP_STAGES.has(st.stage)) asleep.push({ start: ms(st.startTime), end: ms(st.endTime) });
    }
    const samples: HealthSampleIn[] = [];
    for (const r of await readAll('HeartRate', since, until)) {
      r.samples.forEach((smp, i) => samples.push({ externalId: `${r.metadata?.id}:${i}`, type: 'heart_rate', start: ms(smp.time), end: ms(smp.time), value: smp.beatsPerMinute, unit: 'count/min' }));
    }
    for (const r of await readAll('RestingHeartRate', since, until)) {
      samples.push({ externalId: String(r.metadata?.id), type: 'resting_hr', start: ms(r.time), end: ms(r.time), value: r.beatsPerMinute, unit: 'count/min' });
    }
    for (const r of await readAll('HeartRateVariabilityRmssd', since, until)) {
      samples.push({ externalId: String(r.metadata?.id), type: 'hrv_rmssd', start: ms(r.time), end: ms(r.time), value: r.heartRateVariabilityMillis, unit: 'ms' });
    }
    for (const r of await readAll('Steps', since, until)) {
      samples.push({ externalId: String(r.metadata?.id), type: 'steps', start: ms(r.startTime), end: ms(r.endTime), value: r.count, unit: 'count' });
    }
    return { asleep, inBed, samples };
  },
};
