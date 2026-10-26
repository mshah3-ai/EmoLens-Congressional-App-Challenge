/**
 * Spec 30.1 "Features": table-driven tests per feature (spec 12.4) with hand-built datasets, including
 * DST-transition days, missing data (missingness indicators), clamps, and the leakage rule (12.3).
 *
 * Block index k covers local [2k:00, 2k+2:00): k=3 is 6-8 am, k=4 8-10 am, k=6 noon-2 pm, k=7 2-4 pm.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CalendarTag, ChildDataset, PlaceVisit, SoundInterval, VisitSource, VisitPlaceType } from '@emolens/shared';
import { DAY_MS, HOUR_MS, MINUTE_MS } from '@emolens/shared';
import {
  addDays, blocksForDate, buildIndex, computeFeatures, enabledFeatureKeys, enabledRequirements, localMinuteOf, type BuildOptions,
} from '../src/index';
import { MONDAY, SATURDAY, TZ, at, blockOf, feats, makeChild, makeDataset, makeSettings, sleepEnding, uid } from './helpers';

// ---------- small builders ----------
const ep = (t: number, over: Partial<ChildDataset['episodes'][number]> = {}) =>
  ({ id: uid('e'), startedAt: t, durationMin: 10, type: 'meltdown' as const, intensity: 3, ...over });
const meal = (t: number, mealType: ChildDataset['meals'][number]['mealType'] = 'lunch', tags: string[] = []) =>
  ({ id: uid('m'), eatenAt: t, mealType, items: [{ name: 'food', tags }] });
const dose = (t: number, status: ChildDataset['doses'][number]['status']) =>
  ({ id: uid('d'), medicationId: 'med1', scheduledFor: t, takenAt: null, status });
const event = (startAt: number, endAt: number, tags: CalendarTag[], over: Partial<ChildDataset['calendar'][number]> = {}) =>
  ({ id: uid('ev'), startAt, endAt, allDay: false, tags, ignored: false, ...over });
const allDay = (date: string, tags: CalendarTag[]) => event(at(date, '00:00'), at(addDays(date, 1), '00:00'), tags, { allDay: true });
const PLACES: ChildDataset['places'] = [
  { id: 'home', label: 'Home', type: 'home' }, { id: 'school', label: 'School', type: 'school' },
  { id: 'ther', label: 'OT', type: 'therapy' }, { id: 'doc', label: 'Clinic', type: 'medical' },
  { id: 'shop', label: 'Shop', type: 'store_public' }, { id: 'park', label: 'Park', type: 'park_outdoor' },
  { id: 'gma', label: 'Grandma', type: 'relative' }, { id: 'oth', label: 'Other', type: 'other' },
];
const visit = (placeId: string | null, placeType: VisitPlaceType, arrivedAt: number, departedAt: number | null,
  source: VisitSource = 'geofence_parent'): PlaceVisit => ({ id: uid('v'), placeId, placeType, arrivedAt, departedAt, source });
const sound = (start: number, minutes: number, db: number | null, over: Partial<SoundInterval> = {}): SoundInterval =>
  ({ start, minutes, db, tempC: null, placeId: null, source: 'phone', ...over });
const weather = (t: number, over: Partial<ChildDataset['weather'][number]> = {}) =>
  ({ time: t, temperatureC: null, pressureHpa: null, usAqi: null, pollenIndex: null, isForecast: false, ...over });
const daily = (date: string, over: Partial<ChildDataset['dailyHealth'][number]> = {}) =>
  ({ localDate: date, restingHr: null, hrv: null, steps: null, ...over });
/** One dailyHealth row per day for the 14 days before `date`. */
const history14 = (date: string, over: Partial<ChildDataset['dailyHealth'][number]>) =>
  Array.from({ length: 14 }, (_, i) => daily(addDays(date, -(i + 1)), over));

interface Case {
  name: string;
  ds: Partial<ChildDataset>;
  date?: string;
  k: number;
  expect: Record<string, number>;
  opts?: BuildOptions;
}

const s12 = at(MONDAY, '12:00'); // block k=6 start
const s8 = at(MONDAY, '08:00');  // block k=4 start

