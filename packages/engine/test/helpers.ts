/**
 * Hand-built datasets for the table-driven feature, label and alert tests.
 * Everything happens in America/New_York so the DST tests use real transition days.
 * 2026-09-14 is a Monday (school day); 2026-09-19 is a Saturday.
 */
import type { Block, ChildDataset, ChildProfile, DatasetSettings } from '@emolens/shared';
import { blocksForDate, buildIndex, computeFeatures, parseHHMM, zonedToUtc, type BuildOptions } from '../src/index';

export const TZ = 'America/New_York';
export const MONDAY = '2026-09-14';
export const SATURDAY = '2026-09-19';

export function makeChild(over: Partial<ChildProfile> = {}): ChildProfile {
  return {
    id: 'c1', nickname: 'Sam', homeTz: TZ, wakeStart: '06:30', wakeEnd: '21:00', typicalSleepHours: 10,
    episodesPerWeekEstimate: 3, modeledEpisodeTypes: ['meltdown', 'shutdown'], minModeledIntensity: 2,
    schoolDays: [1, 2, 3, 4, 5], suspectedFeatures: [], ...over,
  };
}

export function makeSettings(over: Partial<DatasetSettings> = {}): DatasetSettings {
  return {
    noiseThresholdDb: 70, recencyHalfLifeDays: 90, sensitivity: 'balanced', maxAlertsPerDay: 3,
    quietHours: { start: '21:00', end: '07:00' }, earlyAlertsEnabled: false, hasHomeCoordinates: true,
    calendarConnected: true, ...over,
  };
}

export function makeDataset(over: Partial<ChildDataset> = {}): ChildDataset {
  return {
    child: makeChild(), settings: makeSettings(),
    episodes: [], medications: [], medicationChanges: [], doses: [], meals: [], sleep: [], places: [], visits: [],
    calendar: [], routineChanges: [], illness: [], weather: [], sound: [], heart: [], dailyHealth: [], alerts: [],
    alertResponses: [], dayClosures: [], strategies: [], strategyUses: [], ...over,
  };
}

/** UTC instant of a local wall-clock time, e.g. at('2026-09-14', '09:30'). */
export const at = (date: string, hhmm: string): number => zonedToUtc(date, parseHHMM(hhmm), TZ);

/** Block k (0..11) of a local date. */
export const blockOf = (date: string, k: number, ds: ChildDataset = makeDataset()): Block => blocksForDate(date, ds.child)[k];

/** Feature values of block k on `date`. */
export function feats(ds: ChildDataset, date: string, k: number, opts?: BuildOptions): Record<string, number> {
  return computeFeatures(buildIndex(ds), blockOf(date, k, ds), opts).values;
}

/** A sleep entry ending at `end` (local time on `date`) lasting `hours`. */
export function sleepEnding(date: string, end: string, hours: number, nightWakings: number | null = 0, id = `s${date}`) {
  const sleepEnd = at(date, end);
  return { id, sleepStart: sleepEnd - hours * 3_600_000, sleepEnd, durationMin: hours * 60, nightWakings };
}

let n = 0;
export const uid = (p: string) => `${p}${++n}`;
