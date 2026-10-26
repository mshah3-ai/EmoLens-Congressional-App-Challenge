'use server';
/** Clinician notes (SPEC 24.1): row-level security lets only a clinician write, and only notes signed as themselves. */
import { revalidatePath } from 'next/cache';
import { createClient, currentUserId } from '@/lib/supabase/server';

export async function saveNote(childId: string, noteId: string | null, form: FormData): Promise<void> {
  const body = String(form.get('body') ?? '').trim().slice(0, 20_000);
  const userId = await currentUserId();
  if (!body || !userId) return;
  const supabase = await createClient();
  if (noteId) await supabase.from('clinician_notes').update({ body, updated_at: new Date().toISOString() }).eq('id', noteId);
  else await supabase.from('clinician_notes').insert({ child_id: childId, author_id: userId, body, kind: 'note' });
  revalidatePath(`/children/${childId}/notes`);
}

export async function deleteNote(childId: string, noteId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from('clinician_notes').update({ deleted_at: new Date().toISOString() }).eq('id', noteId);
  revalidatePath(`/children/${childId}/notes`);
}