const CASES: Case[] = [
  // ----- baseline -----
  { name: 'morning school-day block: reference time of day', ds: {}, k: 4,
    expect: { intercept: 1, tod_midday: 0, tod_afternoon: 0, tod_evening: 0, weekend: 0, school_day: 1 } },
  { name: 'tod_midday for 10:00 and 12:00 blocks', ds: {}, k: 5, expect: { tod_midday: 1, tod_afternoon: 0 } },
  { name: 'tod_midday at noon', ds: {}, k: 6, expect: { tod_midday: 1 } },
  { name: 'tod_afternoon at 14:00', ds: {}, k: 7, expect: { tod_afternoon: 1, tod_midday: 0, tod_evening: 0 } },
  { name: 'tod_evening at 18:00 and 20:00', ds: {}, k: 10, expect: { tod_evening: 1, tod_afternoon: 0 } },
  { name: 'weekend on Saturday, no school', ds: {}, date: SATURDAY, k: 4, expect: { weekend: 1, school_day: 0, unusual_day: 0 } },
  { name: 'no_school tag on a school weekday: not a school day, and unusual', ds: { calendar: [allDay(MONDAY, ['no_school'])] },
    k: 4, expect: { school_day: 0, unusual_day: 1 } },
  { name: 'no_school tag on a Saturday is not unusual', ds: { calendar: [allDay(SATURDAY, ['no_school'])] }, date: SATURDAY,
    k: 4, expect: { school_day: 0, unusual_day: 0 } },
  { name: 'recent_episode: episode 3 h before block start', ds: { episodes: [ep(at(MONDAY, '11:00'))] }, k: 7, expect: { recent_episode: 1 } },
  { name: 'recent_episode: window starts exactly 4 h before', ds: { episodes: [ep(at(MONDAY, '10:00'))] }, k: 7, expect: { recent_episode: 1 } },
  { name: 'recent_episode: 4 h 1 min before is outside', ds: { episodes: [ep(at(MONDAY, '09:59'))] }, k: 7, expect: { recent_episode: 0 } },
  { name: 'recent_episode: non-modeled type ignored', ds: { episodes: [ep(at(MONDAY, '11:00'), { type: 'other' })] }, k: 7, expect: { recent_episode: 0 } },
  { name: 'recent_episode: intensity below minimum ignored', ds: { episodes: [ep(at(MONDAY, '11:00'), { intensity: 1 })] }, k: 7, expect: { recent_episode: 0 } },
  { name: 'recent_episode: null intensity counts', ds: { episodes: [ep(at(MONDAY, '11:00'), { intensity: null })] }, k: 7, expect: { recent_episode: 1 } },
  { name: 'recent_episode: deleted episode ignored', ds: { episodes: [ep(at(MONDAY, '11:00'), { deleted: true })] }, k: 7, expect: { recent_episode: 0 } },
  { name: 'LEAKAGE: episode inside the block does not set recent_episode', ds: { episodes: [ep(at(MONDAY, '14:30'))] }, k: 7, expect: { recent_episode: 0 } },

  // ----- sleep -----
  { name: 'no sleep entry: sleep_missing = 1, deficit 0', ds: {}, k: 4, expect: { sleep_missing: 1, sleep_deficit: 0, night_wakings: 0 } },
  { name: 'fewer than 7 nights: reference is typical_sleep_hours (10 h)', ds: { sleep: [sleepEnding(MONDAY, '06:30', 8, 2)] }, k: 4,
    expect: { sleep_deficit: 2, night_wakings: 2, sleep_missing: 0 } },
  { name: 'deficit clamps at 4 h', ds: { sleep: [sleepEnding(MONDAY, '06:30', 4)] }, k: 4, expect: { sleep_deficit: 4 } },
  { name: 'longer than usual sleep: deficit 0', ds: { sleep: [sleepEnding(MONDAY, '06:30', 11)] }, k: 4, expect: { sleep_deficit: 0, sleep_missing: 0 } },
  { name: 'night_wakings clamps at 4', ds: { sleep: [sleepEnding(MONDAY, '06:30', 10, 7)] }, k: 4, expect: { night_wakings: 4 } },
  { name: 'with >= 7 prior nights the reference is their median', ds: {
    sleep: [...[9, 9, 9, 9, 11, 11, 9].map((h, i) => sleepEnding(addDays(MONDAY, -(i + 1)), '06:30', h)), sleepEnding(MONDAY, '06:30', 8)],
  }, k: 4, expect: { sleep_deficit: 1 } },
  { name: 'sleep ending after the block ends is not "last night" for that block', ds: { sleep: [sleepEnding(MONDAY, '08:30', 8)] }, k: 3,
    expect: { sleep_missing: 1, sleep_deficit: 0 } },
  { name: 'sleep ending inside the block counts (DECISIONS #5)', ds: { sleep: [sleepEnding(MONDAY, '08:30', 8)] }, k: 4,
    expect: { sleep_missing: 0, sleep_deficit: 2 } },

  // ----- food -----
  { name: 'no meals in 12 h: meal_missing = 1', ds: {}, k: 6, expect: { meal_missing: 1, hunger_gap: 0 } },
  { name: 'hunger_gap = hours since meal - 3', ds: { meals: [meal(at(MONDAY, '07:00'), 'breakfast')] }, k: 6, expect: { hunger_gap: 2, meal_missing: 0 } },
  { name: 'hunger_gap clamps at 3', ds: { meals: [meal(at(MONDAY, '06:00'), 'breakfast')] }, k: 7, expect: { hunger_gap: 3 } },
  { name: 'meal 13 h ago: missing', ds: { meals: [meal(s12 - 13 * HOUR_MS, 'dinner')] }, k: 6, expect: { meal_missing: 1, hunger_gap: 0 } },
  { name: 'plain drinks do not reset the hunger gap', ds: { meals: [meal(at(MONDAY, '07:00'), 'breakfast'), meal(at(MONDAY, '11:00'), 'drink')] },
    k: 6, expect: { hunger_gap: 2 } },
  { name: 'drinks tagged food do count', ds: { meals: [meal(at(MONDAY, '07:00'), 'breakfast'), meal(at(MONDAY, '11:00'), 'drink', ['food'])] },
    k: 6, expect: { hunger_gap: 0 } },
  { name: 'LEAKAGE: a meal inside the block does not change the gap', ds: { meals: [meal(at(MONDAY, '07:00'), 'breakfast'), meal(at(MONDAY, '12:30'))] },
    k: 6, expect: { hunger_gap: 2 } },
  { name: 'high_sugar_recent within 3 h', ds: { meals: [meal(at(MONDAY, '09:00'), 'snack', ['high_sugar'])] }, k: 6, expect: { high_sugar_recent: 1 } },
  { name: 'high_sugar_recent: 3 h 1 min ago is outside', ds: { meals: [meal(at(MONDAY, '08:59'), 'snack', ['high_sugar'])] }, k: 6, expect: { high_sugar_recent: 0 } },
  { name: 'caffeine_recent within 6 h', ds: { meals: [meal(at(MONDAY, '06:00'), 'drink', ['caffeine'])] }, k: 6, expect: { caffeine_recent: 1 } },
  { name: 'caffeine_recent: 6 h 1 min ago is outside', ds: { meals: [meal(at(MONDAY, '05:59'), 'drink', ['caffeine'])] }, k: 6, expect: { caffeine_recent: 0 } },

  // ----- medication -----
  { name: 'missed_dose counts missed doses in 24 h and clamps at 2', ds: {
    doses: [dose(s12 - 23 * HOUR_MS, 'missed'), dose(at(MONDAY, '08:00'), 'missed'), dose(at(MONDAY, '11:00'), 'missed')],
  }, k: 6, expect: { missed_dose: 2 } },
  { name: 'missed_dose: 1 in window, 1 just outside 24 h', ds: { doses: [dose(s12 - 24 * HOUR_MS - MINUTE_MS, 'missed'), dose(at(MONDAY, '08:00'), 'missed')] },
    k: 6, expect: { missed_dose: 1 } },
  { name: 'taken doses do not count', ds: { doses: [dose(at(MONDAY, '08:00'), 'taken')] }, k: 6, expect: { missed_dose: 0, late_dose: 0 } },
  { name: 'late_dose within 12 h', ds: { doses: [dose(at(MONDAY, '08:00'), 'late')] }, k: 6, expect: { late_dose: 1 } },
  { name: 'late_dose 13 h ago is outside', ds: { doses: [dose(s12 - 13 * HOUR_MS, 'late')] }, k: 6, expect: { late_dose: 0 } },
  { name: 'med_change_recent decays as exp(-days/7)', ds: { medicationChanges: [{ medicationId: 'med1', changedAt: s12 - 7 * DAY_MS, changeType: 'dose_change' }] },
    k: 6, expect: { med_change_recent: Math.exp(-1) } },
  { name: 'med_change_recent clamps at 2', ds: { medicationChanges: [1, 2, 3].map((m) => ({ medicationId: 'med1', changedAt: s12 - m * MINUTE_MS, changeType: 'start' as const })) },
    k: 6, expect: { med_change_recent: 2 } },
  { name: 'med_change_recent ignores changes older than 21 days', ds: { medicationChanges: [{ medicationId: 'med1', changedAt: s12 - 22 * DAY_MS, changeType: 'start' }] },
    k: 6, expect: { med_change_recent: 0 } },

  // ----- schedule -----
  { name: 'planned_transitions: window is [start - 30 min, end); planned events inside the block are allowed', ds: {
    calendar: [event(s8 - 30 * MINUTE_MS, s8, ['transition']), event(at(MONDAY, '09:59'), at(MONDAY, '10:30'), ['transition']),
      event(s8 - 31 * MINUTE_MS, s8, ['transition']), event(at(MONDAY, '10:00'), at(MONDAY, '10:30'), ['transition'])],
  }, k: 4, expect: { planned_transitions: 2 } },
  { name: 'planned_transitions clamps at 3; ignored and all-day events excluded', ds: {
    calendar: [...[0, 10, 20, 30].map((m) => event(s8 + m * MINUTE_MS, s8 + (m + 5) * MINUTE_MS, ['transition'])),
      event(s8, s8 + HOUR_MS, ['transition'], { ignored: true })],
  }, k: 4, expect: { planned_transitions: 3 } },
  { name: 'ignored/all-day transitions alone count 0', ds: {
    calendar: [event(s8, s8 + HOUR_MS, ['transition'], { ignored: true }), allDay(MONDAY, ['transition'])],
  }, k: 4, expect: { planned_transitions: 0 } },
  { name: 'unusual_day from a routine change', ds: { routineChanges: [{ id: 'r', localDate: MONDAY, startAt: null, severity: 2 }] }, k: 4, expect: { unusual_day: 1 } },
  { name: 'unusual_day from a travel event', ds: { calendar: [event(at(MONDAY, '15:00'), at(MONDAY, '16:00'), ['travel'])] }, k: 4, expect: { unusual_day: 1 } },
  { name: 'unusual_day from a social event', ds: { calendar: [event(at(MONDAY, '15:00'), at(MONDAY, '16:00'), ['social'])] }, k: 4, expect: { unusual_day: 1 } },
  { name: 'unusual_day from an unusual-tagged event', ds: { calendar: [allDay(MONDAY, ['unusual'])] }, k: 4, expect: { unusual_day: 1 } },
  { name: 'routine change on another day does not count', ds: { routineChanges: [{ id: 'r', localDate: addDays(MONDAY, 1), startAt: null, severity: 2 }] },
    k: 4, expect: { unusual_day: 0 } },
  { name: 'appointment_near: overlaps [start - 2 h, end + 2 h)', ds: { calendar: [event(at(MONDAY, '11:00'), at(MONDAY, '11:30'), ['appointment'])] },
    k: 4, expect: { appointment_near: 1 } },
  { name: 'appointment_near: starting at end + 2 h is outside', ds: { calendar: [event(at(MONDAY, '12:00'), at(MONDAY, '13:00'), ['appointment'])] },
    k: 4, expect: { appointment_near: 0 } },
  { name: 'appointment_near: ending exactly at start - 2 h is outside', ds: { calendar: [event(at(MONDAY, '05:00'), at(MONDAY, '06:00'), ['appointment'])] },
    k: 4, expect: { appointment_near: 0 } },

  // ----- place -----
  { name: 'at school, just arrived, first visit', ds: { places: PLACES, visits: [visit('school', 'school', at(MONDAY, '07:50'), at(MONDAY, '15:00'))] },
    k: 4, expect: { place_school: 1, arrival_recent: 1, new_place: 1, place_other: 0 } },
  { name: 'at school with 3 prior visits: not new', ds: {
    places: PLACES,
    visits: [1, 2, 3].map((i) => visit('school', 'school', at(addDays(MONDAY, -i), '07:50'), at(addDays(MONDAY, -i), '15:00')))
      .concat([visit('school', 'school', at(MONDAY, '07:50'), at(MONDAY, '15:00'))]),
  }, k: 4, expect: { place_school: 1, new_place: 0 } },
  { name: 'arrival 61 min before block start is not recent', ds: { places: PLACES, visits: [visit('school', 'school', at(MONDAY, '06:59'), null)] },
    k: 4, expect: { arrival_recent: 0, place_school: 1 } },
  { name: 'schedule_default visits never count as arrivals', ds: { places: PLACES, visits: [visit('school', 'school', at(MONDAY, '07:30'), null, 'schedule_default')] },
    k: 4, expect: { arrival_recent: 0, place_school: 1 } },
  { name: 'therapy -> place_therapy_medical', ds: { places: PLACES, visits: [visit('ther', 'therapy', at(MONDAY, '06:00'), null)] }, k: 4, expect: { place_therapy_medical: 1 } },
  { name: 'medical -> place_therapy_medical', ds: { places: PLACES, visits: [visit('doc', 'medical', at(MONDAY, '06:00'), null)] }, k: 4, expect: { place_therapy_medical: 1 } },
  { name: 'store_public -> place_store_public', ds: { places: PLACES, visits: [visit('shop', 'store_public', at(MONDAY, '06:00'), null)] }, k: 4, expect: { place_store_public: 1 } },
  { name: 'park_outdoor -> place_store_public', ds: { places: PLACES, visits: [visit('park', 'park_outdoor', at(MONDAY, '06:00'), null)] }, k: 4, expect: { place_store_public: 1 } },
  { name: 'relative -> place_other', ds: { places: PLACES, visits: [visit('gma', 'relative', at(MONDAY, '06:00'), null)] }, k: 4, expect: { place_other: 1 } },
  { name: 'other -> place_other', ds: { places: PLACES, visits: [visit('oth', 'other', at(MONDAY, '06:00'), null)] }, k: 4, expect: { place_other: 1 } },
  { name: 'untagged place -> new_place', ds: { places: PLACES, visits: [visit(null, 'away_untagged', at(MONDAY, '06:00'), null)] }, k: 4,
    expect: { new_place: 1, place_school: 0, place_other: 0 } },
  { name: 'no visit: home, all place features 0', ds: { places: PLACES }, k: 4,
    expect: { new_place: 0, arrival_recent: 0, place_school: 0, place_therapy_medical: 0, place_store_public: 0, place_other: 0 } },
  { name: 'departed before the block: back to home', ds: { places: PLACES, visits: [visit('school', 'school', at(MONDAY, '06:00'), at(MONDAY, '07:00'))] }, k: 4,
    expect: { place_school: 0 } },
  { name: 'source priority: manual beats parent geofence', ds: {
    places: PLACES, visits: [visit('home', 'home', at(MONDAY, '06:00'), null, 'geofence_parent'), visit('park', 'park_outdoor', at(MONDAY, '06:10'), null, 'manual')],
  }, k: 4, expect: { place_store_public: 1 } },
  { name: 'source priority: child device beats manual', ds: {
    places: PLACES, visits: [visit('park', 'park_outdoor', at(MONDAY, '06:00'), null, 'manual'), visit('school', 'school', at(MONDAY, '06:10'), null, 'geofence_child_device')],
  }, k: 4, expect: { place_school: 1, place_store_public: 0 } },

  // ----- sensory -----
  { name: 'noise_high = loud minutes in the 90 min before / 30', ds: { sound: [sound(s8 - 90 * MINUTE_MS, 60, 75)] }, k: 4, expect: { noise_high: 2, noise_missing: 0 } },
  { name: 'noise_high at its cap of 3', ds: { sound: [sound(s8 - 3 * HOUR_MS, 180, 85)] }, k: 4, expect: { noise_high: 3 } },
  { name: 'quiet sound: 0 and not missing', ds: { sound: [sound(s8 - 90 * MINUTE_MS, 90, 60)] }, k: 4, expect: { noise_high: 0, noise_missing: 0 } },
  { name: 'no sound data: noise_missing = 1', ds: {}, k: 4, expect: { noise_high: 0, noise_missing: 1 } },
  { name: 'LEAKAGE: loud sound inside the block is ignored', ds: { sound: [sound(s8, 90, 90)] }, k: 4, expect: { noise_high: 0, noise_missing: 1 } },
  { name: 'noise threshold setting is respected', ds: { settings: makeSettings({ noiseThresholdDb: 80 }), sound: [sound(s8 - 90 * MINUTE_MS, 90, 75)] }, k: 4,
    expect: { noise_high: 0 } },
  { name: 'sensor at the child\'s place is preferred over the phone', ds: {
    places: PLACES, visits: [visit('home', 'home', at(MONDAY, '05:00'), null)],
    sound: [sound(s8 - 30 * MINUTE_MS, 30, 75, { source: 'sensor', placeId: 'home' }), sound(s8 - 90 * MINUTE_MS, 90, 80)],
  }, k: 4, expect: { noise_high: 1 } },
  { name: 'a sensor at another place is ignored (phone used)', ds: {
    places: PLACES, visits: [visit('home', 'home', at(MONDAY, '05:00'), null)],
    sound: [sound(s8 - 30 * MINUTE_MS, 30, 75, { source: 'sensor', placeId: 'school' }), sound(s8 - 90 * MINUTE_MS, 90, 80)],
  }, k: 4, expect: { noise_high: 3 } },
  { name: 'temp_uncomfortable = (|t - 21.5| - 2) / 2', ds: {
    places: PLACES, visits: [visit('home', 'home', at(MONDAY, '05:00'), null)],
    sound: [sound(s8 - 90 * MINUTE_MS, 90, 50, { source: 'sensor', placeId: 'home', tempC: 25.5 })],
  }, k: 4, expect: { temp_uncomfortable: 1 } },
  { name: 'temp_uncomfortable clamps at 2; comfortable -> 0', ds: {
    places: PLACES, visits: [visit('home', 'home', at(MONDAY, '05:00'), null)],
    sound: [sound(s8 - 90 * MINUTE_MS, 90, 50, { source: 'sensor', placeId: 'home', tempC: 12 })],
  }, k: 4, expect: { temp_uncomfortable: 2 } },
  { name: 'LEAKAGE: indoor temperature inside the block is ignored', ds: {
    places: PLACES, visits: [visit('home', 'home', at(MONDAY, '05:00'), null)],
    sound: [sound(s8 - 90 * MINUTE_MS, 90, 50, { source: 'sensor', placeId: 'home', tempC: 22 }), sound(s8, 60, 50, { source: 'sensor', placeId: 'home', tempC: 35 })],
  }, k: 4, expect: { temp_uncomfortable: 0 } },

  // ----- weather -----
  { name: 'pressure_change = |dP over 6 h| / 3', ds: { weather: [weather(s8, { pressureHpa: 1010 }), weather(s8 - 6 * HOUR_MS, { pressureHpa: 1016 })] }, k: 4,
    expect: { pressure_change: 2 } },
  { name: 'pressure_change clamps at 3', ds: { weather: [weather(s8, { pressureHpa: 1000 }), weather(s8 - 6 * HOUR_MS, { pressureHpa: 1013 })] }, k: 4,
    expect: { pressure_change: 3 } },
  { name: 'pressure_change missing 6-h value -> 0', ds: { weather: [weather(s8, { pressureHpa: 1000 })] }, k: 4, expect: { pressure_change: 0 } },
  { name: 'heat_or_cold: 35 C -> 1', ds: { weather: [weather(s8, { temperatureC: 35 })] }, k: 4, expect: { heat_or_cold: 1 } },
  { name: 'heat_or_cold clamps at 2', ds: { weather: [weather(s8, { temperatureC: 45 })] }, k: 4, expect: { heat_or_cold: 2 } },
  { name: 'heat_or_cold: -10 C -> 1', ds: { weather: [weather(s8, { temperatureC: -10 })] }, k: 4, expect: { heat_or_cold: 1 } },
  { name: 'heat_or_cold: mild -> 0', ds: { weather: [weather(s8, { temperatureC: 20 })] }, k: 4, expect: { heat_or_cold: 0 } },
  { name: 'poor_air: AQI 150 -> 1', ds: { weather: [weather(s8, { usAqi: 150 })] }, k: 4, expect: { poor_air: 1 } },
  { name: 'poor_air clamps at 3', ds: { weather: [weather(s8, { usAqi: 400 })] }, k: 4, expect: { poor_air: 3 } },
  { name: 'poor_air: good air -> 0', ds: { weather: [weather(s8, { usAqi: 80 })] }, k: 4, expect: { poor_air: 0 } },
  { name: 'pollen_high when index >= 2', ds: { weather: [weather(s8, { pollenIndex: 2 })] }, k: 4, expect: { pollen_high: 1 } },
  { name: 'pollen_high: index 1 -> 0', ds: { weather: [weather(s8, { pollenIndex: 1 })] }, k: 4, expect: { pollen_high: 0 } },

  // ----- health -----
  { name: 'illness active: severity / 3', ds: { illness: [{ id: 'i', startedAt: s8 - DAY_MS, endedAt: null, severity: 2, kind: 'cold' }] }, k: 4,
    expect: { illness: 2 / 3 } },
  { name: 'illness ended 23 h ago still counts', ds: { illness: [{ id: 'i', startedAt: s8 - 3 * DAY_MS, endedAt: s8 - 23 * HOUR_MS, severity: 3, kind: 'cold' }] }, k: 4,
    expect: { illness: 1 } },
  { name: 'illness ended 25 h ago does not count', ds: { illness: [{ id: 'i', startedAt: s8 - 3 * DAY_MS, endedAt: s8 - 25 * HOUR_MS, severity: 3, kind: 'cold' }] }, k: 4,
    expect: { illness: 0 } },
  { name: 'LEAKAGE: illness starting inside the block does not count', ds: { illness: [{ id: 'i', startedAt: s8 + HOUR_MS, endedAt: null, severity: 3, kind: 'cold' }] }, k: 4,
    expect: { illness: 0 } },
  { name: 'low_activity_yesterday: < 50% of 14-day median', ds: { dailyHealth: [...history14(addDays(MONDAY, -1), { steps: 10000 }), daily(addDays(MONDAY, -1), { steps: 4000 })] },
    k: 4, expect: { low_activity_yesterday: 1 } },
  { name: 'low_activity_yesterday: 60% -> 0', ds: { dailyHealth: [...history14(addDays(MONDAY, -1), { steps: 10000 }), daily(addDays(MONDAY, -1), { steps: 6000 })] },
    k: 4, expect: { low_activity_yesterday: 0 } },

  // ----- physiology -----
  { name: 'resting_hr_up = (today - 14-day median) / 5', ds: { dailyHealth: [...history14(MONDAY, { restingHr: 60 }), daily(MONDAY, { restingHr: 70 })] }, k: 4,
    expect: { resting_hr_up: 2 } },
  { name: 'resting_hr_up clamps to [-2, 3]', ds: { dailyHealth: [...history14(MONDAY, { restingHr: 60 }), daily(MONDAY, { restingHr: 90 })] }, k: 4,
    expect: { resting_hr_up: 3 } },
  { name: 'resting_hr_up lower clamp', ds: { dailyHealth: [...history14(MONDAY, { restingHr: 60 }), daily(MONDAY, { restingHr: 40 })] }, k: 4,
    expect: { resting_hr_up: -2 } },
  { name: 'hrv_down = (median - latest) / (0.15 median)', ds: { dailyHealth: [...history14(MONDAY, { hrv: 50 }), daily(MONDAY, { hrv: 35 })] }, k: 4,
    expect: { hrv_down: 2 } },
  { name: 'no heart data in the 60 min before: physio_missing = 1', ds: {}, k: 4, expect: { physio_missing: 1, hr_elevated_pre: 0 } },
];

