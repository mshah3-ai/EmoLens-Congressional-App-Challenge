/**
 * Pure feature builder (spec 12.4 and 12.7) over a ChildDataset.
 *
 * LEAKAGE RULE (12.3): every feature uses only information from before block_start, except
 * *planned* calendar information about the block itself. Sound/temperature use the 90 minutes
 * before the block and heart rate the 60 minutes before it.
 *
 * The one deliberate exception: last night's sleep is the entry that ENDS on this local date and
 * before the block ENDS (a child who wakes at 6:45 still has "last night" for the 6-8 am block).
 */
import {
  DAY_MS, HOUR_MS, MINUTE_MS, FEATURE_REGISTRY,
  type Block, type CalendarEvent, type ChildDataset, type Meal, type PlaceVisit, type SleepEntry,
} from '@emolens/shared';
import { clamp, median } from '../stats';
import { addDays, isoWeekday, localDateOf, localMinuteOf, zonedToUtc } from './time';
import { BLOCKS_PER_DAY } from './blocks';

export type FeatureValues = Record<string, number>;
export interface FeatureResult {
  values: FeatureValues;
  /** Keys whose values were estimated (forecast mode). */
  estimated: string[];
  /** Extra numbers used to render reasons ("{h} h less than usual", "{n} transitions"). */
  params: { sleepDeficitHours: number; transitions: number };
}

// ---------- index ----------

function lowerBound(arr: number[], v: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < v) lo = mid + 1; else hi = mid; }
  return lo;
}
/** Count of sorted values in [a, b). */
const countIn = (arr: number[], a: number, b: number) => lowerBound(arr, b) - lowerBound(arr, a);

const VISIT_PRIORITY: Record<string, number> = { geofence_child_device: 5, manual: 4, episode: 3, geofence_parent: 2, schedule_default: 1 };

export interface DatasetIndex {
  ds: ChildDataset;
  tz: string;
  episodeTimes: number[];            // qualifying, non-deleted, sorted
  foodMeals: Meal[];                 // meals excluding plain drinks, sorted
  foodMealTimes: number[];
  sugarTimes: number[];
  caffeineTimes: number[];
  mealDates: Set<string>;
  sleepByDate: Map<string, SleepEntry>;
  missedDoseTimes: number[];
  lateDoseTimes: number[];
  medChangeTimes: number[];
  events: CalendarEvent[];           // non-ignored, sorted by start
  transitionStarts: number[];
  appointmentEvents: CalendarEvent[];
  dayTags: Map<string, Set<string>>; // local date -> tags of events overlapping that date
  routineDates: Set<string>;
  visits: PlaceVisit[];              // sorted by arrival
  visitArrivals: number[];
  placeArrivals: Map<string, number[]>;
  placeTypeById: Map<string, string>;
  weatherByHour: Map<number, ChildDataset['weather'][number]>;
  sound: ChildDataset['sound'];
  soundStarts: number[];
  heartTimes: number[];
  heartBpm: number[];
  dailyHealth: Map<string, ChildDataset['dailyHealth'][number]>;
  hasPollen: boolean;
}

export function isQualifyingEpisode(ds: Pick<ChildDataset, 'child'>, e: ChildDataset['episodes'][number]): boolean {
  if (e.deleted) return false;
  if (!ds.child.modeledEpisodeTypes.includes(e.type)) return false;
  return e.intensity == null || e.intensity >= ds.child.minModeledIntensity;
}

