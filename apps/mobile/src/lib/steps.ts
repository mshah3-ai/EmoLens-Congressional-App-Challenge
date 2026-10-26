/**
 * Labels which step of a multi-step job failed, so an error in About → Diagnostics says where it happened:
 * "report.pdf · render: TypeError: ..." instead of only "Couldn't create the file" (BUGS.md #11).
 * Steps used by the file features: load (read the data), render / build (make the page or file text), print (PDF),
 * save / write (put the file in the cache folder), share (open the share sheet), and for importing: pick, read, check,
 * import.
 */

export class StepError extends Error {
  readonly step: string;
  readonly original: unknown;
  constructor(step: string, original: unknown) {
    super(`${step}: ${original instanceof Error ? `${original.name}: ${original.message}` : String(original)}`);
    this.name = 'StepError';
    this.step = step;
    this.original = original;
    if (original instanceof Error && original.stack) this.stack = `StepError: ${this.message}\n${original.stack.split('\n').slice(1).join('\n')}`;
  }
}

/** Runs one step; if it throws, the error is re-thrown labelled with the step (the innermost label wins). */
export async function step<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw e instanceof StepError ? e : new StepError(name, e);
  }
}

/** The error underneath any step labels. */
export const rootError = (e: unknown): unknown => (e instanceof StepError ? rootError(e.original) : e);

/** The toast for a failed file feature: the share sheet isn't available, or the generic "Couldn't create the file". */
export function failureToastKey(e: unknown): 'reports.shareUnavailable' | 'reports.failed' {
  const root = rootError(e);
  return root instanceof Error && root.message === 'sharing_unavailable' ? 'reports.shareUnavailable' : 'reports.failed';
}
