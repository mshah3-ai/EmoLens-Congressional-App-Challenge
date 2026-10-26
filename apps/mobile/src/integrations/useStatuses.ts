/** Reads every source's status (checks permissions too), refreshed whenever data changes. */
import { useDbQuery } from '../lib/useDbQuery';
import { useSession } from '../store/session';
import { INTEGRATIONS } from './registry';
import { emptyState } from './state';
import { computeStatus } from './status';
import type { IntegrationId, IntegrationStatus } from './types';

export function useIntegrationStatuses(): Record<IntegrationId, IntegrationStatus> | null {
  const repo = useSession((s) => s.repo);
  const profile = useSession((s) => s.profile);
  const settings = useSession((s) => s.settings);
  const { data } = useDbQuery(async () => {
    if (!repo || !profile) return null;
    const ctx = { repo, profile, settings, now: Date.now() };
    const out = {} as Record<IntegrationId, IntegrationStatus>;
    for (const i of INTEGRATIONS) {
      const state = { ...emptyState(), ...settings.integration_state[i.id] };
      const available = await i.isAvailable().catch(() => false);
      const permission = available ? await i.hasPermission().catch(() => false) : false;
      const setup = i.setupDetail ? await i.setupDetail(ctx).catch(() => ({ ready: false })) : { ready: true };
      out[i.id] = computeStatus({ state, available, permission, setup });
    }
    return out;
  }, [repo, profile, settings], null);
  return data;
}