function hrWindow(date: string, k: number, bpm: number, offsetMin: number[]) {
  const s = blockOf(date, k).start;
  return offsetMin.map((m) => ({ time: s + m * MINUTE_MS, bpm }));
}
const past14Hr = (k: number) => Array.from({ length: 14 }, (_, i) => hrWindow(addDays(MONDAY, -(i + 1)), k, 80, [-50, -30, -10])).flat();
CASES.push(
  { name: 'hr_elevated_pre = (mean HR in 60 min before - 14-day median for this block) / 10',
    ds: { heart: [...past14Hr(4), ...hrWindow(MONDAY, 4, 100, [-50, -30, -10])] }, k: 4, expect: { hr_elevated_pre: 2, physio_missing: 0 } },
  { name: 'LEAKAGE: heart rate inside the block is ignored',
    ds: { heart: [...past14Hr(4), ...hrWindow(MONDAY, 4, 80, [-50, -30, -10]), ...hrWindow(MONDAY, 4, 160, [5, 30, 60])] }, k: 4,
    expect: { hr_elevated_pre: 0, physio_missing: 0 } },
  { name: 'hr_elevated_pre clamps at 3', ds: { heart: [...past14Hr(4), ...hrWindow(MONDAY, 4, 140, [-30])] }, k: 4, expect: { hr_elevated_pre: 3 } },
);

