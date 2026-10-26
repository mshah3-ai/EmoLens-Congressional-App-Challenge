/**
 * One report (the same as the phone's PDF) inside a portal page. Built on the server from checked data by the shared
 * report code, which escapes all text; its styles are scoped to `.emolens-report` so they don't restyle the portal.
 */
import { renderReportEmbedded, translator, type ReportData } from '@emolens/reports';

export function ReportView({ data }: { data: ReportData }) {
  const { css, body } = renderReportEmbedded(data, translator(data.lang));
  return (
    <>
      <style>{css}</style>
      <article lang={data.lang} className="emolens-report rounded-2xl bg-white p-6 text-[#1F2433] print:p-0" data-testid="report"
        dangerouslySetInnerHTML={{ __html: body }} />
    </>
  );
}