export function buildIndex(ds: ChildDataset): DatasetIndex {
  const tz = ds.child.homeTz;
  const byTime = <T>(arr: T[], f: (x: T) => number) => [...arr].sort((a, b) => f(a) - f(b));
  const isFood = (m: Meal) => m.mealType !== 'drink' || m.items.some((i) => i.tags.includes('food'));
  const meals = byTime(ds.meals, (m) => m.eatenAt);
  const foodMeals = meals.filter(isFood);
  const tagTimes = (tag: string) => meals.filter((m) => m.items.some((i) => i.tags.includes(tag))).map((m) => m.eatenAt);

  const sleepByDate = new Map<string, SleepEntry>();
  for (const s of ds.sleep) {
    const d = localDateOf(s.sleepEnd, tz);
    const prev = sleepByDate.get(d);
    if (!prev || s.durationMin > prev.durationMin) sleepByDate.set(d, s);
  }

  const events = byTime(ds.calendar.filter((e) => !e.ignored), (e) => e.startAt);
  const dayTags = new Map<string, Set<string>>();
  for (const e of events) {
    let d = localDateOf(e.startAt, tz);
    const last = localDateOf(Math.max(e.startAt, e.endAt - 1), tz);
    for (let guard = 0; guard < 60; guard++) {
      let set = dayTags.get(d);
      if (!set) { set = new Set(); dayTags.set(d, set); }
      for (const t of e.tags) set.add(t);
      if (d === last) break;
      d = addDays(d, 1);
    }
  }

  const visits = byTime(ds.visits, (v) => v.arrivedAt);
  const placeArrivals = new Map<string, number[]>();
  for (const v of visits) if (v.placeId) {
    const arr = placeArrivals.get(v.placeId) ?? [];
    arr.push(v.arrivedAt);
    placeArrivals.set(v.placeId, arr);
  }
  const heart = byTime(ds.heart, (h) => h.time);
  const sound = byTime(ds.sound, (s) => s.start);
  const doses = ds.doses.filter((d) => d.scheduledFor != null);
  return {
    ds, tz,
    episodeTimes: ds.episodes.filter((e) => isQualifyingEpisode(ds, e)).map((e) => e.startedAt).sort((a, b) => a - b),
    foodMeals, foodMealTimes: foodMeals.map((m) => m.eatenAt),
    sugarTimes: tagTimes('high_sugar'), caffeineTimes: tagTimes('caffeine'),
    mealDates: new Set(meals.map((m) => localDateOf(m.eatenAt, tz))),
    sleepByDate,
    missedDoseTimes: doses.filter((d) => d.status === 'missed').map((d) => d.scheduledFor as number).sort((a, b) => a - b),
    lateDoseTimes: doses.filter((d) => d.status === 'late').map((d) => d.scheduledFor as number).sort((a, b) => a - b),
    medChangeTimes: ds.medicationChanges.map((c) => c.changedAt).sort((a, b) => a - b),
    events,
    transitionStarts: events.filter((e) => !e.allDay && e.tags.includes('transition')).map((e) => e.startAt),
    appointmentEvents: events.filter((e) => e.tags.includes('appointment')),
    dayTags,
    routineDates: new Set(ds.routineChanges.map((r) => r.localDate)),
    visits, visitArrivals: visits.map((v) => v.arrivedAt), placeArrivals,
    placeTypeById: new Map(ds.places.map((p) => [p.id, p.type])),
    weatherByHour: new Map(ds.weather.map((w) => [Math.floor(w.time / HOUR_MS) * HOUR_MS, w])),
    sound, soundStarts: sound.map((s) => s.start),
    heartTimes: heart.map((h) => h.time), heartBpm: heart.map((h) => h.bpm),
    dailyHealth: new Map(ds.dailyHealth.map((d) => [d.localDate, d])),
    hasPollen: ds.weather.some((w) => w.pollenIndex != null),
  };
}

// ---------- helpers ----------

/** The child's location at instant t, resolved by source priority (spec 11.4). */
export function placeAt(idx: DatasetIndex, t: number): { placeId: string | null; placeType: string } | null {
  let best: PlaceVisit | null = null;
  // visits are short-lived; scan back from the last arrival <= t
  const i = lowerBound(idx.visitArrivals, t + 1) - 1;
  for (let k = i; k >= 0 && k > i - 60; k--) {
    const v = idx.visits[k];
    if (v.arrivedAt <= t && (v.departedAt == null || v.departedAt > t)) {
      if (!best || VISIT_PRIORITY[v.source] > VISIT_PRIORITY[best.source]) best = v;
    }
  }
  return best ? { placeId: best.placeId, placeType: best.placeType } : null;
}

function sleepRefHours(idx: DatasetIndex, date: string): number {
  const hours: number[] = [];
  for (let i = 1; i <= 28; i++) { const s = idx.sleepByDate.get(addDays(date, -i)); if (s) hours.push(s.durationMin / 60); }
  return sleepReference(hours, idx.ds.child.typicalSleepHours);
}

