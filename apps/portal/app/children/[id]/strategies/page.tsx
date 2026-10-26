/** Strategy statistics (SPEC 24.1) from the newest snapshot: how often each calming strategy helped, with its range. */
import { latestSnapshot } from '@/lib/data';
import { requireChild } from '@/lib/session';

export default async function Strategies({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireChild(id);
  const snap = await latestSnapshot(supabase, id);
  const rows = (snap?.strategies ?? []).slice().sort((a, b) => b.uses - a.uses);
  if (!snap) return <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">Strategy statistics appear after the family&apos;s phone shares its first daily summary.</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full text-sm" data-testid="strategies-table">
        <thead className="bg-bg text-left"><tr>{['Strategy', 'When', 'Times with an answer', 'Helped (estimate)', 'Likely range'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={`${s.name}|${s.context}`} className="border-t border-line">
              <td className="px-3 py-2 font-semibold">{s.name}</td>
              <td className="px-3 py-2">{s.context === 'during' ? 'During a hard moment' : 'After a heads-up'}</td>
              <td className="px-3 py-2">{s.uses}</td>
              <td className="px-3 py-2">{Math.round(s.mean * 100)}%</td>
              <td className="px-3 py-2">{s.lo80 == null || s.hi80 == null ? '–' : `${Math.round(s.lo80 * 100)}–${Math.round(s.hi80 * 100)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
