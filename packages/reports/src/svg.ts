/**
 * Charts for the PDF report and the digest PDF (SPEC 22.2: "All charts are generated as inline SVG strings by pure TS
 * functions"). Each function takes plain numbers and labels and returns one <svg> element as text, with a <title> for
 * screen readers. Every label is escaped. Colors are fixed print colors (a PDF is always light), and every value is also
 * written as text, so nothing depends on color alone.
 */

/** Escapes text for HTML and SVG (element content and attribute values). */
export function esc(s: string | number): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const INK = '#1F2433';
const MUTED = '#6B7280';
const GRID = '#E3E6EE';
const BAR = '#4A5FD6';
const EMPTY = '#F2F3F7';
const round = (x: number) => Math.round(x * 10) / 10;
/** Approximate width of one character of 9 px label text, for spacing labels so they don't overlap. */
export const LABEL_CHAR_PX = 5.5;

function svg(width: number, height: number, title: string, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(title)}">`
    + `<title>${esc(title)}</title>${body}</svg>`;
}

/** Heat color for a count: light gray for 0, then five steps from pale to the brand blue. */
function heat(count: number, max: number): string {
  if (count <= 0) return EMPTY;
  const steps = ['#DCE1FA', '#B9C3F4', '#8F9FEB', '#6A7EE0', BAR];
  const i = Math.min(steps.length - 1, Math.floor(((count - 1) / Math.max(1, max - 1)) * (steps.length - 1)));
  return max <= 1 ? steps[2] : steps[i];
}

export interface HeatmapOptions {
  title: string;
  /** Mon..Sun, the row labels. */
  weekdayLabels: string[];
  /** Short label for the week that starts on this date (e.g. "Sep 14"). */
  weekLabel: (date: string) => string;
}

/**
 * Calendar heatmap (report chart 3): one column per week (Monday first), one row per weekday, each day's hard-moment
 * count written in its square. Days outside the range are left empty.
 */
