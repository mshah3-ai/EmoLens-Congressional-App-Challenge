/**
 * Switching a data source on or off. On: EmoLens has already shown what it uses (on the card), then asks the OS for
 * permission; only if granted is the source switched on and synced right away. Off: stops syncing (and geofencing).
 */
import { Linking } from 'react-native';
import { useSession } from '../store/session';
import { refreshNow } from './appRefresh';
import type { RefreshReport } from './refresh';
import { stopGeofences } from './location';
import { integrationById } from './registry';
import { patchIntegrationState } from './state';
import type { IntegrationId } from './types';

export interface EnableResult { state: 'on' | 'off' | 'denied'; report: RefreshReport | null }

export async function setIntegrationEnabled(id: IntegrationId, on: boolean): Promise<EnableResult> {
  const s = useSession.getState();
  if (!s.repo || !s.profile) return { state: 'off', report: null };
  const integration = integrationById(id);
  if (on) {
    // Always make the request: the OS shows its screen only if it still needs an answer, and a "yes, you already have
    // permission" check can't be trusted for Apple Health (iOS never reveals read access). Bug found in the Simulator.
    const granted = await integration.requestPermission().catch(() => false);
    if (!granted) return { state: 'denied', report: null };
  }
  await patchIntegrationState(s.repo.db, id, { enabled: on });
  await s.reload();
  if (on) return { state: 'on', report: await refreshNow({ only: [id] }) };
  if (id === 'location') await stopGeofences().catch(() => undefined);
  return { state: 'off', report: null };
}

/** SPEC 29: when permission was denied, explain and offer the phone's Settings. */
export const openPhoneSettings = () => { void Linking.openSettings(); };
