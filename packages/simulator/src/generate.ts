/**
 * Synthetic-family generator (spec 26.2). Builds one family's "world": sleep, school and places,
 * calendar, meals, medication, illness, weather, sound and (optionally) heart rate, plus the TRUE
 * chance of a hard moment in every awake block.
 *
 * The true chance uses the engine's own feature builder on the generated data, so a planted effect
 * such as "sleep_deficit = 0.35" means exactly the engine's sleep_deficit feature.
 *
 * Pure TypeScript with no Node APIs: the app's demo mode imports this file.
 */
import {
  DAY_MS, HOUR_MS, MINUTE_MS,
  type Alert, type AlertResponse, type Block, type CalendarEvent, type CalendarTag, type ChildDataset, type ChildProfile, type DailyHealth,
  type DatasetSettings, type DayClosure, type Episode, type HeartSample, type IllnessLog, type Meal, type MedDose,
  type MedicationChange, type Place, type PlaceType, type PlaceVisit, type SleepEntry, type SoundInterval, type WeatherHour,
} from '@emolens/shared';
import {
  addDays, awakeBlocksForDate, awakeIndices, buildIndex, computeFeatures, hash32, isoWeekday, localDateOf, localMinuteOf,
  logit, mulberry32, parseHHMM, sigmoid, zonedToUtc,
} from '@emolens/engine';
import { DEFAULT_START_DATE, DEFAULT_TIME_ZONE, type Scenario } from './scenario';

// ---------- seeded randomness ----------

export type Rng = () => number;
/** A random stream keyed by its purpose, so changing one part of the world never shifts another. */
export const rngFor = (...parts: (string | number)[]): Rng => mulberry32(hash32(parts.join('|')));
/**
 * One uniform number keyed by (family, day, block, purpose). Experiment arms that share a seed use the
 * same number for the same decision ("common random numbers"), so arms differ only where policies differ.
 */
export const uniformFor = (...parts: (string | number)[]): number => rngFor(...parts)();

const uniform = (r: Rng, a: number, b: number) => a + (b - a) * r();
/** Standard normal draw (Box-Muller). */
export function normal(r: Rng): number {
  const u = 1 - r(), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
/** Poisson draw (Knuth's method; fine for small means). */
export function poisson(r: Rng, lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= r(); } while (p > L);
  return k - 1;
}
const pick = <T>(r: Rng, arr: T[]): T => arr[Math.floor(r() * arr.length)];

// ---------- world ----------

/** Everything generated for one family except what the simulated app and caregiver produce. */
export type WorldData = Pick<ChildDataset,
  'medications' | 'medicationChanges' | 'doses' | 'meals' | 'sleep' | 'places' | 'visits' | 'calendar' | 'routineChanges'
  | 'illness' | 'weather' | 'sound' | 'heart' | 'dailyHealth'>;

export interface SimBlock {
  block: Block;
  /** Day number counted from 0 (the first simulated date). */
  day: number;
  /** True chance of a hard moment (before any intervention). */
  pTrue: number;
}

export interface World {
  scenario: Scenario;
  family: number;
  startDate: string;
  tz: string;
  child: ChildProfile;
  settings: DatasetSettings;
  /** This family's true logit effects: planted triggers (scaled per family) and time-of-day effects. */
  effects: Record<string, number>;
  data: WorldData;
  /** Every awake block of the simulation, in time order. */
  blocks: SimBlock[];
}

/** What the simulated caregiver and app have recorded so far. */
export interface SimLog {
  episodes: { episode: Episode; loggedAt: number }[];
  alerts: { alert: Alert; createdAt: number }[];
  responses: AlertResponse[];
  closures: DayClosure[];
}
export const emptyLog = (): SimLog => ({ episodes: [], alerts: [], responses: [], closures: [] });

const PLACES: Place[] = [
  { id: 'home', label: 'Home', type: 'home' },
  { id: 'school', label: 'School', type: 'school' },
  { id: 'therapy', label: 'Therapy', type: 'therapy' },
  { id: 'store', label: 'Store', type: 'store_public' },
  { id: 'relative', label: 'Relative', type: 'relative' },
];
const PLACE_TYPE: Record<string, PlaceType> = Object.fromEntries(PLACES.map((p) => [p.id, p.type]));
/** Typical loudness (dB mean, sd) of 15-minute stretches at each kind of place; school is loudest. */
const SOUND_BY_PLACE: Record<string, [number, number]> = {
  home: [55, 7], school: [68, 7], therapy: [58, 6], store: [66, 6], relative: [60, 7],
};

