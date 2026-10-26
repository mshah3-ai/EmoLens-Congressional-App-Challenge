/**
 * Import FIRST in tests that talk to the local Supabase with Node's HTTP client (undici): Jest's test environment
 * replaces `performance` with one that lacks `markResourceTiming`, which undici reads once when it loads and calls after
 * every response ("markResourceTiming is not a function"). This puts Node's own back.
 */
import { performance as nodePerformance } from 'node:perf_hooks';

type WithTiming = { markResourceTiming?: (...args: unknown[]) => unknown };
const perf = globalThis.performance as unknown as WithTiming;
if (typeof perf.markResourceTiming !== 'function') {
  const native = (nodePerformance as unknown as WithTiming).markResourceTiming;
  perf.markResourceTiming = native ? native.bind(nodePerformance) : () => undefined;
}