/**
 * The child's usual sleep ("sleepRef"): the median of the nights in the 28 days before, once at least 7 are logged;
 * until then the typical hours from onboarding. Also used by the weekly digest (spec 21).
 */
export function sleepReference(hoursLast28: number[], typicalHours: number): number {
  return hoursLast28.length >= 7 ? (median(hoursLast28) as number) : typicalHours;
}

function weatherAt(idx: DatasetIndex, t: number) { return idx.weatherByHour.get(Math.floor(t / HOUR_MS) * HOUR_MS); }

/** Sound + temperature over [a, b) at the child's place: sensor at that place preferred, else phone. */
function soundWindow(idx: DatasetIndex, a: number, b: number, placeId: string | null, threshold: number):
  { loudMinutes: number; hasSound: boolean; meanTemp: number | null } {
  const from = lowerBound(idx.soundStarts, a - 3 * HOUR_MS);
  const to = lowerBound(idx.soundStarts, b);
  let sensorLoud = 0, sensorAny = false, phoneLoud = 0, phoneAny = false, tSum = 0, tW = 0;
  for (let i = from; i < to; i++) {
    const s = idx.sound[i];
    const sEnd = s.start + s.minutes * MINUTE_MS;
    const ov = (Math.min(sEnd, b) - Math.max(s.start, a)) / MINUTE_MS;
    if (ov <= 0) continue;
    if (s.source === 'sensor') {
      if (placeId == null || s.placeId !== placeId) continue;
      if (s.db != null) { sensorAny = true; if (s.db >= threshold) sensorLoud += ov; }
      if (s.tempC != null) { tSum += s.tempC * ov; tW += ov; }
    } else if (s.db != null) {
      phoneAny = true;
      if (s.db >= threshold) phoneLoud += ov;
    }
  }
  return {
    loudMinutes: sensorAny ? sensorLoud : phoneLoud,
    hasSound: sensorAny || phoneAny,
    meanTemp: tW > 0 ? tSum / tW : null,
  };
}

function meanHeart(idx: DatasetIndex, a: number, b: number): number | null {
  const i0 = lowerBound(idx.heartTimes, a), i1 = lowerBound(idx.heartTimes, b);
  if (i1 <= i0) return null;
  let s = 0;
  for (let i = i0; i < i1; i++) s += idx.heartBpm[i];
  return s / (i1 - i0);
}

function blockStartFor(idx: DatasetIndex, date: string, k: number): number {
  return zonedToUtc(date, k * (24 / BLOCKS_PER_DAY) * 60, idx.tz);
}

function illnessValue(idx: DatasetIndex, s: number): number {
  let v = 0;
  for (const il of idx.ds.illness) {
    const active = il.startedAt <= s && (il.endedAt == null || il.endedAt > s);
    const recent = il.endedAt != null && il.endedAt <= s && il.endedAt >= s - DAY_MS;
    if (active || recent) v = Math.max(v, il.severity / 3);
  }
  return clamp(v, 0, 1);
}

function eventsOverlapping(list: CalendarEvent[], a: number, b: number): CalendarEvent[] {
  return list.filter((e) => e.startAt < b && e.endAt > a);
}

// ---------- the builder ----------

export interface BuildOptions { mode: 'actual' | 'forecast'; now?: number; }

