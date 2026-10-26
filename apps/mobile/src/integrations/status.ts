/**
 * One status per data source for the Data sources screen and Today's chips (SPEC 9.2, 11, 29). Pure, so it's tested.
 * Priority: not on this phone → switched off → permission missing → setup missing → last sync failed → no data →
 * works partly (a notice) → OK.
 * A sync failure only counts if it is newer than the last success.
 */
import type { IntegrationStateEntry } from '../db/repo/settings';
import type { IntegrationStatus } from './types';

export interface StatusInputs {
  state: IntegrationStateEntry;
  available: boolean;
  permission: boolean;
  setup: { ready: boolean; detailKey?: string; detailParams?: Record<string, string | number> };
}

export function computeStatus({ state, available, permission, setup }: StatusInputs): IntegrationStatus {
  const base = { lastSyncAt: state.lastSyncAt, lastSuccessAt: state.lastSuccessAt, lastError: state.lastError, detailKey: setup.detailKey, detailParams: setup.detailParams };
  if (!available) return { ...base, health: 'unavailable' };
  if (!state.enabled) return { ...base, health: 'off' };
  if (!permission) return { ...base, health: 'needs_permission' };
  if (!setup.ready) return { ...base, health: 'needs_setup' };
  const failedLast = state.lastError && (!state.lastSuccessAt || (state.lastSyncAt ?? '') > state.lastSuccessAt);
  if (failedLast) return { ...base, health: 'error' };
  // Synced without error but received nothing at all: say so instead of "Connected" (iOS hides refused Health access).
  if (state.lastFoundData === false) return { ...base, health: 'no_data' };
  // Works, but this phone can't do part of it (e.g. no background place watching in the iOS Simulator): say why.
  if (state.lastNotice) return { ...base, health: 'limited', detailKey: `sources.notice.${state.lastNotice}`, detailParams: undefined };
  return { ...base, health: 'ok' };
}

/** Today shows a warning chip for these (SPEC 29: integration failures appear as warning chips). */
export const isWarning = (s: IntegrationStatus) => s.health === 'needs_permission' || s.health === 'needs_setup' || s.health === 'error' || s.health === 'no_data';
