/**
 * Display names shared by the app screens, the PDF report and the digest, so each value is shown the same way
 * everywhere:
 *  - a "worth watching" item's name: calendar tags are stored as keys ("transition") and shown with their label
 *    ("Transitions" / "Transiciones"); foods, medications and places keep their own names;
 *  - a pattern's precision ("How precisely known"): the engine gives a whole number from 0 to 100, so it is shown
 *    as-is with a "%" (it is not a 0-1 fraction; multiplying it again showed "3900%").
 */
export function watchItemName(w: { kind: string; label: string }, t: (key: string) => string): string {
  return w.kind === 'calendar_tag' ? t(`watch.tags.${w.label}`) : w.label;
}

/** Engine `confidence` (0-100) as "39%". */
export const precisionPct = (confidence: number): string => `${Math.round(Math.min(100, Math.max(0, confidence)))}%`;
