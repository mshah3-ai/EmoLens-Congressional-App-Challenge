/**
 * "Based on N entries" (SPEC 19.2 step 6): the refs the tools returned ("E:<id>", "F:<id>"…) turned back into
 * entries the parent can open. Each kind opens the same sheet as tapping it in the Timeline.
 */
import { all, type Executor } from '../db/types';

export type RefKind = 'E' | 'F' | 'M' | 'S' | 'N' | 'SL' | 'P' | 'I' | 'R';
export interface RefEntry { ref: string; kind: RefKind; id: string; at: string | null; }

const TABLES: Record<RefKind, { table: string; at: string }> = {
  E: { table: 'episodes', at: 'started_at' }, F: { table: 'meals', at: 'eaten_at' }, M: { table: 'med_doses', at: 'COALESCE(taken_at, scheduled_for)' },
  S: { table: 'strategy_uses', at: 'used_at' }, N: { table: 'notes', at: 'noted_at' }, SL: { table: 'sleep_entries', at: 'sleep_end' },
  P: { table: 'place_visits', at: 'arrived_at' }, I: { table: 'illness_logs', at: 'started_at' }, R: { table: 'routine_changes', at: 'COALESCE(start_at, local_date)' },
};

export function parseRef(ref: string): { kind: RefKind; id: string } | null {
  const i = ref.indexOf(':');
  const kind = ref.slice(0, i) as RefKind;
  return i > 0 && kind in TABLES ? { kind, id: ref.slice(i + 1) } : null;
}

/** Where tapping an entry goes (the Timeline's edit sheets). */
export function refRoute(kind: RefKind, id: string): { pathname: string; params: Record<string, string> } {
  switch (kind) {
    case 'E': return { pathname: '/log/episode', params: { id } };
    case 'F': return { pathname: '/log/meal', params: { id } };
    case 'M': return { pathname: '/log/med', params: { doseId: id } };
    case 'S': return { pathname: '/log/strategy', params: { id } };
    case 'N': return { pathname: '/log/note', params: { id } };
    case 'SL': return { pathname: '/log/sleep', params: { id } };
    case 'P': return { pathname: '/log/place', params: { visitId: id } };
    case 'I': return { pathname: '/log/illness', params: { id } };
    default: return { pathname: '/log/routine', params: { id } };
  }
}

/** The entries behind an answer, newest first (deleted ones are left out). */
export async function describeRefs(ex: Executor, refs: string[]): Promise<RefEntry[]> {
  const byKind = new Map<RefKind, string[]>();
  for (const r of refs) {
    const p = parseRef(r);
    if (p) byKind.set(p.kind, [...(byKind.get(p.kind) ?? []), p.id]);
  }
  const out: RefEntry[] = [];
  for (const [kind, ids] of byKind) {
    const t = TABLES[kind];
    for (let i = 0; i < ids.length; i += 400) {
      const chunk = ids.slice(i, i + 400);
      const rows = await all<{ id: string; at: string | null }>(ex,
        `SELECT id, ${t.at} AS at FROM ${t.table} WHERE deleted_at IS NULL AND id IN (${chunk.map(() => '?').join(',')})`, chunk);
      for (const r of rows) out.push({ ref: `${kind}:${r.id}`, kind, id: r.id, at: r.at });
    }
  }
  return out.sort((a, b) => ((a.at ?? '') < (b.at ?? '') ? 1 : -1));
}
