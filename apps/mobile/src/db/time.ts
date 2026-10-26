/** Conversions between the database's ISO strings and the engine's epoch milliseconds. */
import { uuidv7 } from 'uuidv7';

/** UTC ISO-8601 with milliseconds, e.g. 2026-09-28T19:05:00.000Z (SPEC 6.1). */
export const iso = (ms: number): string => new Date(ms).toISOString();
export const ms = (isoString: string): number => Date.parse(isoString);
export const nowIso = (): string => new Date().toISOString();
export const newId = (): string => uuidv7();

export const HOUR = 3_600_000;
export const DAY = 86_400_000;
