/**
 * End-of-day check (SPEC 16). "No, that's everything" saves `day_closures(all_logged = 1)` with `closed_at` = now:
 * every awake block of that day that ENDED before `closed_at` and has no other label becomes a calm block
 * (`negative_confirmed`, engine rule). "I'm not sure" saves `all_logged = 0` (blocks stay unknown).
 * The next-morning follow-up ("Anything happen after 8:30 pm last night?" -> No) moves `closed_at` to the morning,
 * which covers the evening blocks after the check.
 */
import { addDays, zonedToUtc } from '@emolens/engine';
import { one, type Executor } from '../types';
import { iso, nowIso } from '../time';
import { type Repo } from './writer';

export interface ClosureRow { id: string; local_date: string; all_logged: number; closed_at: string | null; created_at: string; }

export const closureFor = (ex: Executor, childId: string, date: string) =>
  one<ClosureRow>(ex, 'SELECT id, local_date, all_logged, closed_at, created_at FROM day_closures WHERE child_id = ? AND local_date = ? AND deleted_at IS NULL', [childId, date]);

/** The whole local day as a dirty range: its labels change. */
const wholeDay = (childId: string, date: string, tz: string) =>
  ({ childId, from: iso(zonedToUtc(date, 0, tz)), to: iso(zonedToUtc(addDays(date, 1), 0, tz)) });

/** Saves (or changes) the answer for `date`. */
export function closeDay(repo: Repo, childId: string, tz: string, date: string, allLogged: boolean, closedAt = nowIso()): Promise<void> {
  return repo.write(async (w) => {
    const existing = await closureFor(w.ex, childId, date);
    const values = { child_id: childId, local_date: date, all_logged: allLogged ? 1 : 0, closed_at: closedAt };
    if (existing) await w.update('day_closures', existing.id, values, [wholeDay(childId, date, tz)]);
    else await w.insert('day_closures', values, [wholeDay(childId, date, tz)]);
  });
}

/** Time the closure covers up to. */
export const closedAtOf = (c: ClosureRow) => c.closed_at ?? c.created_at;
