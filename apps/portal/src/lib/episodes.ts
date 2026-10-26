/** The hard-moments table (SPEC 24.1): filters from the address bar, rows as the viewer's role may see them. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, localDateOf, rangeBounds } from '@emolens/engine';
import { allRows, episodeFrom, type ChildRow } from './data';

export interface EpisodeFilters { from: string; to: string; type: string; minIntensity: number; setting: string; }

export function filtersFrom(sp: Record<string, string | undefined>, tz: string): EpisodeFilters {
  const today = localDateOf(Date.now(), tz);
  const date = (v: string | undefined, d: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : d);
  const from = date(sp.from, addDays(today, -29)), to = date(sp.to, today);
  return {
    from: from <= to ? from : to, to: from <= to ? to : from,
    type: ['meltdown', 'shutdown', 'other'].includes(sp.type ?? '') ? String(sp.type) : '',
    minIntensity: Math.min(5, Math.max(0, Number(sp.min ?? 0) || 0)),
    setting: /^[a-z_]{0,20}$/.test(sp.setting ?? '') ? String(sp.setting ?? '') : '',
  };
}

export async function loadEpisodes(sb: SupabaseClient, child: ChildRow, f: EpisodeFilters) {
  const [a, b] = rangeBounds(f.from, f.to, child.home_tz);
  const rows = await allRows((x, y) => {
    let q = sb.from('episodes').select('*').eq('child_id', child.id).is('deleted_at', null)
      .gte('started_at', new Date(a).toISOString()).lt('started_at', new Date(b).toISOString());
    if (f.type) q = q.eq('type', f.type);
    if (f.minIntensity) q = q.gte('intensity', f.minIntensity);
    if (f.setting) q = q.eq('place_type', f.setting);
    return q.order('started_at', { ascending: false }).range(x, y);
  });
  return rows.map(episodeFrom);
}
