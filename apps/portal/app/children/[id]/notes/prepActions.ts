'use server';
/**
 * "Draft session prep" (SPEC 24.2), clinicians only: build the redacted summary for the chosen range, ask the
 * ai-session-prep function (which checks the clinician role again on the server), and save the answer as a
 * clinician note of kind 'session_prep_draft', labelled "AI draft: review and edit before use." The clinician can edit
 * it and mark it final ('session_prep_final').
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { restoreText, serverTimeMs } from '@emolens/shared';
import { rangeBounds } from '@emolens/engine';
import { assembleReport } from '@emolens/reports';
import { allRows, latestSnapshot, reportInputs } from '@/lib/data';
import { requireChild } from '@/lib/session';
import { checkedRange, sessionPrepSummary } from '@/lib/sessionPrep';
import { createClient } from '@/lib/supabase/server';

export async function draftSessionPrep(childId: string, form: FormData): Promise<void> {
  const { child, role, supabase, userId } = await requireChild(childId);
  const back = (error?: string) => redirect(`/children/${childId}/notes${error ? `?prepError=${error}` : ''}`);
  if (role !== 'clinician') back('not_clinician');
  const range = checkedRange(form.get('from'), form.get('to'));
  if (!range) back('bad_range');
  const { from, to } = range!;
  const now = Date.now();
  const inputs = await reportInputs(supabase, child, from, to, await latestSnapshot(supabase, childId));
  const data = assembleReport(inputs, { from, to, audience: 'clinician', noteIds: [], lang: 'en', now, pageSize: 'letter' });
  const [start, end] = rangeBounds(from, to, child.home_tz);
  const notes = await allRows((a, b) => supabase.from('notes').select('noted_at, text').eq('child_id', childId).is('deleted_at', null)
    .gte('noted_at', new Date(start).toISOString()).lt('noted_at', new Date(end).toISOString()).order('noted_at').range(a, b));
  const summary = sessionPrepSummary(data, notes.map((n) => ({ at: serverTimeMs(n.noted_at), text: String(n.text) })));

  const { data: res, error } = await supabase.functions.invoke('ai-session-prep', { body: { child_id: childId, summary, language: 'en' }, timeout: 120_000 });
  if (error) {
    let key = 'server_error';
    const r = (error as { context?: unknown }).context;
    if (r instanceof Response) { try { key = String(((await r.json()) as { error?: string }).error ?? key); } catch { /* not JSON */ } }
    back(key);
  }
  const draft = restoreText(String((res as { draft: string }).draft), child.nickname).slice(0, 20_000);
  await supabase.from('clinician_notes').insert({ child_id: childId, author_id: userId, body: draft, kind: 'session_prep_draft' });
  revalidatePath(`/children/${childId}/notes`);
  back();
}

export async function markFinal(childId: string, noteId: string, form: FormData): Promise<void> {
  const body = String(form.get('body') ?? '').trim().slice(0, 20_000);
  const supabase = await createClient();
  await supabase.from('clinician_notes').update({ body, kind: 'session_prep_final', updated_at: new Date().toISOString() }).eq('id', noteId);
  revalidatePath(`/children/${childId}/notes`);
}