export function computeFeatures(idx: DatasetIndex, block: Block, opts: BuildOptions = { mode: 'actual' }): FeatureResult {
  const { ds } = idx;
  const s = block.start, e = block.end, D = block.localDate;
  const forecast = opts.mode === 'forecast';
  const now = opts.now ?? s;
  const known = forecast ? Math.min(now, s) : s; // information horizon
  const v: FeatureValues = {};
  const estimated: string[] = [];
  for (const def of FEATURE_REGISTRY) v[def.key] = 0;

  // --- baseline ---
  v.intercept = 1;
  const hour = block.index * (24 / BLOCKS_PER_DAY);
  v.tod_midday = hour >= 10 && hour < 14 ? 1 : 0;
  v.tod_afternoon = hour >= 14 && hour < 18 ? 1 : 0;
  v.tod_evening = hour >= 18 ? 1 : 0;
  const wd = isoWeekday(D);
  v.weekend = wd >= 6 ? 1 : 0;
  const tagsToday = idx.dayTags.get(D);
  const schoolWeekday = ds.child.schoolDays.includes(wd);
  v.school_day = schoolWeekday && !tagsToday?.has('no_school') ? 1 : 0;
  if (!forecast || s - now <= 4 * HOUR_MS) {
    v.recent_episode = countIn(idx.episodeTimes, s - 4 * HOUR_MS, Math.min(s, known + 1)) > 0 ? 1 : 0;
  } else {
    v.recent_episode = 0;
    estimated.push('recent_episode');
  }

  // --- sleep ---
  let sleepDeficitHours = 0;
  const lastNight = idx.sleepByDate.get(D);
  const sleepKnown = lastNight && lastNight.sleepEnd < e && (!forecast || lastNight.sleepEnd <= now);
  const ref = sleepRefHours(idx, D);
  if (sleepKnown && lastNight) {
    sleepDeficitHours = clamp(ref - lastNight.durationMin / 60, 0, 4);
    v.sleep_deficit = sleepDeficitHours;
    v.night_wakings = clamp(lastNight.nightWakings ?? 0, 0, 4);
  } else if (forecast) {
    v.sleep_deficit = 0;
    const wk: number[] = [];
    for (let i = 1; i <= 14; i++) { const n = idx.sleepByDate.get(addDays(D, -i))?.nightWakings; if (n != null) wk.push(n); }
    v.night_wakings = clamp(Math.round(median(wk) ?? 0), 0, 4);
    estimated.push('sleep_deficit', 'night_wakings');
  } else {
    v.sleep_missing = 1;
  }

  // --- food ---
  let lastMeal = -Infinity;
  const iMeal = lowerBound(idx.foodMealTimes, Math.min(s, known + 1)) - 1;
  if (iMeal >= 0) lastMeal = idx.foodMealTimes[iMeal];
  let mealEstimated = false;
  if (forecast && known < s) {
    // expected meals between now and block start at the child's typical meal times
    const typical = typicalMealMinutes(idx, localDateOf(now, idx.tz));
    for (const date of [addDays(D, -1), D]) for (const m of typical) {
      const t = zonedToUtc(date, m, idx.tz);
      if (t > now && t < s && t > lastMeal) { lastMeal = t; mealEstimated = true; }
    }
  }
  if (lastMeal >= s - 12 * HOUR_MS) {
    v.hunger_gap = clamp((s - lastMeal) / HOUR_MS - 3, 0, 3);
  } else {
    v.meal_missing = 1;
  }
  if (mealEstimated) estimated.push('hunger_gap');
  v.high_sugar_recent = countIn(idx.sugarTimes, s - 3 * HOUR_MS, Math.min(s, known + 1)) > 0 ? 1 : 0;
  v.caffeine_recent = countIn(idx.caffeineTimes, s - 6 * HOUR_MS, Math.min(s, known + 1)) > 0 ? 1 : 0;
  if (forecast && known < s) estimated.push('high_sugar_recent', 'caffeine_recent');

  // --- medication (pending doses are assumed taken on time in forecast mode) ---
  v.missed_dose = clamp(countIn(idx.missedDoseTimes, s - DAY_MS, Math.min(s, known + 1)), 0, 2);
  v.late_dose = countIn(idx.lateDoseTimes, s - 12 * HOUR_MS, Math.min(s, known + 1)) > 0 ? 1 : 0;
  let mc = 0;
  for (let i = lowerBound(idx.medChangeTimes, s - 21 * DAY_MS); i < idx.medChangeTimes.length && idx.medChangeTimes[i] < s; i++) {
    mc += Math.exp(-(s - idx.medChangeTimes[i]) / DAY_MS / 7);
  }
  v.med_change_recent = clamp(mc, 0, 2);

  // --- schedule (planned calendar info about the block is allowed) ---
  const transitions = countIn(idx.transitionStarts, s - 30 * MINUTE_MS, e);
  v.planned_transitions = clamp(transitions, 0, 3);
  const weekdayNoSchool = schoolWeekday && tagsToday?.has('no_school');
  v.unusual_day = idx.routineDates.has(D) || tagsToday?.has('unusual') || tagsToday?.has('travel') || tagsToday?.has('social') || weekdayNoSchool ? 1 : 0;
  v.appointment_near = eventsOverlapping(idx.appointmentEvents, s - 2 * HOUR_MS, e + 2 * HOUR_MS).length > 0 ? 1 : 0;

  // --- place ---
  let place = placeAt(idx, s);
  if (forecast && s > now) {
    place = expectedPlace(idx, D, block.index);
    const prevPlace = block.index > 0 ? expectedPlace(idx, D, block.index - 1) : place;
    v.arrival_recent = prevPlace && place && prevPlace.placeType !== place.placeType ? 1 : 0;
    estimated.push('arrival_recent', 'new_place', 'place_school', 'place_therapy_medical', 'place_store_public', 'place_other');
  } else {
    const a0 = lowerBound(idx.visitArrivals, s - HOUR_MS), a1 = lowerBound(idx.visitArrivals, s);
    for (let i = a0; i < a1; i++) if (idx.visits[i].source !== 'schedule_default') { v.arrival_recent = 1; break; }
  }
  const pt = place?.placeType ?? 'home';
  if (place) {
    if (pt === 'away_untagged') v.new_place = 1;
    else if (place.placeId && !(forecast && s > now)) {
      v.new_place = countIn(idx.placeArrivals.get(place.placeId) ?? [], -Infinity, s) - 1 < 3 ? 1 : 0;
    }
  }
  v.place_school = pt === 'school' ? 1 : 0;
  v.place_therapy_medical = pt === 'therapy' || pt === 'medical' ? 1 : 0;
  v.place_store_public = pt === 'store_public' || pt === 'park_outdoor' ? 1 : 0;
  v.place_other = pt === 'relative' || pt === 'other' ? 1 : 0;

  // --- sensory (90 minutes before the block) ---
  if (forecast && s - 90 * MINUTE_MS >= now) {
    const est = typicalSensory(idx, D, block.index, now);
    v.noise_high = est.noise;
    v.temp_uncomfortable = est.temp;
    estimated.push('noise_high', 'temp_uncomfortable');
  } else {
    const sw = soundWindow(idx, s - 90 * MINUTE_MS, Math.min(s, known), place?.placeId ?? null, ds.settings.noiseThresholdDb);
    if (sw.hasSound) v.noise_high = clamp(sw.loudMinutes / 30, 0, 3);
    else v.noise_missing = 1;
    if (sw.meanTemp != null) v.temp_uncomfortable = clamp((Math.abs(sw.meanTemp - 21.5) - 2) / 2, 0, 2);
  }

  // --- weather (forecast hours are part of the dataset) ---
  const w0 = weatherAt(idx, s), w6 = weatherAt(idx, s - 6 * HOUR_MS);
  if (w0?.pressureHpa != null && w6?.pressureHpa != null) v.pressure_change = clamp(Math.abs(w0.pressureHpa - w6.pressureHpa) / 3, 0, 3);
  if (w0?.temperatureC != null) { const T = w0.temperatureC; v.heat_or_cold = clamp(Math.max(0, (T - 30) / 5) + Math.max(0, (-5 - T) / 5), 0, 2); }
  if (w0?.usAqi != null) v.poor_air = clamp(Math.max(0, (w0.usAqi - 100) / 50), 0, 3);
  if (w0?.pollenIndex != null) v.pollen_high = w0.pollenIndex >= 2 ? 1 : 0;

  // --- health ---
  v.illness = illnessValue(idx, s);
  const steps14: number[] = [];
  for (let i = 1; i <= 14; i++) { const st = idx.dailyHealth.get(addDays(D, -i))?.steps; if (st != null) steps14.push(st); }
  const yest = idx.dailyHealth.get(addDays(D, -1))?.steps;
  const medSteps = median(steps14);
  if (yest != null && medSteps != null && medSteps > 0) v.low_activity_yesterday = yest < 0.5 * medSteps ? 1 : 0;

  // --- physiology ---
  const hist = (f: (d: NonNullable<ReturnType<typeof idx.dailyHealth.get>>) => number | null) => {
    const xs: number[] = [];
    for (let i = 1; i <= 14; i++) { const d = idx.dailyHealth.get(addDays(D, -i)); const x = d ? f(d) : null; if (x != null) xs.push(x); }
    return xs;
  };
  const latestDaily = (f: (d: NonNullable<ReturnType<typeof idx.dailyHealth.get>>) => number | null) => {
    for (let i = 0; i <= 7; i++) { const d = idx.dailyHealth.get(addDays(D, -i)); const x = d ? f(d) : null; if (x != null) return x; }
    return null;
  };
  const rhr = latestDaily((d) => d.restingHr), rhrMed = median(hist((d) => d.restingHr));
  if (rhr != null && rhrMed != null) v.resting_hr_up = clamp((rhr - rhrMed) / 5, -2, 3);
  const hrv = latestDaily((d) => d.hrv), hrvMed = median(hist((d) => d.hrv));
  if (hrv != null && hrvMed != null && hrvMed > 0) v.hrv_down = clamp((hrvMed - hrv) / (0.15 * hrvMed), -2, 3);
  if (forecast && s - HOUR_MS >= now) {
    v.hr_elevated_pre = 0;
    estimated.push('hr_elevated_pre');
  } else {
    const pre = meanHeart(idx, s - HOUR_MS, Math.min(s, known));
    if (pre == null) v.physio_missing = 1;
    else {
      const past: number[] = [];
      for (let i = 1; i <= 14; i++) {
        const bs = blockStartFor(idx, addDays(D, -i), block.index);
        const m = meanHeart(idx, bs - HOUR_MS, bs);
        if (m != null) past.push(m);
      }
      const med = median(past);
      if (med != null) v.hr_elevated_pre = clamp((pre - med) / 10, -2, 3);
    }
  }

  return { values: v, estimated, params: { sleepDeficitHours, transitions } };
}

