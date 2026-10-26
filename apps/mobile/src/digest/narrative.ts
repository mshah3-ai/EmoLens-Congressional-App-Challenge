/**
 * The digest's summary in words when cloud AI is off (SPEC 21, Appendix B.8 template sentences), written from the saved
 * numbers each time the digest is shown, so it is always in the app's current language:
 *   "Sam had 4 hard moments this week (2 fewer than last week)." · "Most happened in the afternoon." ·
 *   "EmoLens's pattern for shorter sleep is now a likely link." · "Quiet space helped 3 of 4 times." ·
 *   "Thanks for logging on 5 of 7 days. Every entry sharpens the forecasts."
 * Plain TypeScript (takes a translation function), so the digest PDF and tests use it too.
 */
import type { Lang } from '@emolens/shared';
import { TOD_GROUPS, featureLabel, type DigestStats } from '@emolens/engine';
import type { TFn } from '@emolens/reports';

const lowerFirst = (s: string) => s.charAt(0).toLocaleLowerCase() + s.slice(1);

export function templateNarrative(s: DigestStats, t: TFn, nickname: string, lang: Lang): string[] {
  const out: string[] = [];
  const n = s.episodes.total;
  if (n === 0) {
    out.push(t('digest.sNone', { name: nickname }));
  } else if (s.prevWeekTotal == null) {
    out.push(t('digest.sCount', { name: nickname, count: n }));
  } else {
    const d = n - s.prevWeekTotal;
    const change = d === 0 ? t('digest.changeSame') : t(d < 0 ? 'digest.changeFewer' : 'digest.changeMore', { count: Math.abs(d) });
    out.push(t('digest.sCountChange', { name: nickname, count: n, change }));
  }
  if (n > 0) {
    const top = TOD_GROUPS.map((g) => ({ g, c: s.episodes.byTod[g] })).sort((a, b) => b.c - a.c);
    // "Most happened in ..." only when one part of the day clearly had more
    if (top[0].c > top[1].c) out.push(t('digest.sTod', { when: t(`report.tod.${top[0].g}`) }));
  }
  for (const c of s.insights.changes.slice(0, 2)) {
    out.push(t('digest.sPattern', { factor: lowerFirst(featureLabel(c.key, lang)), status: t(`digest.statusPhrase.${c.to}`) }));
  }
  if (s.strategies.best) out.push(t('digest.sStrategy', { strategy: s.strategies.best.name, s: s.strategies.best.successes, count: s.strategies.best.total }));
  const k = s.logging.daysClosed;
  out.push(k > 0 ? t('digest.sLogging', { count: k }) : t('digest.sLoggingNone'));
  return out;
}