export function generateWorld(scenario: Scenario, family: number): World {
  const tz = scenario.timeZone ?? DEFAULT_TIME_ZONE;
  const startDate = scenario.startDate ?? DEFAULT_START_DATE;
  const days = scenario.days;
  const key = `${scenario.seed}|${family}`;
  const R = (purpose: string) => rngFor(key, purpose);
  const at = (date: string, minutes: number) => zonedToUtc(date, minutes, tz);
  const dates = Array.from({ length: days }, (_, i) => addDays(startDate, i));
  const [wakeStart, wakeEnd] = scenario.wake;
  const wakeStartMin = parseHHMM(wakeStart), wakeEndMin = parseHHMM(wakeEnd);

  // ----- child traits -----
  const traits = R('traits');
  const meanSleep = uniform(traits, 9, 10.5);
  const effects: Record<string, number> = { ...scenario.todEffects };
  for (const [k, v] of Object.entries(scenario.trueEffects)) effects[k] = v * uniform(traits, 0.7, 1.3);
  const therapyWeekday = 1 + Math.floor(traits() * 5);
  const child: ChildProfile = {
    id: `family-${family}`, nickname: `Child ${family + 1}`, homeTz: tz, wakeStart, wakeEnd,
    typicalSleepHours: Math.round(meanSleep * 2) / 2, episodesPerWeekEstimate: 0,
    modeledEpisodeTypes: ['meltdown', 'shutdown'], minModeledIntensity: 1, schoolDays: [1, 2, 3, 4, 5],
    suspectedFeatures: [...scenario.parentSuspected],
  };
  const nAwake = awakeIndices(child).length;
  // The parent's onboarding guess: roughly right, off by up to 30% either way.
  child.episodesPerWeekEstimate = Math.round(7 * nAwake * scenario.baseRatePerBlock * uniform(traits, 0.7, 1.3) * 10) / 10;
  const settings: DatasetSettings = {
    noiseThresholdDb: 70, recencyHalfLifeDays: 90, sensitivity: 'balanced', maxAlertsPerDay: 3,
    quietHours: { start: '21:00', end: '07:00' }, earlyAlertsEnabled: false,
    hasHomeCoordinates: scenario.sources.weather, calendarConnected: scenario.sources.calendar,
  };

  // ----- sleep: N(mean, 0.6) h; 15% short nights lose U(1.5, 3) h; wakings ~ Poisson(0.5) -----
  const rs = R('sleep');
  const sleep: SleepEntry[] = dates.map((date) => {
    let h = meanSleep + 0.6 * normal(rs);
    if (rs() < 0.15) h -= uniform(rs, 1.5, 3);
    h = Math.min(13, Math.max(4, h));
    const sleepEnd = at(date, wakeStartMin + Math.round(uniform(rs, -20, 20)));
    const durationMin = Math.round(h * 60);
    return { id: `sl-${date}`, sleepStart: sleepEnd - durationMin * MINUTE_MS, sleepEnd, durationMin, nightWakings: poisson(rs, 0.5) };
  });

  // ----- school days, places and calendar -----
  const rp = R('places'), rc = R('calendar');
  const visits: PlaceVisit[] = [];
  const calendar: CalendarEvent[] = [];
  let lastPlace = '';
  const arrive = (placeId: string, t: number) => {
    if (placeId === lastPlace) return;
    const prev = visits[visits.length - 1];
    if (prev) prev.departedAt = t;
    visits.push({ id: `v${visits.length}`, placeId, placeType: PLACE_TYPE[placeId], arrivedAt: t, departedAt: null, source: 'geofence_parent' });
    lastPlace = placeId;
  };
  arrive('home', at(addDays(startDate, -1), 0));
  const ev = (id: string, startAt: number, endAt: number, tags: CalendarTag[], allDay = false) =>
    calendar.push({ id, startAt, endAt, allDay, tags, ignored: false });
  const appointmentDay = new Map<number, number>(); // week -> day
  for (let w = 0; w * 7 < days; w++) appointmentDay.set(w, w * 7 + Math.floor(rc() * 5)); // a weekday of each week (start is a Monday)
  dates.forEach((date, i) => {
    const wd = isoWeekday(date);
    const noSchool = wd <= 5 && rp() < 0.05;
    const schoolDay = wd <= 5 && !noSchool;
    const dayStart = at(date, 0), dayEnd = at(addDays(date, 1), 0);
    if (noSchool) ev(`ns-${date}`, dayStart, dayEnd, ['no_school'], true);
    if (rc() < 0.08) ev(`un-${date}`, dayStart, dayEnd, ['unusual'], true);
    if (schoolDay) {
      // arrival transitions at school start and end (planned), actual arrival jittered a few minutes
      ev(`ts-${date}`, at(date, 8 * 60), at(date, 8 * 60 + 15), ['transition']);
      ev(`te-${date}`, at(date, 15 * 60), at(date, 15 * 60 + 15), ['transition']);
      arrive('school', at(date, 8 * 60 + Math.round(uniform(rp, -10, 10))));
      arrive('home', at(date, 15 * 60 + 20 + Math.round(uniform(rp, -5, 5))));
      if (wd === therapyWeekday) {
        arrive('therapy', at(date, 16 * 60));
        arrive('home', at(date, 17 * 60 + 20));
      }
    } else if (rp() < 0.3) {
      // outing on a non-school day: store/public for 2 h or a relative for 3 h
      const store = rp() < 0.5;
      const start = at(date, Math.round(uniform(rp, 10 * 60, 15 * 60) / 15) * 15);
      arrive(store ? 'store' : 'relative', start);
      arrive('home', start + (store ? 2 : 3) * HOUR_MS);
    }
    // Poisson(0.8) extra transitions at random awake times
    const extra = poisson(rc, 0.8);
    for (let j = 0; j < extra; j++) {
      const m = Math.round(uniform(rc, wakeStartMin, wakeEndMin - 30) / 5) * 5;
      ev(`tx-${date}-${j}`, at(date, m), at(date, m + 15), ['transition']);
    }
    if (appointmentDay.get(Math.floor(i / 7)) === i) {
      const m = Math.round(uniform(rc, 9 * 60, 16 * 60) / 15) * 15;
      ev(`ap-${date}`, at(date, m), at(date, m + 60), ['appointment']);
    }
  });
  calendar.sort((a, b) => a.startAt - b.startAt);

  // ----- meals: breakfast 7:00, lunch 12:00, snack 15:30 (skipped 30%), dinner 18:00, each +/-30 min -----
  const rm = R('meals');
  const meals: Meal[] = [];
  const MENU: Record<string, string[]> = {
    breakfast: ['oatmeal', 'toast', 'cereal', 'eggs'], lunch: ['sandwich', 'pasta', 'rice bowl'],
    snack: ['apple', 'crackers', 'yogurt'], dinner: ['chicken and rice', 'tacos', 'soup'],
  };
  for (const date of dates) {
    for (const [type, hhmm] of [['breakfast', 7 * 60], ['lunch', 12 * 60], ['snack', 15 * 60 + 30], ['dinner', 18 * 60]] as const) {
      const skip = type === 'snack' && rm() < 0.3;
      const t = at(date, hhmm + Math.round(uniform(rm, -30, 30)));
      if (skip) continue;
      const sugary = type === 'snack' && rm() < 0.2;
      meals.push({ id: `m-${date}-${type}`, eatenAt: t, mealType: type,
        items: [sugary ? { name: pick(rm, ['cookies', 'candy', 'juice pouch']), tags: ['high_sugar'] } : { name: pick(rm, MENU[type]), tags: [] }] });
    }
  }

  // ----- medication: one med at 8:00; missed 7%, late 10%; 50% chance of a dose change on a day in 40-80 -----
  const rd = R('meds');
  const doses: MedDose[] = dates.map((date) => {
    const t = at(date, 8 * 60), u = rd();
    if (u < 0.07) return { id: `d-${date}`, medicationId: 'med1', scheduledFor: t, takenAt: null, status: 'missed' };
    if (u < 0.17) return { id: `d-${date}`, medicationId: 'med1', scheduledFor: t, takenAt: t + uniform(rd, 60, 120) * MINUTE_MS, status: 'late' };
    return { id: `d-${date}`, medicationId: 'med1', scheduledFor: t, takenAt: t + uniform(rd, 0, 20) * MINUTE_MS, status: 'taken' };
  });
  const medicationChanges: MedicationChange[] = [];
  if (rd() < 0.5) {
    const d = 40 + Math.floor(rd() * 41);
    if (d < days) medicationChanges.push({ medicationId: 'med1', changedAt: at(dates[d], 8 * 60), changeType: 'dose_change' });
  }

  // ----- illness: starts with daily probability 1/30, lasts 2-4 days, severity 1-3 -----
  const ri = R('illness');
  const illness: IllnessLog[] = [];
  for (let i = 0; i < days; i++) {
    if (ri() >= 1 / 30) continue;
    const startedAt = at(dates[i], Math.round(uniform(ri, 7 * 60, 20 * 60)));
    const length = 2 + Math.floor(ri() * 3);
    illness.push({ id: `ill-${i}`, startedAt, endedAt: startedAt + length * DAY_MS, severity: 1 + Math.floor(ri() * 3), kind: 'cold' });
    i += length;
  }

  // ----- weather: pressure random walk toward 1013 (hourly sd 1 hPa), seasonal temperature, AQI spikes -----
  const rw = R('weather');
  const weather: WeatherHour[] = [];
  let P = 1013 + 4 * normal(rw), tNoise = 0, aqiDay = '', aqiBase = 40;
  for (let t = at(addDays(startDate, -1), 0); t < at(addDays(startDate, days + 2), 0); t += HOUR_MS) {
    P += 0.02 * (1013 - P) + normal(rw);
    tNoise = 0.9 * tNoise + normal(rw);
    const date = localDateOf(t, tz);
    const hour = localMinuteOf(t, tz) / 60;
    const doy = dayOfYear(date);
    const T = 12.5 + 12.5 * Math.cos((2 * Math.PI * (doy - 201)) / 365) + 5 * Math.cos((2 * Math.PI * (hour - 15)) / 24) + tNoise;
    if (date !== aqiDay) { aqiDay = date; aqiBase = rw() < 0.03 ? uniform(rw, 120, 190) : uniform(rw, 25, 60); }
    weather.push({ time: t, temperatureC: round1(T), pressureHpa: round1(P), usAqi: Math.max(0, Math.round(aqiBase + 5 * normal(rw))), pollenIndex: null, isForecast: false });
  }

  // ----- sound: 15-minute stretches; home room sensor (24 h, with temperature), phone when away -----
  const rn = R('sound');
  const sound: SoundInterval[] = [];
  let vi = 0;
  for (const date of dates) {
    const indoor = 21.5 + 1.2 * normal(rn);
    for (let m = 0; m < 24 * 60; m += 15) {
      const t = at(date, m);
      while (vi + 1 < visits.length && visits[vi + 1].arrivedAt <= t) vi++;
      const placeId = visits[vi].placeId as string;
      const awake = m >= wakeStartMin && m < wakeEndMin;
      if (placeId === 'home') {
        const db = awake ? SOUND_BY_PLACE.home[0] + SOUND_BY_PLACE.home[1] * normal(rn) : 35 + 4 * normal(rn);
        sound.push({ start: t, minutes: 15, db: round1(db), tempC: round1(indoor + 0.5 * normal(rn)), placeId: 'home', source: 'sensor' });
      } else if (awake) {
        const [mu, sd] = SOUND_BY_PLACE[placeId];
        sound.push({ start: t, minutes: 15, db: round1(mu + sd * normal(rn)), tempC: null, placeId: null, source: 'phone' });
      }
    }
  }

  // ----- physiology (only when used): heart rate every 10 min with an hourly arousal level; daily RHR/HRV/steps -----
  const heart: HeartSample[] = [];
  const dailyHealth: DailyHealth[] = [];
  if (scenario.sources.physiology || scenario.trueEffects.hr_elevated_pre) {
    const rh = R('heart');
    const rhr = uniform(rh, 65, 80), hrv = uniform(rh, 40, 60);
    for (const date of dates) {
      for (let h = 0; h < 24; h++) {
        const arousal = 8 * normal(rh);
        const awake = h * 60 >= wakeStartMin && h * 60 < wakeEndMin;
        for (let m = 0; m < 60; m += 10) {
          heart.push({ time: at(date, h * 60 + m), bpm: Math.round((awake ? 95 : 72) + arousal + 3 * normal(rh)) });
        }
      }
      const low = rh() < 0.08;
      dailyHealth.push({ localDate: date, restingHr: Math.round(rhr + 2.5 * normal(rh)), hrv: Math.round(hrv * (1 + 0.12 * normal(rh))),
        steps: Math.max(0, Math.round((9000 + 2500 * normal(rh)) * (low ? 0.35 : 1))) });
    }
  }

  const data: WorldData = {
    medications: [{ id: 'med1', name: 'Medication A', scheduleTimes: ['08:00'], scheduleDays: [1, 2, 3, 4, 5, 6, 7], asNeeded: false, activeFrom: startDate, activeTo: null }],
    medicationChanges, doses, meals, sleep, places: PLACES, visits, calendar, routineChanges: [], illness, weather, sound, heart, dailyHealth,
  };

  // ----- true chance of a hard moment in each awake block -----
  const full: ChildDataset = { ...emptyDataset(child, { ...settings, hasHomeCoordinates: true, calendarConnected: true }), ...data };
  const idx = buildIndex(full);
  const base = logit(scenario.baseRatePerBlock);
  const blocks: SimBlock[] = [];
  dates.forEach((date, day) => {
    for (const block of awakeBlocksForDate(date, child)) {
      const v = computeFeatures(idx, block, { mode: 'actual' }).values;
      let z = base;
      for (const [k, b] of Object.entries(effects)) z += b * (v[k] ?? 0);
      blocks.push({ block, day, pTrue: sigmoid(z) });
    }
  });

  return { scenario, family, startDate, tz, child, settings, effects, data, blocks };
}

