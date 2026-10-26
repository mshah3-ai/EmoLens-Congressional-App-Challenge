/** Hard moments (SPEC 24.1): a filterable table with a CSV download. Teachers see those at school and their own (RLS). */
import { dateYearIn, shortDateIn, timeIn, translator } from '@emolens/reports';
import { localDateOf } from '@emolens/engine';
import { filtersFrom, loadEpisodes } from '@/lib/episodes';
import { requireChild } from '@/lib/session';

export default async function Episodes({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const { child, supabase } = await requireChild(id);
  const f = filtersFrom(await searchParams, child.home_tz);
  const rows = await loadEpisodes(supabase, child, f);
  const t = translator('en');
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== '' && v !== 0).map(([k, v]) => [k === 'minIntensity' ? 'min' : k, String(v)]));
  const input = 'rounded-lg border border-line bg-surface px-2 py-1';
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4 text-sm" method="get">
        <label className="flex flex-col gap-1">From<input className={input} type="date" name="from" defaultValue={f.from} /></label>
        <label className="flex flex-col gap-1">To<input className={input} type="date" name="to" defaultValue={f.to} /></label>
        <label className="flex flex-col gap-1">Type
          <select className={input} name="type" defaultValue={f.type}>
            <option value="">Any</option>
            {['meltdown', 'shutdown', 'other'].map((x) => <option key={x} value={x}>{t(`episode.types.${x}`)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Intensity at least
          <select className={input} name="min" defaultValue={String(f.minIntensity)}>
            {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n || 'Any'}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Setting
          <select className={input} name="setting" defaultValue={f.setting}>
            <option value="">Any</option>
            {['home', 'school', 'therapy', 'medical', 'relative', 'store_public', 'park_outdoor', 'other', 'away_untagged'].map((x) =>
              <option key={x} value={x}>{t(`places.types.${x}`)}</option>)}
          </select>
        </label>
        <button className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-white" type="submit">Show</button>
        <a className="text-primary underline" href={`/children/${id}/episodes/csv?${qs}`} download>Download CSV</a>
      </form>
      <p className="text-sm text-muted">{rows.length} hard moments, {dateYearIn('en', f.from)} – {dateYearIn('en', f.to)}</p>
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full text-sm" data-testid="episodes-table">
          <thead className="bg-bg text-left">
            <tr>{['Date', 'Time', 'Type', 'Intensity', 'Minutes', 'Setting', 'Before', 'What it looked like'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-3 py-2">{shortDateIn('en', localDateOf(e.startedAt, child.home_tz))}</td>
                <td className="whitespace-nowrap px-3 py-2">{timeIn('en', e.startedAt, child.home_tz)}</td>
                <td className="px-3 py-2">{t(`episode.types.${e.type}`)}</td>
                <td className="px-3 py-2">{e.intensity ?? '–'}</td>
                <td className="px-3 py-2">{e.durationMin ?? '–'}</td>
                <td className="px-3 py-2">{e.placeType ? t(`places.types.${e.placeType}`) : '–'}</td>
                <td className="px-3 py-2">{[...e.antecedentTags.map((x) => t(`tags.antecedent.${x}`)), e.antecedentNote].filter(Boolean).join(', ')}</td>
                <td className="px-3 py-2">{e.behaviorTags.map((x) => t(`tags.behavior.${x}`)).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
