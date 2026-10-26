/**
 * Health integration (SPEC 11.1): Apple Health on iPhone, Health Connect on Android. The first sync reads 60 days; later
 * syncs re-read from 2 days before the last success, because watches often upload late.
 */
import { healthProvider } from './provider';
import { groupNights } from './sleep';
import { saveHealth } from './store';
import { getIntegrationState } from '../state';
import type { Integration, SyncContext } from '../types';

const DAY = 86_400_000;

export const healthIntegration: Integration = {
  id: 'health',
  isAvailable: () => healthProvider.isAvailable(),
  hasPermission: () => healthProvider.hasPermission(),
  requestPermission: () => healthProvider.requestPermission(),
  isDue: (ctx, lastSuccessAt) => !lastSuccessAt || ctx.now - Date.parse(lastSuccessAt) >= 30 * 60_000,
  async sync(ctx: SyncContext) {
    const source = healthProvider.source;
    if (!source) return { changed: 0, note: 'unavailable' };
    const last = (await getIntegrationState(ctx.repo.db, 'health')).lastSuccessAt;
    const since = new Date(last ? Date.parse(last) - 2 * DAY : ctx.now - 60 * DAY);
    const { asleep, inBed, samples } = await healthProvider.read(since, new Date(ctx.now));
    const nights = groupNights(asleep, ctx.profile.homeTz, inBed);
    const { changed, summary } = await saveHealth(ctx.repo, ctx.profile.id, source, samples, nights);
    // iOS hides whether Health read access was refused (reads just come back empty), so "nothing at all" is reported.
    return { changed, summary, foundData: asleep.length + inBed.length + samples.length > 0 };
  },
};

export { healthProvider };
