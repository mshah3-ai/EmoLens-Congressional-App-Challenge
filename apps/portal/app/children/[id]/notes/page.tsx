/**
 * Clinician notes (SPEC 24.1). Clinicians write and edit their own; the family (owner, caregivers) can read them.
 * Clinicians can also "Draft session prep" (SPEC 24.2): an AI draft from the synced data for a range (default: since
 * their last note, at most 60 days), saved as a note labelled "AI draft: review and edit before use.", which they edit
 * and mark final.
 */
import { serverTimeMs } from '@emolens/shared';
import { localDateOf } from '@emolens/engine';
import { dateYearIn } from '@emolens/reports';
import { requireChild } from '@/lib/session';
import { prepRange } from '@/lib/sessionPrep';
import { deleteNote, saveNote } from './actions';
import { draftSessionPrep, markFinal } from './prepActions';

const PREP_ERRORS: Record<string, string> = {
  daily_limit: 'You have reached today’s limit for AI requests. It resets tomorrow.',
  ai_unavailable: 'The AI isn’t available right now. Please try again later.',
  ai_declined: 'The AI couldn’t write this draft. Try a shorter date range.',
  not_clinician: 'Only the child’s clinicians can draft session prep.',
  bad_range: 'Choose a start date before the end date, at most 60 days apart.',
};

const KIND_LABEL: Record<string, string> = {
  session_prep_draft: 'AI draft: review and edit before use.',
  session_prep_final: 'Session prep (reviewed)',
};

export default async function Notes({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ prepError?: string }> }) {
  const { id } = await params;
  const { prepError } = await searchParams;
  const { child, role, supabase, userId } = await requireChild(id);
  const { data } = await supabase.from('clinician_notes').select('id, author_id, body, kind, created_at').eq('child_id', id).is('deleted_at', null)
    .order('created_at', { ascending: false });
  const notes = data ?? [];
  const canWrite = role === 'clinician';
  const area = 'w-full rounded-lg border border-line bg-surface p-2 text-sm';
  const mine = notes.filter((n) => n.author_id === userId);
  const range = prepRange(mine.length ? serverTimeMs(mine[0].created_at) : null, Date.now(), child.home_tz);
  return (
    <div className="space-y-4">
      {canWrite ? (
        <form action={draftSessionPrep.bind(null, id)} className="space-y-2 rounded-2xl border border-line bg-surface p-4" data-testid="session-prep">
          <h2 className="font-semibold">Draft session prep</h2>
          <p className="text-sm text-muted">An AI draft from the family&apos;s logged data for these dates (at most 60 days). It is not an assessment:
            review and edit it before use. The child&apos;s name is not sent to the AI provider.</p>
          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1">From<input type="date" name="from" defaultValue={range.from} required className="rounded-lg border border-line bg-surface p-1" /></label>
            <label className="flex flex-col gap-1">To<input type="date" name="to" defaultValue={range.to} required className="rounded-lg border border-line bg-surface p-1" /></label>
            <button className="rounded-lg bg-primary px-4 py-2 font-semibold text-white" type="submit">Draft session prep</button>
          </div>
          {prepError ? <p className="text-sm text-high" role="alert" data-testid="prep-error">{PREP_ERRORS[prepError] ?? 'The draft didn’t work. Please try again.'}</p> : null}
        </form>
      ) : null}
      {canWrite ? (
        <form action={saveNote.bind(null, id, null)} className="space-y-2 rounded-2xl border border-line bg-surface p-4" data-testid="new-note">
          <label className="block font-semibold" htmlFor="body">New note</label>
          <textarea id="body" name="body" rows={5} required maxLength={20000} className={area} />
          <button className="rounded-lg bg-primary px-4 py-2 font-semibold text-white" type="submit">Save note</button>
        </form>
      ) : <p className="text-sm text-muted">Notes written by the child&apos;s clinicians. Only clinicians can add notes.</p>}
      {notes.length ? notes.map((n) => (
        <article key={n.id} className="space-y-2 rounded-2xl border border-line bg-surface p-4">
          <div className="text-xs text-muted">{dateYearIn('en', localDateOf(serverTimeMs(n.created_at), child.home_tz))}{n.author_id === userId ? ' · you' : ''}</div>
          {KIND_LABEL[n.kind] ? <div className={`text-sm font-semibold ${n.kind === 'session_prep_draft' ? 'text-ink' : 'text-muted'}`} data-testid="note-kind">{KIND_LABEL[n.kind]}</div> : null}
          {canWrite && n.author_id === userId ? (
            <form action={saveNote.bind(null, id, n.id)} className="space-y-2">
              <textarea name="body" defaultValue={n.body} rows={n.kind === 'note' ? 4 : 16} className={area} aria-label="Edit note" />
              <div className="flex gap-3">
                <button className="rounded-lg border border-line px-3 py-1 text-sm" type="submit">Save</button>
                {n.kind === 'session_prep_draft'
                  ? <button className="rounded-lg border border-line px-3 py-1 text-sm" formAction={markFinal.bind(null, id, n.id)} type="submit">Save and mark final</button>
                  : null}
                <button className="text-sm text-high" formAction={deleteNote.bind(null, id, n.id)} type="submit">Delete</button>
              </div>
            </form>
          ) : <p className="whitespace-pre-wrap text-sm">{n.body}</p>}
        </article>
      )) : <p className="text-sm text-muted">No notes yet.</p>}
    </div>
  );
}