export function calendarHeatmap(days: { date: string; count: number }[], o: HeatmapOptions): string {
  if (!days.length) return svg(10, 10, o.title, '');
  const cell = 22, gap = 3, left = 34, top = 18;
  const wd = (d: string) => { const x = new Date(`${d}T12:00:00Z`).getUTCDay(); return x === 0 ? 6 : x - 1; }; // Mon = 0
  const firstMonday = new Date(Date.parse(`${days[0].date}T12:00:00Z`) - wd(days[0].date) * 86_400_000);
  const weekOf = (d: string) => Math.floor((Date.parse(`${d}T12:00:00Z`) - firstMonday.getTime()) / (7 * 86_400_000));
  const weeks = weekOf(days[days.length - 1].date) + 1;
  const max = Math.max(0, ...days.map((d) => d.count));
  const width = left + weeks * (cell + gap) + 4, height = top + 7 * (cell + gap) + 4;
  let body = '';
  o.weekdayLabels.forEach((l, r) => {
    body += `<text x="${left - 6}" y="${top + r * (cell + gap) + cell * 0.68}" font-size="9" fill="${MUTED}" text-anchor="end">${esc(l)}</text>`;
  });
  // Week labels ("Sep 14") are wider than one column, so label every k-th week, with k chosen from the widest label
  // (about 5.5 px per character at 9 px) plus a gap, so labels never touch (at most 8 labels).
  const weekLabels = Array.from({ length: weeks }, (_, w) => o.weekLabel(new Date(firstMonday.getTime() + w * 7 * 86_400_000).toISOString().slice(0, 10)));
  const labelW = Math.max(0, ...weekLabels.map((l) => l.length)) * LABEL_CHAR_PX + 8;
  const labelEvery = Math.max(1, Math.ceil(weeks / 8), Math.ceil(labelW / (cell + gap)));
  for (let w = 0; w < weeks; w += labelEvery) {
    body += `<text x="${left + w * (cell + gap)}" y="11" font-size="9" fill="${MUTED}">${esc(weekLabels[w])}</text>`;
  }
  for (const d of days) {
    const x = left + weekOf(d.date) * (cell + gap), y = top + wd(d.date) * (cell + gap);
    body += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="4" fill="${heat(d.count, max)}"><title>${esc(`${d.date}: ${d.count}`)}</title></rect>`;
    if (d.count > 0) {
      const fill = heat(d.count, max) === BAR || heat(d.count, max) === '#6A7EE0' ? '#FFFFFF' : INK;
      body += `<text x="${x + cell / 2}" y="${y + cell * 0.68}" font-size="10" font-weight="600" text-anchor="middle" fill="${fill}">${d.count}</text>`;
    }
  }
  return svg(width, height, o.title, body);
}

export interface RateBarDatum { label: string; rate: number; lo: number; hi: number; caption?: string; }

/**
 * Bars with interval whiskers (report chart 4, time of day): the bar is the observed share, the whisker the 80% range.
 * `format` writes each bar's value above it (e.g. "25%").
 */
export function rateBarChart(bars: RateBarDatum[], o: { title: string; format: (v: number) => string }): string {
  const bw = 34, gap = 12, left = 8, top = 16, plotH = 120, bottom = 34;
  const width = left * 2 + bars.length * (bw + gap), height = top + plotH + bottom;
  const max = Math.max(0.05, ...bars.map((b) => b.hi));
  const y = (v: number) => top + plotH - (v / max) * plotH;
  let body = `<line x1="${left}" x2="${width - left}" y1="${top + plotH}" y2="${top + plotH}" stroke="${GRID}" stroke-width="1"/>`;
  bars.forEach((b, i) => {
    const x = left + i * (bw + gap) + gap / 2;
    const h = top + plotH - y(b.rate);
    body += `<rect x="${x}" y="${round(y(b.rate))}" width="${bw}" height="${round(Math.max(h, 0))}" rx="3" fill="${BAR}" fill-opacity="0.85"/>`;
    const cx = x + bw / 2;
    body += `<line x1="${cx}" x2="${cx}" y1="${round(y(b.hi))}" y2="${round(y(b.lo))}" stroke="${INK}" stroke-width="1.5"/>`
      + `<line x1="${cx - 5}" x2="${cx + 5}" y1="${round(y(b.hi))}" y2="${round(y(b.hi))}" stroke="${INK}" stroke-width="1.5"/>`
      + `<line x1="${cx - 5}" x2="${cx + 5}" y1="${round(y(b.lo))}" y2="${round(y(b.lo))}" stroke="${INK}" stroke-width="1.5"/>`;
    body += `<text x="${cx}" y="${round(y(b.hi) - 4)}" font-size="9" text-anchor="middle" fill="${INK}">${esc(o.format(b.rate))}</text>`;
    body += `<text x="${cx}" y="${top + plotH + 13}" font-size="9" text-anchor="middle" fill="${MUTED}">${esc(b.label)}</text>`;
    if (b.caption) body += `<text x="${cx}" y="${top + plotH + 25}" font-size="8" text-anchor="middle" fill="${MUTED}">${esc(b.caption)}</text>`;
  });
  return svg(width, height, o.title, body);
}

/** Simple count bars, one per day (digest chart: hard moments per day). The count is written above each bar. */
export function countBarChart(bars: { label: string; count: number }[], o: { title: string }): string {
  const bw = 30, gap = 10, left = 8, top = 16, plotH = 90, bottom = 20;
  const width = left * 2 + bars.length * (bw + gap), height = top + plotH + bottom;
  const max = Math.max(1, ...bars.map((b) => b.count));
  let body = `<line x1="${left}" x2="${width - left}" y1="${top + plotH}" y2="${top + plotH}" stroke="${GRID}" stroke-width="1"/>`;
  bars.forEach((b, i) => {
    const x = left + i * (bw + gap) + gap / 2;
    const h = (b.count / max) * plotH;
    if (b.count > 0) body += `<rect x="${x}" y="${round(top + plotH - h)}" width="${bw}" height="${round(h)}" rx="3" fill="${BAR}"/>`;
    body += `<text x="${x + bw / 2}" y="${round(top + plotH - h - 4)}" font-size="10" font-weight="600" text-anchor="middle" fill="${INK}">${b.count}</text>`;
    body += `<text x="${x + bw / 2}" y="${top + plotH + 13}" font-size="9" text-anchor="middle" fill="${MUTED}">${esc(b.label)}</text>`;
  });
  return svg(width, height, o.title, body);
}
