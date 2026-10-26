/** CSV download of the filtered hard-moments table (SPEC 24.1). Same rows the viewer sees on screen (RLS). */
import { localDateOf } from '@emolens/engine';
import { timeIn, translator } from '@emolens/reports';
import { toCsv } from '@/lib/csv';
import { filtersFrom, loadEpisodes } from '@/lib/episodes';
import { requireChild } from '@/lib/session';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { child, supabase } = await requireChild(id);
  const f = filtersFrom(Object.fromEntries(new URL(request.url).searchParams), child.home_tz);
  const rows = await loadEpisodes(supabase, child, f);
  const t = translator('en');
  const csv = toCsv(['date', 'time', 'type', 'intensity', 'duration_min', 'setting', 'before', 'behavior'],
    rows.map((e) => [localDateOf(e.startedAt, child.home_tz), timeIn('en', e.startedAt, child.home_tz), e.type, e.intensity, e.durationMin,
      e.placeType ?? '', [...e.antecedentTags.map((x) => t(`tags.antecedent.${x}`)), e.antecedentNote].filter(Boolean).join('; '),
      e.behaviorTags.map((x) => t(`tags.behavior.${x}`)).join('; ')]));
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="emolens-hard-moments-${f.from}-to-${f.to}.csv"`,
      'Cache-Control': 'no-store' },
  });
}