function check(values: Record<string, number>, expect: Record<string, number>, label: string) {
  for (const [k, v] of Object.entries(expect)) {
    assert.ok(k in values, `${label}: unknown feature ${k}`);
    assert.ok(Math.abs(values[k] - v) < 1e-9, `${label}: ${k} = ${values[k]}, expected ${v}`);
  }
}

for (const c of CASES) {
  test(`feature: ${c.name}`, () => {
    const ds = makeDataset(c.ds);
    check(feats(ds, c.date ?? MONDAY, c.k, c.opts), c.expect, c.name);
  });
}

test('every feature in the registry is covered by at least one case', () => {
  const covered = new Set(CASES.flatMap((c) => Object.keys(c.expect)));
  const values = feats(makeDataset(), MONDAY, 4);
  const missing = Object.keys(values).filter((k) => !covered.has(k));
  assert.deepEqual(missing, []);
});

// ---------- DST ----------

test('DST spring-forward day (2026-03-08): 23-hour day, one 60-minute block, awake blocks start on the hour', () => {
  const blocks = blocksForDate('2026-03-08', makeChild());
  assert.equal(blocks.reduce((a, b) => a + b.minutes, 0), 23 * 60);
  assert.deepEqual(blocks.map((b) => b.minutes).filter((m) => m !== 120), [60]);
  for (const b of blocks.filter((x) => x.awake)) assert.equal(localMinuteOf(b.start, TZ), b.index * 120);
  // blocks tile the day with no gaps or overlaps
  for (let k = 1; k < 12; k++) assert.equal(blocks[k].start, blocks[k - 1].end);
});

