/** Item-level "Worth watching" analysis (spec 14.5) with a multiple-comparison guard. */
import { DAY_MS, HOUR_MS, type Block } from '@emolens/shared';
import { betaRatioProb } from '../betabinomial';
import { hash32 } from '../stats';
import { placeAt, type DatasetIndex } from './build';
import { localDateOf } from './time';

export type ItemKind = 'food' | 'medication' | 'place' | 'calendar_tag';
export interface WatchItem {
  id: string; kind: ItemKind; label: string; nExposed: number; kExposed: number;
  pAbove: number; median: number; lo80: number; hi80: number; shown: boolean;
}

export interface EvalBlock extends Block { y: 0 | 1; }

const norm = (s: string) => s.trim().toLowerCase();

export function worthWatching(idx: DatasetIndex, blocks: EvalBlock[], draws = 4000): { items: WatchItem[]; tested: number } {
  if (blocks.length === 0) return { items: [], tested: 0 };
  const rBar = blocks.reduce((a, b) => a + b.y, 0) / blocks.length;
  const a0 = Math.max(10 * rBar, 0.1), b0 = Math.max(10 * (1 - rBar), 0.1);

  // Candidate items -> predicate "is block exposed"
  const cands: { id: string; kind: ItemKind; label: string; exposed: (b: Block) => boolean }[] = [];

  const foodOcc = new Map<string, { times: number[]; days: Set<string> }>();
  for (const m of idx.ds.meals) for (const it of m.items) {
    const k = norm(it.name);
    const o = foodOcc.get(k) ?? { times: [], days: new Set<string>() };
    o.times.push(m.eatenAt); o.days.add(localDateOf(m.eatenAt, idx.tz));
    foodOcc.set(k, o);
  }
  for (const [name, o] of foodOcc) if (o.times.length >= 8 && o.days.size >= 5) {
    cands.push({ id: `food:${name}`, kind: 'food', label: name, exposed: (b) => o.times.some((t) => t >= b.start - 3 * HOUR_MS && t < b.start) });
  }
  for (const med of idx.ds.medications) {
    const missed = idx.ds.doses.filter((d) => d.medicationId === med.id && d.status === 'missed' && d.scheduledFor != null).map((d) => d.scheduledFor as number);
    if (missed.length === 0) continue;
    cands.push({ id: `med:${med.id}`, kind: 'medication', label: med.name, exposed: (b) => missed.some((t) => t >= b.start - DAY_MS && t < b.start) });
  }
  for (const pl of idx.ds.places) {
    cands.push({ id: `place:${pl.id}`, kind: 'place', label: pl.label, exposed: (b) => placeAt(idx, b.start)?.placeId === pl.id });
  }
  const tags = new Set<string>();
  for (const e of idx.events) for (const t of e.tags) tags.add(t);
  for (const tag of tags) {
    const evs = idx.events.filter((e) => e.tags.includes(tag as never));
    cands.push({ id: `tag:${tag}`, kind: 'calendar_tag', label: tag, exposed: (b) => evs.some((e) => e.startAt < b.end && e.endAt > b.start) });
  }

  const results: WatchItem[] = [];
  for (const c of cands) {
    let ne = 0, ke = 0, nu = 0, ku = 0;
    for (const b of blocks) { if (c.exposed(b)) { ne++; ke += b.y; } else { nu++; ku += b.y; } }
    if (ne === 0 || nu === 0) continue;
    const r = betaRatioProb(a0 + ke, b0 + ne - ke, a0 + ku, b0 + nu - ku, 1.3, draws, hash32(c.id));
    results.push({ id: c.id, kind: c.kind, label: c.label, nExposed: ne, kExposed: ke, pAbove: r.pAbove, median: r.median, lo80: r.lo80, hi80: r.hi80, shown: false });
  }
  const threshold = results.length > 20 ? 0.95 : 0.9;
  for (const r of results) r.shown = r.pAbove >= threshold;
  results.sort((a, b) => b.pAbove - a.pAbove);
  return { items: results, tested: results.length };
}
