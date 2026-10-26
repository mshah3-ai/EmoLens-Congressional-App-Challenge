/**
 * Nickname redaction (SPEC 19.2, 27.1): before anything is sent to the AI provider, the child's nickname is replaced
 * with "[CHILD]"; answers are shown with the nickname put back. The phone and the clinician portal both use this.
 *
 * Rules:
 *  - whole word only: "Max" is replaced in "Max's day" and "MAX was upset", not inside "Maxwell";
 *  - case-insensitive, including accented letters ("ÁNGEL" matches "Ángel");
 *  - deterministic: the same text always gives the same result (needed so a conversation sent again is identical).
 * Text is first put in Unicode NFC form, so "é" typed as one character or as "e" + accent is treated the same.
 */

export const CHILD_PLACEHOLDER = '[CHILD]';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A word boundary that understands letters of every language (plain \b only knows A-Z). */
const NOT_WORD_BEFORE = '(?<![\\p{L}\\p{M}\\p{N}_])';
const NOT_WORD_AFTER = '(?![\\p{L}\\p{M}\\p{N}_])';

function nicknamePattern(nickname: string): RegExp | null {
  const n = nickname.normalize('NFC').trim();
  if (!n) return null;
  return new RegExp(`${NOT_WORD_BEFORE}${escapeRegExp(n)}${NOT_WORD_AFTER}`, 'giu');
}

/** Replaces every whole-word occurrence of the nickname with [CHILD]. */
export function redactText(text: string, nickname: string): string {
  const re = nicknamePattern(nickname);
  const t = text.normalize('NFC');
  return re ? t.replace(re, CHILD_PLACEHOLDER) : t;
}

/** Redacts every string inside a JSON-like value (object keys are field names, not data, and are kept). */
export function redactDeep<T>(value: T, nickname: string): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return redactText(v, nickname);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

/** Puts the nickname back into an AI answer for display. */
export function restoreText(text: string, nickname: string): string {
  return nickname.trim() ? text.split(CHILD_PLACEHOLDER).join(nickname.trim()) : text;
}

/** True when `text` still contains the nickname as a whole word (used by tests and as a last check before sending). */
export function containsNickname(text: string, nickname: string): boolean {
  const re = nicknamePattern(nickname);
  return re ? re.test(text.normalize('NFC')) : false;
}
