/**
 * Print-optimized report (SPEC 24.1): the same sections as the phone's PDF, built with the same code
 * (@emolens/reports assembleReport + renderReport). Patterns, time of day and forecast quality come from the newest
 * snapshot shared by the family's phone. Print it to PDF from the browser.
 */
import { addDays, localDateOf } from '@emolens/engine';
import { assembleReport, type Audience } from '@emolens/reports';
import { PrintButton } from '@/components/PrintButton';
import { ReportView } from '@/components/ReportView';
import { latestSnapshot, reportInputs } from '@/lib/data';
import { requireChild } from '@/lib/session';

export default async function Report({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ days?: string; audience?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { child, supabase } = await requireChild(id);
  const days = [14, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const audience: Audience = sp.audience === 'family' || sp.audience === 'school' ? sp.audience : 'clinician';
  const to = localDateOf(Date.now(), child.home_tz), from = addDays(to, -(days - 1));
  const snap = await latestSnapshot(supabase, id);
  const data = assembleReport(await reportInputs(supabase, child, from, to, snap),
    { from, to, audience, noteIds: [], lang: 'en', now: Date.now(), pageSize: 'letter' });
  const link = (d: number, a: Audience, label: string) => (
    <a className={`rounded-full border px-3 py-1 ${d === days && a === audience ? 'border-primary' : 'border-line'}`} href={`?days=${d}&audience=${a}`}>{label}</a>
  );
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2 text-sm">
        {link(14, audience, '2 weeks')}{link(30, audience, '30 days')}{link(90, audience, '90 days')}
        <span className="mx-2 text-muted">|</span>
        {link(days, 'clinician', 'Clinician')}{link(days, 'family', 'Family')}{link(days, 'school', 'School')}
        <span className="flex-1" />
        <PrintButton />
      </div>
      {!snap ? <p className="no-print text-sm text-muted">Patterns and forecast quality appear after the family&apos;s phone shares its first daily summary.</p> : null}
      <ReportView data={data} />
    </div>
  );
}
