/**
 * The HTML page around every PDF (the report and the digest): print CSS, paper size, and a footer on every page.
 * expo-print turns this HTML into a PDF with the phone's own web view (WebKit on iOS, Chromium on Android).
 * Paper: US Letter for US users, A4 everywhere else (SPEC 22.2). The footer (report name, page numbers) uses CSS page
 * margin boxes: Android's Chromium prints them; iOS's WebKit leaves them out (DECISIONS #74).
 */
import type { Lang } from '@emolens/shared';
import { esc } from '../svg';

/** A translation function (i18next's `t` for a fixed language). */
export type TFn = (key: string, options?: Record<string, unknown>) => string;

export type PageSize = 'letter' | 'a4';

/** PDF page size in points (72 per inch), as expo-print's printToFileAsync expects. */
export const PAGE_POINTS: Record<PageSize, { width: number; height: number }> = {
  letter: { width: 612, height: 792 },
  a4: { width: 595, height: 842 },
};

/** Letter for the United States (the SPEC's "US locale"), A4 otherwise. */
export const pageSizeForRegion = (region: string | null | undefined): PageSize => (region === 'US' ? 'letter' : 'a4');

const CSS = `
@page { size: SIZE; margin: 16mm 14mm 18mm 14mm;
  @bottom-left { content: FOOTER; font: 8.5px -apple-system, Helvetica, Arial, sans-serif; color: #6B7280; }
  @bottom-right { content: counter(page) " / " counter(pages); font: 8.5px -apple-system, Helvetica, Arial, sans-serif; color: #6B7280; } }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1F2433; font-size: 10.5px; line-height: 1.45; margin: 0; }
h1 { font-size: 24px; margin: 0 0 6px; }
h2 { font-size: 15px; margin: 22px 0 6px; padding-bottom: 3px; border-bottom: 1.5px solid #4A5FD6; page-break-after: avoid; break-after: avoid; }
h3 { font-size: 12px; margin: 12px 0 4px; }
p { margin: 4px 0; }
.muted { color: #6B7280; }
.small { font-size: 9px; }
.cover { padding: 36px 0 18px; border-bottom: 1px solid #E3E6EE; margin-bottom: 8px; }
.brand { color: #4A5FD6; font-weight: 700; letter-spacing: 0.5px; font-size: 11px; text-transform: uppercase; }
.disclaimer { margin-top: 14px; padding: 8px 10px; background: #F2F3F7; border-radius: 6px; font-size: 10px; }
.tiles { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
.tile { flex: 1 1 120px; border: 1px solid #E3E6EE; border-radius: 8px; padding: 8px 10px; }
.tile .v { font-size: 18px; font-weight: 700; }
.tile .l { color: #6B7280; font-size: 9px; }
table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 9.5px; }
th { text-align: left; background: #F2F3F7; font-weight: 600; padding: 5px 6px; border-bottom: 1px solid #D5D9E3; }
td { padding: 4px 6px; border-bottom: 1px solid #ECEEF3; vertical-align: top; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; break-inside: avoid; }
.nowrap { white-space: nowrap; }
.break { page-break-before: always; break-before: page; }
.keep { page-break-inside: avoid; break-inside: avoid; }
.chart { margin: 6px 0; }
.chart svg { max-width: 100%; height: auto; }
ul { margin: 4px 0; padding-left: 18px; }
li { margin: 2px 0; }
.badge { display: inline-block; padding: 1px 6px; border-radius: 8px; background: #E8EBFA; color: #2F3E9E; font-weight: 600; font-size: 9px; }
`;

/** Text as a CSS string literal (for `content:`), safe inside a <style> element. */
const cssString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/</g, '\\3C ').replace(/\n/g, ' ')}"`;

export interface PageDoc { lang: Lang; title: string; footer: string; size: PageSize; body: string }

const pageCss = (o: PageDoc) => CSS.replace('SIZE', o.size === 'letter' ? 'letter' : 'A4').replace('FOOTER', cssString(o.footer));

/** A full HTML document: `title` goes in <title>, `footer` at the bottom of every page; `body` is already-escaped HTML. */
export function page(o: PageDoc): string {
  return `<!doctype html><html lang="${o.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">`
    + `<title>${esc(o.title)}</title><style>${pageCss(o)}</style></head><body>${o.body}</body></html>`;
}

/**
 * The same page for embedding inside another web page (the portal): its styles only apply inside `scope` (e.g.
 * ".emolens-report"), so they can't restyle the page around it. `body` and `html` rules apply to the scope itself.
 */
export function embeddedPage(o: PageDoc, scope: string): { css: string; body: string } {
  // the @page rule (page size, footer, page numbers) has nested blocks: keep it whole, scope everything after it
  const all = pageCss(o);
  const start = all.indexOf('@page');
  let end = start;
  for (let depth = 0; end < all.length; end++) {
    if (all[end] === '{') depth++;
    else if (all[end] === '}' && --depth === 0) { end++; break; }
  }
  const atPage = start >= 0 ? all.slice(start, end) : '';
  const rest = start >= 0 ? all.slice(0, start) + all.slice(end) : all;
  const css = atPage + rest.replace(/(^|\})\s*([^@{}][^{}]*)\{/g, (_m, close: string, selectors: string) => {
    const scoped = selectors.split(',').map((sel) => {
      const x = sel.trim();
      if (x === 'body' || x === 'html') return scope;
      return `${scope} ${x}`;
    }).join(', ');
    return `${close}\n${scoped} {`;
  });
  return { css, body: o.body };
}

/**
 * A section with its <h2> heading. `breakBefore` starts it on a new page (SPEC 22.2: page breaks before tables); a
 * table section may then run over several pages, with its column headers repeated. Every other section is kept in
 * one piece (`keep`), so a heading is never left alone at the bottom of a page with its chart on the next one.
 */
export const section = (title: string, body: string, breakBefore = false): string =>
  `<section class="${breakBefore ? 'break' : 'keep'}"><h2>${esc(title)}</h2>${body}</section>`;

/**
 * A table from already-escaped cells. `classes` gives optional CSS classes per column (by index), e.g. 'nowrap' so a
 * date like "Sep 28" or a time like "3:05 PM" never breaks over two lines.
 */
export function table(head: string[], rows: string[][], classes: (string | null)[] = []): string {
  const cls = (i: number) => (classes[i] ? ` class="${classes[i]}"` : '');
  return `<table><thead><tr>${head.map((h, i) => `<th${cls(i)}>${esc(h)}</th>`).join('')}</tr></thead>`
    + `<tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${cls(i)}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/** One summary tile: a big value and its label (both plain text). */
export const tile = (value: string, label: string): string =>
  `<div class="tile"><div class="v">${esc(value)}</div><div class="l">${esc(label)}</div></div>`;

export const para = (text: string, cls?: string): string => `<p${cls ? ` class="${cls}"` : ''}>${esc(text)}</p>`;
