/** Local error log shown in About → Diagnostics (SPEC 29). Messages never contain personal data. */
import { all, type Executor } from '../types';
import type { ErrorRow } from '../rows';
import { newId, nowIso } from '../time';

/**
 * Keep only the error's class and a short message, with anything that could hold personal data removed: file paths
 * (a shared file's name can contain the child's nickname) and quoted text (some parsers quote the input they choke on).
 * A step-labelled error (src/lib/steps.ts) keeps its label: "load: TypeError: ...".
 */
export function safeMessage(e: unknown): string {
  const raw = e instanceof Error ? (e.name === 'StepError' ? e.message : `${e.name}: ${e.message}`) : String(e);
  return raw
    .replace(/(file|content|ph|assets-library):\/\/[^\s'"),]*/gi, '$1://…')
    .replace(/"[^"\n]{3,}"/g, '"…"')
    .slice(0, 300);
}

/** The first few lines of the stack (function and file names from the app's code, no data), for the dev terminal. */
function stackHead(e: unknown): string {
  return e instanceof Error && e.stack ? e.stack.split('\n').slice(1, 6).map((l) => l.trim()).join('\n  ') : '';
}

/**
 * Saves an error for About → Diagnostics (newest 200 kept) and, while developing, prints it in the dev terminal
 * (Metro), so failures are never only a toast. `area` names the feature and step, e.g. "report.pdf".
 */
export async function recordError(ex: Executor, area: string, e: unknown): Promise<void> {
  const message = safeMessage(e);
  if (typeof __DEV__ !== 'undefined' && __DEV__ && process.env.NODE_ENV !== 'test') {
    console.error(`[EmoLens] ${area}: ${message}${stackHead(e) ? `\n  ${stackHead(e)}` : ''}`);
  }
  try {
    await ex.execute('INSERT INTO app_errors (id, at, area, message) VALUES (?, ?, ?, ?)', [newId(), nowIso(), area, message]);
    await ex.execute('DELETE FROM app_errors WHERE id NOT IN (SELECT id FROM app_errors ORDER BY at DESC LIMIT 200)');
  } catch {
    // The error log must never cause another error.
  }
}

export const listErrors = (ex: Executor) => all<ErrorRow>(ex, 'SELECT * FROM app_errors ORDER BY at DESC LIMIT 100');
