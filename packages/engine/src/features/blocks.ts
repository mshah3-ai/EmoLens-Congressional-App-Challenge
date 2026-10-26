/** Two-hour time blocks (spec 12.1). Block k covers local wall-clock [2k:00, 2k+2:00). */
import { BLOCK_HOURS, MINUTE_MS, type Block, type ChildProfile } from '@emolens/shared';
import { addDays, daysBetween, localDateOf, parseHHMM, zonedToUtc } from './time';

export const BLOCKS_PER_DAY = 24 / BLOCK_HOURS;

/** Awake if the block overlaps the wake window [wakeStart, wakeEnd) by at least 60 minutes (local clock). */
export function isAwakeIndex(k: number, child: Pick<ChildProfile, 'wakeStart' | 'wakeEnd'>): boolean {
  const ws = parseHHMM(child.wakeStart);
  let we = parseHHMM(child.wakeEnd);
  if (we <= ws) we = 24 * 60;
  const bs = k * BLOCK_HOURS * 60, be = bs + BLOCK_HOURS * 60;
  return Math.min(be, we) - Math.max(bs, ws) >= 60;
}

export function awakeIndices(child: Pick<ChildProfile, 'wakeStart' | 'wakeEnd'>): number[] {
  return Array.from({ length: BLOCKS_PER_DAY }, (_, k) => k).filter((k) => isAwakeIndex(k, child));
}

/** All 12 blocks of a local date, converted to UTC. DST days produce 1- or 3-hour blocks. */
export function blocksForDate(date: string, child: ChildProfile): Block[] {
  const out: Block[] = [];
  for (let k = 0; k < BLOCKS_PER_DAY; k++) {
    const start = zonedToUtc(date, k * BLOCK_HOURS * 60, child.homeTz);
    const end = zonedToUtc(date, (k + 1) * BLOCK_HOURS * 60, child.homeTz);
    out.push({ start, end, localDate: date, index: k, minutes: Math.round((end - start) / MINUTE_MS), awake: isAwakeIndex(k, child) });
  }
  return out;
}

export function awakeBlocksForDate(date: string, child: ChildProfile): Block[] {
  return blocksForDate(date, child).filter((b) => b.awake && b.minutes > 0);
}

/** Awake blocks for every local date in [fromDate, toDate]. */
export function awakeBlocksBetween(fromDate: string, toDate: string, child: ChildProfile): Block[] {
  const n = daysBetween(fromDate, toDate);
  const out: Block[] = [];
  for (let i = 0; i <= n; i++) out.push(...awakeBlocksForDate(addDays(fromDate, i), child));
  return out;
}

export function blockContaining(ms: number, child: ChildProfile): Block | undefined {
  const date = localDateOf(ms, child.homeTz);
  return blocksForDate(date, child).find((b) => ms >= b.start && ms < b.end);
}
