/**
 * Network GET for the free data APIs (SPEC 29): 10-second timeout and 2 retries with exponential backoff
 * (0.5 s, then 1 s). A 4xx answer (like "not found") is not retried: asking again won't help.
 */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = 'HttpError'; }
}

export interface GetOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  /** Replaceable in tests. */
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function getJson<T>(url: string, opts: GetOptions = {}): Promise<T> {
  const { headers, timeoutMs = 10_000, retries = 2, fetchFn = fetch, sleep = defaultSleep } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchFn(url, { headers, signal: controller.signal });
      if (!res.ok) {
        const err = new HttpError(res.status, `HTTP ${res.status}`);
        if (res.status >= 400 && res.status < 500 && res.status !== 429) throw err; // client error: don't retry
        lastError = err;
        continue;
      }
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 429) throw e;
      lastError = e instanceof Error && e.name === 'AbortError' ? new Error('Request timed out') : e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Network request failed');
}

/** Never put personal data in a URL we log; this strips the query string for error messages. */
export const urlForLog = (url: string) => url.split('?')[0];
