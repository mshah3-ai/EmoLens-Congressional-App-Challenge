/** The CloudApi in use: Supabase on the phone, or a fake in tests. Null when the build has no Supabase project. */
import type { CloudApi } from './api';
import { supabase, supabaseApi } from './client';

let override: CloudApi | null = null;
/** Tests: talk to a fake cloud instead of Supabase. */
export function setCloudApiForTests(api: CloudApi | null): void { override = api; }
export const usingFakeCloud = (): boolean => override != null;

export function cloudApi(): CloudApi | null {
  if (override) return override;
  const sb = supabase();
  return sb ? supabaseApi(sb) : null;
}
