/**
 * Medications (SPEC 24.1): the list, change timeline and adherence over the last 30 days (engine `adherence`). Row-level
 * security returns nothing to a teacher, so the page says so instead of showing an empty list.
 */
import { addDays, localDateOf } from '@emolens/engine';
import { assembleReport, dateYearIn } from '@emolens/reports';
import { reportInputs } from '@/lib/data';
import { requireChild } from '@/lib/session';

export default async function Medications({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { child, role, supabase } = await requireChild(id);
  if (role === 'teacher') return <p className="rounded-2xl border border-line bg-surface p-4" data-testid="not-shared">Medications aren&apos;t shared with teachers.</p>;
  const to = localDateOf(Date.now(), child.home_tz), from = addDays(to, -29);
  const data = assembleReport(await reportInputs(supabase, child, from, to, null),
    { from, to, audience: 'clinician', noteIds: [], lang: 'en', now: Date.now(), pageSize: 'letter' });
  const meds = data.medications ?? { list: [], changes: [] };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Last 30 days: {dateYearIn('en', from)} – {dateYearIn('en', to)}. EmoLens never suggests medication changes; discuss any
        pattern with the prescriber.</p>
      {meds.list.length ? (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full text-sm" data-testid="medications-table">
            <thead className="bg-bg text-left"><tr>{['Medication', 'Schedule', 'Taken on time or late', 'Missed'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
            <tbody>
              {meds.list.map((m) => (
                <tr key={m.id} className="border-t border-line">
                  <td className="px-3 py-2 font-semibold">{m.name}{m.strength ? ` · ${m.strength}` : ''}</td>
                  <td className="px-3 py-2">{m.asNeeded ? 'As needed' : m.times.join(', ') || '–'}</td>
                  <td className="px-3 py-2">{m.adherence.rate == null ? '–' : `${Math.round(m.adherence.rate * 100)}% (${m.adherence.taken + m.adherence.late} of ${m.adherence.scheduled})`}</td>
                  <td className="px-3 py-2">{m.adherence.missed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">No medications logged in this period.</p>}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-lg font-semibold">Changes</h2>
        {meds.changes.length ? (
          <ul className="mt-2 space-y-1 text-sm">
            {meds.changes.map((c, i) => <li key={i}>{dateYearIn('en', localDateOf(c.at, child.home_tz))}: {c.name}, {c.changeType.replace('_', ' ')}{c.newValue ? ` (${c.oldValue ?? '–'} → ${c.newValue})` : ''}</li>)}
          </ul>
        ) : <p className="text-sm text-muted">No changes in this period.</p>}
      </section>
    </div>
  );
}