// ---------- forecast-mode estimators (spec 12.7) ----------

/** Typical local minute per meal type over the last 14 days (needs >= 5 samples). */
function typicalMealMinutes(idx: DatasetIndex, today: string): number[] {
  const byType = new Map<string, number[]>();
  const from = zonedToUtc(addDays(today, -14), 0, idx.tz);
  for (const m of idx.foodMeals) {
    if (m.eatenAt < from) continue;
    const arr = byType.get(m.mealType) ?? [];
    arr.push(localMinuteOf(m.eatenAt, idx.tz));
    byType.set(m.mealType, arr);
  }
  const out: number[] = [];
  for (const arr of byType.values()) if (arr.length >= 5) out.push(Math.round(median(arr) as number));
  return out;
}

/** Most common place type at (weekday, block index) over the last 4 matching weekdays; else home. */
function expectedPlace(idx: DatasetIndex, date: string, k: number): { placeId: string | null; placeType: string } {
  const counts = new Map<string, { n: number; placeId: string | null }>();
  for (let w = 1; w <= 4; w++) {
    const p = placeAt(idx, blockStartFor(idx, addDays(date, -7 * w), k));
    if (!p) continue;
    const c = counts.get(p.placeType) ?? { n: 0, placeId: p.placeId };
    c.n++;
    counts.set(p.placeType, c);
  }
  let best: { placeId: string | null; placeType: string } = { placeId: null, placeType: 'home' };
  let bestN = 0;
  for (const [type, c] of counts) if (c.n > bestN) { bestN = c.n; best = { placeId: c.placeId, placeType: type }; }
  return best;
}

/** Median noise/temperature feature values for this block index over the last 14 days. */
function typicalSensory(idx: DatasetIndex, date: string, k: number, now: number): { noise: number; temp: number } {
  const noise: number[] = [], temp: number[] = [];
  for (let i = 1; i <= 14; i++) {
    const bs = blockStartFor(idx, addDays(date, -i), k);
    if (bs > now) continue;
    const place = placeAt(idx, bs);
    const sw = soundWindow(idx, bs - 90 * MINUTE_MS, bs, place?.placeId ?? null, idx.ds.settings.noiseThresholdDb);
    if (sw.hasSound) noise.push(clamp(sw.loudMinutes / 30, 0, 3));
    if (sw.meanTemp != null) temp.push(clamp((Math.abs(sw.meanTemp - 21.5) - 2) / 2, 0, 2));
  }
  return { noise: median(noise) ?? 0, temp: median(temp) ?? 0 };
}
