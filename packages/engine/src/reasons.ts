/** Top reasons behind a forecast (spec 13.8), rendered from Appendix B templates. */
import { FEATURE_COPY, REASON_MIN_CONTRIBUTION, TOD_KEYS, fmt, type Lang } from '@emolens/shared';
import type { InsightStatus } from './insights';

export interface Reason {
  key: string; contribution: number; direction: 'raises' | 'lowers'; estimated: boolean;
  text: string; params: Record<string, number | string>;
}

export interface ReasonInput {
  keys: string[];
  contributions: number[];
  statuses: Record<string, InsightStatus>;
  estimated: string[];
  params: { sleepDeficitHours: number; transitions: number };
  lang?: Lang;
}

const shownStatus = (st: InsightStatus | undefined) => st === 'possible' || st === 'likely' || st === 'strong';

/** Appendix B.6 template for one feature, filled in; null when the feature has no template for that direction. */
function renderReason(inp: ReasonInput, key: string, c: number, raising: boolean): Reason | null {
  const lang = inp.lang ?? 'en';
  const estimated = inp.estimated.includes(key);
  const copy = FEATURE_COPY[key];
  const tmpl = raising ? copy?.raise : copy?.protect;
  if (!tmpl) return null;
  const params = {
    h: inp.params.sleepDeficitHours.toFixed(1), n: inp.params.transitions,
    est: estimated ? (lang === 'es' ? ' (estimado)' : ' (expected)') : '',
  };
  return { key, contribution: c, direction: raising ? 'raises' : 'lowers', estimated, text: fmt(tmpl[lang], params, lang), params };
}

export function buildReasons(inp: ReasonInput): { raising: Reason[]; protective: Reason | null } {
  const candidates: { key: string; c: number }[] = [];
  inp.keys.forEach((key, j) => {
    const ok = key === 'recent_episode' || TOD_KEYS.includes(key) || shownStatus(inp.statuses[key]);
    if (ok) candidates.push({ key, c: inp.contributions[j] });
  });
  const render = (key: string, c: number, raising: boolean) => renderReason(inp, key, c, raising);
  const raising = candidates.filter((x) => x.c >= REASON_MIN_CONTRIBUTION).sort((a, b) => b.c - a.c)
    .map((x) => render(x.key, x.c, true)).filter((r): r is Reason => r !== null).slice(0, 3);
  const low = candidates.filter((x) => x.c <= -0.2).sort((a, b) => a.c - b.c);
  let protective: Reason | null = null;
  for (const x of low) { protective = render(x.key, x.c, false); if (protective) break; }
  return { raising, protective };
}

/**
 * The ABC export's `antecedent_auto` column (spec 22.3): every factor active in an episode's block with a positive
 * contribution >= REASON_MIN_CONTRIBUTION, strongest first, as reason texts. Unlike `buildReasons` there is no top-3 cut.
 * Time of day is left out (it is when, not what came before), and so are factors whose pattern isn't shown yet
 * (not_enough_data, checking, no_clear_link...): the export shouldn't name a factor the app itself doesn't present.
 */
export function antecedentFactors(inp: ReasonInput): Reason[] {
  return inp.keys
    .map((key, j) => ({ key, c: inp.contributions[j] }))
    .filter((x) => x.c >= REASON_MIN_CONTRIBUTION && !TOD_KEYS.includes(x.key) && x.key !== 'intercept'
      && (x.key === 'recent_episode' || shownStatus(inp.statuses[x.key])))
    .sort((a, b) => b.c - a.c)
    .map((x) => renderReason(inp, x.key, x.c, true))
    .filter((r): r is Reason => r !== null);
}
