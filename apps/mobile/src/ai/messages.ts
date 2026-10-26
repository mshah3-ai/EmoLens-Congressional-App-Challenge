/**
 * What Ask EmoLens shows when a question can't be answered: the text, whether it is a calm notice or an error, and
 * whether "Try again" can help.
 *  - daily limit: a calm notice with the real reset time in the family's time zone and no "Try again" (BUGS #28, #30);
 *  - no internet on the phone: "Ask EmoLens needs an internet connection", calm, with "Try again" (BUGS #31);
 *  - anything else: an error with "Try again".
 */
import type { TFunction } from 'i18next';
import { localDateOf } from '@emolens/engine';
import { fmtTime } from '../i18n/format';
import type { AiErrorCode } from './client';

/** When the daily AI request count starts again: the server counts per UTC day (DECISIONS #128), so the next
 * 00:00 UTC (7 PM in Chicago during daylight saving time, 2 AM in Madrid). */
export function aiLimitResetsAt(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

export interface AskNotice { text: string; tone: 'calm' | 'error'; retry: boolean; }

export function askErrorNotice(t: TFunction, code: AiErrorCode | 'empty', tz: string, now: number): AskNotice {
  if (code === 'daily_limit') {
    const at = aiLimitResetsAt(now);
    const sameDay = localDateOf(at, tz) === localDateOf(now, tz);
    return { text: t(sameDay ? 'ai.err.daily_limit_today' : 'ai.err.daily_limit_tomorrow', { time: fmtTime(at, tz) }), tone: 'calm', retry: false };
  }
  if (code === 'offline') return { text: t('ask.offline'), tone: 'calm', retry: true };
  return { text: t(`ai.err.${code}`), tone: 'error', retry: true };
}