test('DST fall-back day (2026-11-01): 25-hour day, one 180-minute block', () => {
  const blocks = blocksForDate('2026-11-01', makeChild());
  assert.equal(blocks.reduce((a, b) => a + b.minutes, 0), 25 * 60);
  assert.deepEqual(blocks.map((b) => b.minutes).filter((m) => m !== 120), [180]);
  for (const b of blocks.filter((x) => x.awake)) assert.equal(localMinuteOf(b.start, TZ), b.index * 120);
  for (let k = 1; k < 12; k++) assert.equal(blocks[k].start, blocks[k - 1].end);
});

test('DST days: features use local wall-clock time (sleep, time of day, windows)', () => {
  for (const date of ['2026-03-08', '2026-11-01']) {
    const ds = makeDataset({
      sleep: [sleepEnding(date, '06:30', 8)],
      meals: [meal(at(date, '07:00'), 'breakfast')],
      episodes: [ep(at(date, '09:00'))],
    });
    const v12 = feats(ds, date, 6); // noon block
    check(v12, { sleep_deficit: 2, tod_midday: 1, weekend: 1, hunger_gap: 2, recent_episode: 1 }, date);
    const v14 = feats(ds, date, 7); // 2 pm: episode at 9:00 is 5 h earlier
    check(v14, { recent_episode: 0, tod_afternoon: 1 }, date);
  }
});

