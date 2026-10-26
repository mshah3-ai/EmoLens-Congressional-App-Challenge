/**
 * May this phone use the AI features right now? (SPEC 19.1) Only when the parent accepted the AI consent screen
 * (cloud_ai_enabled) and someone is signed in (an account is needed so the daily limit can be counted per person).
 * In demo mode the demo profile has its own switch; the sign-in is the phone's.
 */
import { useEffect, useState } from 'react';
import { currentUserId } from '../cloud/client';
import { usingFakeCloud } from '../cloud/current';
import type { Settings } from '../db/repo/settings';
import { useSession } from '../store/session';
import type { AiGate } from './client';

export async function aiGate(settings: Pick<Settings, 'cloud_ai_enabled'>): Promise<AiGate> {
  const signedIn = usingFakeCloud() || (await currentUserId().catch(() => null)) != null;
  return { enabled: settings.cloud_ai_enabled, signedIn };
}

/** The gate for screens; null while it is being checked. Re-checked when the settings change. */
export function useAiGate(): AiGate | null {
  const settings = useSession((s) => s.settings);
  const [gate, setGate] = useState<AiGate | null>(null);
  useEffect(() => {
    let alive = true;
    void aiGate(settings).then((g) => { if (alive) setGate(g); });
    return () => { alive = false; };
  }, [settings]);
  return gate;
}
