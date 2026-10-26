/** The child profile (SPEC 6.2 `children`, onboarding step 4). */
import type { ChildProfile, EpisodeType } from '@emolens/shared';
import { SUSPECTED_TRIGGERS } from '@emolens/shared';
import { one, type Executor } from '../types';
import { parseJson, type ChildRow } from '../rows';
import { everything, type Repo } from './writer';

export interface ChildInput {
  nickname: string; birthYear: number | null; homeTz: string; communication: ChildRow['communication'];
  wakeStart: string; wakeEnd: string; typicalSleepHours: number; episodesPerWeekEstimate: number;
  modeledEpisodeTypes: EpisodeType[]; schoolDays?: number[];
}

const columns = (c: Partial<ChildInput>) => {
  const v: Record<string, string | number | null> = {};
  if (c.nickname !== undefined) v.nickname = c.nickname.trim();
  if (c.birthYear !== undefined) v.birth_year = c.birthYear;
  if (c.homeTz !== undefined) v.home_tz = c.homeTz;
  if (c.communication !== undefined) v.communication = c.communication;
  if (c.wakeStart !== undefined) v.wake_start = c.wakeStart;
  if (c.wakeEnd !== undefined) v.wake_end = c.wakeEnd;
  if (c.typicalSleepHours !== undefined) v.typical_sleep_hours = c.typicalSleepHours;
  if (c.episodesPerWeekEstimate !== undefined) v.episodes_per_week_estimate = c.episodesPerWeekEstimate;
  if (c.modeledEpisodeTypes !== undefined) v.modeled_episode_types = JSON.stringify(c.modeledEpisodeTypes);
  if (c.schoolDays !== undefined) v.school_days = JSON.stringify(c.schoolDays);
  return v;
};

export async function getChild(ex: Executor): Promise<ChildRow | null> {
  return one<ChildRow>(ex, 'SELECT * FROM children WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1');
}

export function createChild(repo: Repo, input: ChildInput): Promise<string> {
  return repo.write((w) => w.insert('children', columns(input)));
}

/** Changing the wake window, school days or tracked types changes features for every block (SPEC 12.6). */
export function updateChild(repo: Repo, id: string, input: Partial<ChildInput>): Promise<void> {
  const affectsAll = input.wakeStart !== undefined || input.wakeEnd !== undefined || input.schoolDays !== undefined
    || input.modeledEpisodeTypes !== undefined;
  return repo.write((w) => w.update('children', id, columns(input), affectsAll ? [everything(id)] : []));
}

/** The engine's view of the child (used for time blocks now; for forecasting in Phase 5). */
export function toChildProfile(row: ChildRow, suspectedTriggerIds: string[] = []): ChildProfile {
  const keys = SUSPECTED_TRIGGERS.filter((t) => suspectedTriggerIds.includes(t.id)).flatMap((t) => t.keys);
  return {
    id: row.id,
    nickname: row.nickname,
    homeTz: row.home_tz,
    wakeStart: row.wake_start,
    wakeEnd: row.wake_end,
    typicalSleepHours: row.typical_sleep_hours ?? 10,
    episodesPerWeekEstimate: row.episodes_per_week_estimate,
    modeledEpisodeTypes: parseJson<EpisodeType[]>(row.modeled_episode_types, ['meltdown', 'shutdown', 'other']),
    minModeledIntensity: row.min_modeled_intensity,
    schoolDays: parseJson<number[]>(row.school_days, [1, 2, 3, 4, 5]),
    suspectedFeatures: [...new Set(keys)],
  };
}