// ---------- feature enabling (12.5) and missingness indicators ----------

test('missingness indicators are only enabled when their data source is enabled', () => {
  const now = at(MONDAY, '20:00');
  const keys = (ds: ChildDataset) => enabledFeatureKeys(enabledRequirements(buildIndex(ds), now));
  const none = keys(makeDataset({ settings: makeSettings({ hasHomeCoordinates: false, calendarConnected: false }) }));
  for (const k of ['sleep_missing', 'meal_missing', 'noise_missing', 'physio_missing', 'sleep_deficit', 'hunger_gap', 'noise_high',
    'hr_elevated_pre', 'planned_transitions', 'appointment_near', 'pressure_change', 'missed_dose', 'new_place', 'low_activity_yesterday']) {
    assert.ok(!none.includes(k), `${k} should be disabled with no data`);
  }
  for (const k of ['intercept', 'tod_midday', 'weekend', 'school_day', 'recent_episode', 'unusual_day', 'illness']) assert.ok(none.includes(k), k);

  const nights = (n: number) => Array.from({ length: n }, (_, i) => sleepEnding(addDays(MONDAY, -i), '06:30', 10));
  assert.ok(!keys(makeDataset({ sleep: nights(6) })).includes('sleep_missing'));
  assert.ok(keys(makeDataset({ sleep: nights(7) })).includes('sleep_missing'));
  assert.ok(keys(makeDataset({ sleep: nights(7) })).includes('sleep_deficit'));

  const mealsOn = (n: number) => Array.from({ length: n }, (_, i) => meal(at(addDays(MONDAY, -i), '12:00')));
  assert.ok(!keys(makeDataset({ meals: mealsOn(6) })).includes('meal_missing'));
  assert.ok(keys(makeDataset({ meals: mealsOn(7) })).includes('meal_missing'));

  const soundOn = (n: number) => Array.from({ length: n }, (_, i) => sound(at(addDays(MONDAY, -i), '09:00'), 15, 60));
  assert.ok(!keys(makeDataset({ sound: soundOn(6) })).includes('noise_missing'));
  assert.ok(keys(makeDataset({ sound: soundOn(7) })).includes('noise_missing'));

  const hrOn = (n: number) => Array.from({ length: n }, (_, i) => ({ time: at(addDays(MONDAY, -i), '09:00'), bpm: 90 }));
  assert.ok(!keys(makeDataset({ heart: hrOn(6) })).includes('physio_missing'));
  assert.ok(keys(makeDataset({ heart: hrOn(7) })).includes('physio_missing'));

  const withMed = keys(makeDataset({ medications: [{ id: 'med1', name: 'X', scheduleTimes: ['08:00'], scheduleDays: [1, 2, 3, 4, 5, 6, 7], asNeeded: false, activeFrom: MONDAY, activeTo: null }] }));
  assert.ok(withMed.includes('missed_dose'));
  const cal = keys(makeDataset());
  assert.ok(cal.includes('planned_transitions') && cal.includes('pressure_change') && !cal.includes('pollen_high'));
  assert.ok(keys(makeDataset({ weather: [weather(at(MONDAY, '08:00'), { pollenIndex: 1 })] })).includes('pollen_high'));
});

