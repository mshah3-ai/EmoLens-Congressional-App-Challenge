/** Helpers for pages: the signed-in person and the child they are looking at (or a redirect / 404). */
import { notFound, redirect } from 'next/navigation';
import { childContext, type ChildContext } from './data';
import { createClient, currentUserId } from './supabase/server';

export async function requireUser(): Promise<{ userId: string; supabase: Awaited<ReturnType<typeof createClient>> }> {
  const userId = await currentUserId();
  if (!userId) redirect('/login');
  return { userId, supabase: await createClient() };
}

/** The child and the viewer's role; 404 when they aren't on this child's team (RLS would show nothing anyway). */
export async function requireChild(id: string): Promise<ChildContext & { supabase: Awaited<ReturnType<typeof createClient>>; userId: string }> {
  const { userId, supabase } = await requireUser();
  const ctx = await childContext(supabase, userId, id);
  if (!ctx) notFound();
  return { ...ctx, supabase, userId };
}

export const ROLE_LABEL: Record<string, string> = { owner: 'Parent (owner)', caregiver: 'Caregiver', teacher: 'Teacher', clinician: 'Clinician' };
