/** Which feature groups have enough data to enter the model (spec 12.5). */
import { FEATURE_REGISTRY, type DataRequirement } from '@emolens/shared';
import type { DatasetIndex } from './build';
import { addDays, localDateOf } from './time';

export type EnabledMap = Record<DataRequirement, boolean>;

export function enabledRequirements(idx: DatasetIndex, now: number): EnabledMap {
  const { ds, tz } = idx;
  const today = localDateOf(now, tz);
  const lastN = (n: number) => Array.from({ length: n }, (_, i) => addDays(today, -i));
  const within = (dates: string[], set: Set<string>) => dates.filter((d) => set.has(d)).length;

  const sleepDates = new Set([...idx.sleepByDate.keys()]);
  const visitDates = new Set(idx.visits.filter((v) => v.arrivedAt <= now).map((v) => localDateOf(v.arrivedAt, tz)));
  const soundDates = new Set<string>();
  for (const s of idx.sound) if (s.start <= now && s.db != null) soundDates.add(localDateOf(s.start, tz));
  const heartDates = new Set<string>();
  let lastDate = '';
  for (const t of idx.heartTimes) { if (t > now) break; const d = localDateOf(t, tz); if (d !== lastDate) { heartDates.add(d); lastDate = d; } }
  for (const d of ds.dailyHealth) if (d.restingHr != null || d.hrv != null) heartDates.add(d.localDate);
  const stepDays = ds.dailyHealth.filter((d) => d.steps != null).length;

  const weather = ds.settings.hasHomeCoordinates;
  return {
    always: true,
    sleep: within(lastN(28), sleepDates) >= 7,
    food: within(lastN(14), idx.mealDates) >= 7,
    medication: ds.medications.some((m) => !m.asNeeded && m.scheduleTimes.length > 0),
    calendar: ds.settings.calendarConnected,
    schedule_any: true,
    place: ds.places.length >= 1 && within(lastN(14), visitDates) >= 7,
    sensory: within(lastN(28), soundDates) >= 7,
    weather,
    pollen: weather && idx.hasPollen,
    steps: stepDays >= 14,
    physiology: within(lastN(14), heartDates) >= 7,
    illness: true,
  };
}

/** Feature keys that enter the fit, in registry order. */
export function enabledFeatureKeys(enabled: EnabledMap): string[] {
  return FEATURE_REGISTRY.filter((d) => enabled[d.requires]).map((d) => d.key);
}