// ---------- forecast mode (12.7) ----------

test('forecast mode: blocks > 4 h ahead estimate recent_episode = 0 and sleep from sleepRef', () => {
  const now = at(MONDAY, '18:00');
  const ds = makeDataset({ episodes: [ep(at(MONDAY, '17:00'))], sleep: [sleepEnding(MONDAY, '06:30', 6)] });
  const tomorrow = addDays(MONDAY, 1);
  const r = computeFeatures(buildIndex(ds), blockOf(tomorrow, 4), { mode: 'forecast', now });
  assert.equal(r.values.recent_episode, 0);
  assert.equal(r.values.sleep_deficit, 0);
  assert.equal(r.values.sleep_missing, 0);
  for (const k of ['recent_episode', 'sleep_deficit', 'night_wakings', 'noise_high', 'hr_elevated_pre', 'place_school']) assert.ok(r.estimated.includes(k), k);
});

test('forecast mode: a block starting within 4 h uses actual recent episodes', () => {
  const now = at(MONDAY, '13:00');
  const ds = makeDataset({ episodes: [ep(at(MONDAY, '12:30'))] });
  const r = computeFeatures(buildIndex(ds), blockOf(MONDAY, 7), { mode: 'forecast', now });
  assert.equal(r.values.recent_episode, 1);
  assert.ok(!r.estimated.includes('recent_episode'));
});

