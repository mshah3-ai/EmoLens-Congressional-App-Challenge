'use server';
/** A clinician (or anyone invited) types the invite code in the portal (SPEC 23.2: "Clinicians can use {portal URL}"). */
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const MESSAGES: Record<string, string> = {
  not_found: 'That code wasn’t found. Check it and try again.',
  expired: 'That code has expired or was already used. Ask the family for a new one.',
  too_many_tries: 'Too many wrong codes. Please wait an hour and try again.',
  already_member: 'You’re already on this care team.',
};

export async function joinTeam(_prev: string | null, form: FormData): Promise<string | null> {
  const code = String(form.get('code') ?? '');
  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke('invite-accept', { body: { code } });
  if (error) {
    let key = 'server_error';
    const res = (error as { context?: unknown }).context;
    if (res instanceof Response) { try { key = String(((await res.json()) as { error?: string }).error ?? key); } catch { /* not JSON */ } }
    return MESSAGES[key] ?? 'Joining didn’t work. Try again in a moment.';
  }
  redirect(`/children/${(data as { child_id: string }).child_id}`);
}
