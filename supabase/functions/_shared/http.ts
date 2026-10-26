/**
 * JSON responses and CORS for every edge function (SPEC 7.4). Rules:
 * - Browsers may call the functions only from the portal (PORTAL_URL) or a local development portal.
 *   The phone app isn't a browser, so CORS doesn't apply to it.
 * - Request and response bodies are never logged (they can contain a child's data). Errors are short codes like
 *   {"error":"not_owner"}; the app turns them into friendly words.
 */

const DEV_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

/** The origin to echo back in Access-Control-Allow-Origin, or null when this origin may not call us from a browser. */
export function allowedOrigin(origin: string | null, portalUrl: string | undefined): string | null {
  if (!origin) return null;
  const allowed = [...DEV_ORIGINS];
  if (portalUrl) {
    try { allowed.push(new URL(portalUrl).origin); } catch { /* a bad PORTAL_URL allows nothing extra */ }
  }
  return allowed.includes(origin) ? origin : null;
}

export function corsHeaders(req: Request, portalUrl: string | undefined): Record<string, string> {
  const origin = allowedOrigin(req.headers.get('origin'), portalUrl);
  return origin
    ? {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      Vary: 'Origin',
    }
    : { Vary: 'Origin' };
}

export function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** Error codes the functions return (the app and portal translate them). */
export type ErrorCode =
  | 'bad_request' | 'unauthorized' | 'not_owner' | 'not_found' | 'expired' | 'too_many_tries' | 'already_member'
  | 'unavailable' | 'too_large' | 'server_error' | 'method_not_allowed'
  // AI functions (Phase 8): over today's limit / the AI provider failed or isn't set up / it declined / not a clinician
  | 'daily_limit' | 'ai_unavailable' | 'ai_declined' | 'not_clinician';

export const fail = (code: ErrorCode, status: number, headers: Record<string, string> = {}) => json({ error: code }, status, headers);

/** Reads a JSON object body; null when it is missing or not an object. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
