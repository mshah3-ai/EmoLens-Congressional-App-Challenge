/** Where the emailed sign-in link lands: turns the link's one-time code into a session cookie, then continues. */
import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const nextParam = url.searchParams.get('next') ?? '/children';
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/children';
  const supabase = await createClient();
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  return NextResponse.redirect(new URL(ok ? next : '/login?error=link', url.origin));
}
