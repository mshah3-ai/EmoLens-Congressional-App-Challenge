/**
 * Saves health data. Raw samples go to `health_samples` (local only, never synced; SPEC 27.1), upserted by the health
 * app's own id so re-syncing never duplicates. Nights go to `sleep_entries` with an external id per night and source.
 */
import { one } from '../../db/types';
import { around, type Repo } from '../../db/repo/writer';
import { iso, newId } from '../../db/time';
import type { Night } from './sleep';
import type { ImportKind, ImportSummary } from '../types';

export type HealthSampleType = 'heart_rate' | 'resting_hr' | 'hrv_sdnn' | 'hrv_rmssd' | 'steps';
export interface HealthSampleIn { externalId: string; type: HealthSampleType; start: number; end: number; value: number; unit: string }
export type HealthSource = 'healthkit' | 'healthconnect';

const SUMMARY_KIND: Record<HealthSampleType, ImportKind> = { heart_rate: 'heart_rate', resting_hr: 'resting_hr', hrv_sdnn: 'hrv', hrv_rmssd: 'hrv', steps: 'steps' };

/** Saves everything; returns how many rows changed and how many *new* items of each kind arrived. */
export function saveHealth(repo: Repo, childId: string, source: HealthSource, samples: HealthSampleIn[], nights: Night[]): Promise<{ changed: number; summary: ImportSummary }> {
  return repo.write(async (w) => {
    let changed = 0;
    const summary: ImportSummary = {};
    const bump = (k: ImportKind) => { summary[k] = (summary[k] ?? 0) + 1; };
    for (const s of samples) {
      const externalId = `${source}:${s.externalId}`;
      const isNew = !(await one(w.ex, 'SELECT 1 AS x FROM health_samples WHERE external_id = ?', [externalId]));
      const r = await w.ex.execute(
        `INSERT INTO health_samples (id, type, start_at, end_at, value, unit, source, external_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(external_id) DO UPDATE SET value = excluded.value, start_at = excluded.start_at, end_at = excluded.end_at
         WHERE health_samples.value != excluded.value OR health_samples.start_at != excluded.start_at`,
        [newId(), s.type, iso(s.start), iso(s.end), s.value, s.unit, source, externalId]);
      changed += r.rowsAffected;
      if (isNew) bump(SUMMARY_KIND[s.type]);
    }
    if (samples.length) {
      const first = Math.min(...samples.map((s) => s.start)), last = Math.max(...samples.map((s) => s.end));
      await w.markDirty([{ childId, from: iso(first - 24 * 3_600_000), to: iso(last + 24 * 3_600_000) }]);
    }
    for (const n of nights) {
      const externalId = `${source}:night:${n.localDate}`;
      const existing = await one<{ id: string; sleep_start: string; sleep_end: string; duration_min: number; night_wakings: number | null }>(w.ex,
        'SELECT id, sleep_start, sleep_end, duration_min, night_wakings FROM sleep_entries WHERE external_id = ? AND deleted_at IS NULL', [externalId]);
      const values = { child_id: childId, sleep_start: iso(n.start), sleep_end: iso(n.end), duration_min: n.asleepMin, quality: null,
        night_wakings: n.wakings, source, external_id: externalId };
      if (!existing) {
        await w.insert('sleep_entries', values, [around(childId, values.sleep_end)]);
        changed++;
        bump('nights');
      } else if (existing.sleep_start !== values.sleep_start || existing.sleep_end !== values.sleep_end
        || existing.duration_min !== values.duration_min || existing.night_wakings !== values.night_wakings) {
        await w.update('sleep_entries', existing.id, values, [around(childId, values.sleep_end)]);
        changed++;
      }
    }
    return { changed, summary };
  });
}
