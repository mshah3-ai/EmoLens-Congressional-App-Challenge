'use server';
/**
 * Sign-in for the portal (SPEC 24.1): an emailed magic link, or the 6-digit code from the same email. Runs on the
 * server, so the browser never talks to Supabase directly.
 */
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface LoginState { step: 'email' | 'code'; email: string; error: string | null }

const safeNext = (v: FormDataEntryValue | null) => {
  const s = typeof v === 'string' ? v : '';
  return s.startsWith('/') && !s.startsWith('//') ? s : '/children';
};

export async function sendLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get('email') ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { step: 'email', email, error: 'That doesn’t look like an email address.' };
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
  const next = safeNext(form.get('next'));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email, options: { shouldCreateUser: true, emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error) return { step: 'email', email, error: error.status === 429 ? 'Too many tries. Please wait a few minutes.' : 'The email couldn’t be sent. Try again.' };
  return { step: 'code', email, error: null };
}

export async function verifyCode(prev: LoginState, form: FormData): Promise<LoginState> {
  const code = String(form.get('code') ?? '').replace(/\D/g, '');
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: prev.email, token: code, type: 'email' });
  if (error) return { ...prev, error: 'That code didn’t work. Check it, or use the link in the email.' };
  redirect(safeNext(form.get('next')));
}