function round1(x: number): number { return Math.round(x * 10) / 10; }
function dayOfYear(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / DAY_MS) + 1;
}

export function emptyDataset(child: ChildProfile, settings: DatasetSettings): ChildDataset {
  return {
    child, settings, episodes: [], medications: [], medicationChanges: [], doses: [], meals: [], sleep: [], places: [], visits: [],
    calendar: [], routineChanges: [], illness: [], weather: [], sound: [], heart: [], dailyHealth: [], alerts: [], alertResponses: [],
    dayClosures: [], strategies: [], strategyUses: [],
  };
}

/**
 * What the app could know at instant `now` (no peeking at the future): logs up to now, ongoing visits
 * and illnesses still open, the planned calendar, and the weather forecast for the next two days.
 * Data sources the family does not use are left out entirely.
 */
export function observedView(world: World, log: SimLog, now: number): ChildDataset {
  const { data, scenario } = world;
  const src = scenario.sources;
  const today = localDateOf(now, world.tz);
  const ds = emptyDataset(world.child, world.settings);
  ds.episodes = log.episodes.filter((e) => e.loggedAt <= now).map((e) => e.episode);
  ds.alerts = log.alerts.filter((a) => a.createdAt <= now).map((a) => a.alert);
  ds.alertResponses = log.responses.filter((r) => r.respondedAt <= now);
  ds.dayClosures = log.closures.filter((c) => c.closedAt <= now);
  if (src.sleep) ds.sleep = data.sleep.filter((s) => s.sleepEnd <= now);
  if (src.meals) ds.meals = data.meals.filter((m) => m.eatenAt <= now);
  if (src.meds) {
    ds.medications = data.medications;
    ds.doses = data.doses.filter((d) => d.scheduledFor != null && d.scheduledFor <= now);
    ds.medicationChanges = data.medicationChanges.filter((c) => c.changedAt <= now);
  }
  if (src.places) {
    ds.places = data.places;
    ds.visits = data.visits.filter((v) => v.arrivedAt <= now).map((v) => (v.departedAt != null && v.departedAt > now ? { ...v, departedAt: null } : v));
  }
  if (src.calendar) ds.calendar = data.calendar;
  ds.routineChanges = data.routineChanges.filter((r) => r.localDate <= today);
  ds.illness = data.illness.filter((i) => i.startedAt <= now).map((i) => (i.endedAt != null && i.endedAt > now ? { ...i, endedAt: null } : i));
  if (src.weather) ds.weather = data.weather.filter((w) => w.time <= now + 2 * DAY_MS).map((w) => (w.time > now ? { ...w, isForecast: true } : w));
  if (src.sensor) ds.sound = data.sound.filter((s) => s.start + s.minutes * MINUTE_MS <= now);
  if (src.physiology) {
    ds.heart = data.heart.filter((h) => h.time <= now);
    ds.dailyHealth = data.dailyHealth.filter((d) => d.localDate <= today);
  }
  return ds;
}
