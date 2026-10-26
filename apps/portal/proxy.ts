/**
 * Runs before every page (Next.js "proxy", formerly middleware):
 *  1. a Content-Security-Policy with a fresh random nonce: only the portal's own scripts carrying that nonce may run,
 *     so even text that looked like HTML in a report could never run as code (SPEC 24.4);
 *  2. refreshes the Supabase sign-in session (cookies);
 *  3. sends signed-out visitors to /login, except for the login pages and public share links.
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseEnv } from './src/lib/env';

const PUBLIC = ['/login', '/auth', '/share'];

export function contentSecurityPolicy(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'", // report pages carry their own print styles
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`, // the browser never talks to Supabase directly: the server does
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === 'development');
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);

  let response = NextResponse.next({ request: { headers } });
  const { url, key } = supabaseEnv();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers } });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });
  // Nothing may run between creating the client and getClaims() (Supabase's advice: it refreshes the session).
  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  if (!data?.claims && !PUBLIC.some((p) => path === p || path.startsWith(`${p}/`))) {
    const to = request.nextUrl.clone();
    to.pathname = '/login';
    to.search = path === '/' ? '' : `?next=${encodeURIComponent(path)}`;
    const redirect = NextResponse.redirect(to);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    redirect.headers.set('Content-Security-Policy', csp);
    return redirect;
  }
  response.headers.set('Content-Security-Policy', csp);
  if (path.startsWith('/share')) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