test('forecast mode: information after `now` is never used', () => {
  const now = at(MONDAY, '18:00');
  const tomorrow = addDays(MONDAY, 1);
  const ds = makeDataset({
    doses: [dose(at(tomorrow, '07:00'), 'missed'), dose(at(tomorrow, '07:30'), 'late')],
    meals: [meal(at(tomorrow, '07:00'), 'snack', ['high_sugar', 'caffeine'])],
    sleep: [sleepEnding(tomorrow, '06:30', 5)],
    episodes: [ep(at(tomorrow, '07:00'))],
  });
  const r = computeFeatures(buildIndex(ds), blockOf(tomorrow, 4), { mode: 'forecast', now });
  assert.equal(r.values.missed_dose, 0);
  assert.equal(r.values.late_dose, 0);
  assert.equal(r.values.high_sugar_recent, 0);
  assert.equal(r.values.caffeine_recent, 0);
  assert.equal(r.values.sleep_deficit, 0);
  assert.equal(r.values.recent_episode, 0);
  // the same block in actual mode (after the fact) sees all of it
  const a = computeFeatures(buildIndex(ds), blockOf(tomorrow, 4), { mode: 'actual' });
  assert.equal(a.values.missed_dose, 1);
  assert.equal(a.values.sleep_deficit, 4);
  assert.equal(a.values.high_sugar_recent, 1);
});

test('forecast mode: planned calendar events are used (the allowed exception)', () => {
  const now = at(MONDAY, '18:00');
  const tomorrow = addDays(MONDAY, 1);
  const ds = makeDataset({ calendar: [event(at(tomorrow, '08:15'), at(tomorrow, '08:30'), ['transition'])] });
  const r = computeFeatures(buildIndex(ds), blockOf(tomorrow, 4), { mode: 'forecast', now });
  assert.equal(r.values.planned_transitions, 1);
});
