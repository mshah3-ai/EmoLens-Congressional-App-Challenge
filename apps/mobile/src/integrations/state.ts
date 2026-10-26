/** Per-source on/off switch, last sync time and last error, kept in the `integration_state` setting. */
import type { Executor } from '../db/types';
import { getSetting, setSetting, type IntegrationStateEntry } from '../db/repo/settings';
import { safeMessage } from '../db/repo/errors';
import type { IntegrationId } from './types';

export const emptyState = (): IntegrationStateEntry => ({ enabled: false, lastSyncAt: null, lastSuccessAt: null, lastError: null, lastFoundData: null, lastNotice: null });

export async function getIntegrationState(ex: Executor, id: IntegrationId): Promise<IntegrationStateEntry> {
  const all = await getSetting(ex, 'integration_state');
  return { ...emptyState(), ...all[id] };
}

export async function patchIntegrationState(ex: Executor, id: IntegrationId, patch: Partial<IntegrationStateEntry>): Promise<IntegrationStateEntry> {
  const all = await getSetting(ex, 'integration_state');
  const next = { ...emptyState(), ...all[id], ...patch };
  await setSetting(ex, 'integration_state', { ...all, [id]: next });
  return next;
}

export async function recordSyncSuccess(ex: Executor, id: IntegrationId, at: string, foundData?: boolean, notice?: string): Promise<void> {
  await patchIntegrationState(ex, id, { lastSyncAt: at, lastSuccessAt: at, lastError: null, lastFoundData: foundData ?? null, lastNotice: notice ?? null });
}

export async function recordSyncFailure(ex: Executor, id: IntegrationId, at: string, e: unknown): Promise<void> {
  await patchIntegrationState(ex, id, { lastSyncAt: at, lastError: safeMessage(e) });
}
