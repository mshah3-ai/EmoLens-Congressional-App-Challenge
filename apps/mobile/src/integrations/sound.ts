/**
 * Phone "sound check" (SPEC 11.6): how loud the room is, never what was said. The microphone level (dBFS, 0 = loudest,
 * negative below that) is sampled every 250 ms; the audio file is deleted right away and only one number is stored:
 * the average level + the phone offset (default 90), labeled "estimated loudness" in the app.
 */
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import type { Executor } from '../db/types';
import { newId } from '../db/time';
import type { Integration } from './types';

/**
 * Average of decibel readings, done on sound power rather than on the numbers directly (a 90 dB burst in a 50 dB room
 * matters more than "70"). Returns dBFS; readings that aren't numbers are ignored.
 */
export function averageDbfs(samples: (number | null | undefined)[]): number | null {
  const v = samples.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  if (!v.length) return null;
  const meanPower = v.reduce((s, db) => s + 10 ** (db / 10), 0) / v.length;
  return 10 * Math.log10(meanPower);
}

/** Estimated room level in dB from the phone's dBFS average (SPEC 11.6: level_db = dBFS + phone_offset). */
export const estimatedDb = (dbfs: number, offset: number) => Math.round((dbfs + offset) * 10) / 10;

export async function saveSoundSample(ex: Executor, measuredAt: string, levelDb: number, durationS: number, placeId: string | null): Promise<void> {
  await ex.execute('INSERT INTO sound_samples (id, measured_at, level_db, duration_s, source, place_id) VALUES (?, ?, ?, ?, ?, ?)',
    [newId(), measuredAt, levelDb, durationS, 'phone', placeId]);
  // SPEC 12.6: the "loud environment" feature of blocks near this reading must be recomputed.
  const t = Date.parse(measuredAt);
  await ex.execute('UPDATE blocks SET dirty = 1 WHERE block_start >= ? AND block_start <= ?',
    [new Date(t - 24 * 3_600_000).toISOString(), new Date(t + 24 * 3_600_000).toISOString()]);
}

/** A friendly word for a level (UI only). */
export function loudnessWord(db: number): 'quiet' | 'moderate' | 'loud' | 'very_loud' {
  if (db < 50) return 'quiet';
  if (db < 65) return 'moderate';
  if (db < 80) return 'loud';
  return 'very_loud';
}

export const soundIntegration: Integration = {
  id: 'sound',
  isAvailable: async () => true,
  hasPermission: async () => (await getRecordingPermissionsAsync()).granted,
  requestPermission: async () => (await requestRecordingPermissionsAsync()).granted,
  // Sound checks only happen while the app is open (iOS doesn't allow background listening for this), so no sync.
  isDue: () => false,
  sync: async () => ({ changed: 0 }),
};
