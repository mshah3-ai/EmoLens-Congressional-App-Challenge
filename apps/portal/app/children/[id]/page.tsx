/**
 * A child's overview (SPEC 24.1): hard moments in the last 30 days vs the 30 before, the calendar heatmap, and, from
 * the newest snapshot the family's phone shared, the time-of-day chart, patterns and forecast quality, with when it
 * was computed. Numbers come from the engine (episodeSummary) and charts from the shared report code.
 */
import { STATUS_SORT, addDays, episodeSummary, localDateOf } from '@emolens/engine';
import { blockRangeIn, calendarHeatmap, dateYearIn, pct, precisionPct, rateBarChart, shortDateIn, translator, weekdayShortIn } from '@emolens/reports';
import { serverTimeMs, type EpisodeType } from '@emolens/shared';
import type { ReactNode } from 'react';
import { Svg } from '@/components/Svg';
import { allRows, latestSnapshot } from '@/lib/data';
import { requireChild } from '@/lib/session';

export default async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { child, supabase } = await requireChild(id);
  const tz = child.home_tz;
  const t = translator('en');
  const today = localDateOf(Date.now(), tz);
  const from = addDays(today, -29), prevFrom = addDays(today, -59);
  const rows = await allRows((a, b) => supabase.from('episodes').select('started_at, duration_min, type, intensity').eq('child_id', id).is('deleted_at', null)
    .gte('started_at', new Date(Date.parse(`${prevFrom}T00:00:00Z`) - 86_400_000).toISOString()).order('started_at').range(a, b));
  const eps = rows.map((e) => ({ startedAt: serverTimeMs(e.started_at), durationMin: e.duration_min as number | null, type: e.type as EpisodeType, intensity: e.intensity as number | null }));
  const now = episodeSummary(eps, from, today, tz);
  const before = episodeSummary(eps, prevFrom, addDays(from, -1), tz);
  const snap = await latestSnapshot(supabase, id);
  const change = before.total ? Math.round(((now.total - before.total) / before.total) * 100) : null;
  const patterns = (snap?.insights ?? []).filter((p) => ['strong', 'likely', 'possible', 'protective'].includes(p.status))
    .sort((a, b) => STATUS_SORT.indexOf(a.status) - STATUS_SORT.indexOf(b.status) || b.confidence - a.confidence);
  const health = snap?.health?.health?.last28;

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-3" data-testid="kpis">
        <Kpi value={String(now.total)} label="hard moments in the last 30 days" />
        <Kpi value={change == null ? '–' : `${change > 0 ? '+' : ''}${change}%`} label={`vs the 30 days before (${before.total})`} />
        <Kpi value={now.avgIntensity == null ? '–' : `${now.avgIntensity.toFixed(1)} / 5`} label="average intensity" />
      </section>

      <Card title="Hard moments by day (last 30 days)">
        <Svg label={`Hard moments per day for ${child.nickname}`} svg={calendarHeatmap(now.perDay, {
          title: `Hard moments per day for ${child.nickname}`,
          weekdayLabels: ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'].map((x) => weekdayShortIn('en', x)),
          weekLabel: (d) => shortDateIn('en', d),
        })} />
      </Card>

      {snap ? (
        <>
          <p className="text-sm text-muted" data-testid="snapshot-time">
            Computed on the family&apos;s phone on {dateYearIn('en', localDateOf(snap.computedAt, tz))}. Patterns use data that stays on that phone
            (weather, sound, calendar), so they are shown as the phone computed them.
          </p>
          <Card title="Time of day">
            {snap.timeOfDay.some((r) => r.n > 0) ? (
              <Svg label="Share of time blocks with a hard moment, by time of day" svg={rateBarChart(snap.timeOfDay.map((r) => ({
                label: blockRangeIn('en', r.index), rate: r.rate, lo: r.lo80, hi: r.hi80, caption: `${r.k}/${r.n}` })), { title: t('report.timeOfDayTitle'), format: pct })} />
            ) : <p className="text-sm text-muted">Not enough data yet.</p>}
          </Card>
          <Card title="Patterns">
            {patterns.length ? (
              <ul className="divide-y divide-line" data-testid="patterns">
                {patterns.map((p) => (
                  <li key={p.key} className="py-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold">{p.sentence}</span>
                      <span className="rounded-full bg-bg px-2 py-0.5 text-xs">{t(`status.${p.status}`)}</span>
                    </div>
                    <div className="text-xs text-muted">Likely range {p.range} · how precisely known {precisionPct(p.confidence)} · seen in {p.exposed} time blocks</div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No patterns yet: patterns appear after about two weeks of logging.</p>}
            <p className="mt-2 text-xs text-muted">Patterns are statistical links in caregiver-logged data, not causes or a diagnosis.</p>
          </Card>
          <Card title="Forecast quality (last 28 days)">
            {health?.enough ? (
              <p className="text-sm" data-testid="model-health">
                {health.n} checked forecasts · skill vs a time-of-day guess {health.skill == null || Number.isNaN(health.skill) ? '–' : `${Math.round(health.skill * 100)}%`}
                {' · '}AUROC {health.auroc == null ? '–' : health.auroc.toFixed(2)}
              </p>
            ) : <p className="text-sm text-muted">Forecast quality appears after 20 checked forecasts.</p>}
          </Card>
        </>
      ) : (
        <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted" data-testid="no-snapshot">
          Patterns and forecasts appear here after the family&apos;s phone shares its first daily summary{' '}
          (not shown to teachers).
        </p>
      )}
    </div>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-2xl border border-line bg-surface p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
