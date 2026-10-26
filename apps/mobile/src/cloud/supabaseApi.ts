/**
 * The CloudApi that sync uses, on top of a Supabase client. Kept free of React Native so the two-phone test can run it
 * in plain Node against the local Supabase (supabase/tests/integration/twoPhones.test.ts).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CloudApi, CloudError, CloudResult, ShareLinkRow } from './api';

const cloudError = (e: { code?: string; message?: string } | null, status: number | null): CloudError =>
  ({ code: e?.code ?? String(status ?? 'network'), status, message: e?.message ?? 'request failed' });

export function supabaseApi(sb: SupabaseClient): CloudApi {
  return {
    async upsert(table, rows, onConflict) {
      const { error, status } = await sb.from(table).upsert(rows, { onConflict });
      return error ? { data: null, error: cloudError(error, status) } : { data: null, error: null };
    },
    async pullPage(table, column, childId, since, limit) {
      const { data, error, status } = await sb.from(table).select('*').eq(column, childId).gt('server_received_at', since)
        .order('server_received_at', { ascending: true }).limit(limit);
      return error ? { data: null, error: cloudError(error, status) } : { data: (data ?? []) as Record<string, unknown>[], error: null };
    },
    async memberships(childId) {
      const { data, error, status } = await sb.from('memberships').select('child_id, user_id, role, status').eq('child_id', childId);
      return error ? { data: null, error: cloudError(error, status) } : { data: data ?? [], error: null };
    },
    async profiles(userIds) {
      if (!userIds.length) return { data: [], error: null };
      const { data, error, status } = await sb.from('profiles').select('user_id, display_name').in('user_id', userIds);
      return error ? { data: null, error: cloudError(error, status) } : { data: data ?? [], error: null };
    },
    async setDisplayName(userId, name) {
      const { error, status } = await sb.from('profiles').upsert({ user_id: userId, display_name: name }, { onConflict: 'user_id' });
      return error ? { data: null, error: cloudError(error, status) } : { data: null, error: null };
    },
    async schoolForecasts(childId, fromDate) {
      const { data, error, status } = await sb.from('school_forecasts').select('local_date, blocks, computed_at')
        .eq('child_id', childId).gte('local_date', fromDate);
      return error ? { data: null, error: cloudError(error, status) } : { data: data ?? [], error: null };
    },
    async shareLinks(childId) {
      const { data, error, status } = await sb.from('share_links').select('id, audience, range_from, range_to, expires_at, revoked_at, created_at')
        .eq('child_id', childId).order('created_at', { ascending: false });
      return error ? { data: null, error: cloudError(error, status) } : { data: (data ?? []) as ShareLinkRow[], error: null };
    },
    async call<T>(fn: string, body: Record<string, unknown>, opts?: { timeoutMs?: number }): Promise<CloudResult<T>> {
      const { data, error } = await sb.functions.invoke(fn, { body, timeout: opts?.timeoutMs ?? 10_000 });
      if (!error) return { data: data as T, error: null };
      // FunctionsHttpError carries the Response: our functions answer {"error":"<code>"}. Checked by shape, not
      // `instanceof Response`: the fetch supabase-js uses may come from another realm (it did under Jest), and then a
      // 502 from the server was wrongly reported as "offline".
      const res = (error as { context?: unknown }).context as Response | undefined;
      if (res && typeof res.status === 'number' && typeof res.json === 'function') {
        let code = String(res.status);
        try { code = String(((await res.json()) as { error?: string }).error ?? code); } catch { /* not JSON */ }
        return { data: null, error: { code, status: res.status, message: code } };
      }
      return { data: null, error: { code: 'network', status: null, message: 'network' } };
    },
  };
}
