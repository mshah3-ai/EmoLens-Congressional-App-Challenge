/**
 * The weekly digest as a PDF ("Share as PDF", SPEC 21), using the report's page shell and SVG charts: the summary in
 * words, hard moments per day, per part of the day, pattern changes, what helped, heads-ups, medications and sleep.
 * Built from the saved digest numbers only (`DigestStats`), like the digest screen.
 */
import type { Lang } from '@emolens/shared';
import { TOD_GROUPS, featureLabel, type DigestStats } from '@emolens/engine';
import { templateNarrative } from '../../digest/narrative';
import { dateYearIn, num1, pct, weekdayShortIn } from '@emolens/reports';
import { watchItemName } from '@emolens/reports';
import { countBarChart, esc } from '@emolens/reports';
import { page, para, section, type PageSize, type TFn } from '@emolens/reports';

export function digestLines(s: DigestStats, t: TFn, lang: Lang): { patterns: string[]; watch: string[]; strategies: string[]; forecasts: string[]; meds: string[]; sleep: string[] } {
  const patterns = s.insights.changes.map((c) => t('digest.changeLine', {
    factor: featureLabel(c.key, lang), to: t(`status.${c.to}`), from: c.from ? t(`status.${c.from}`) : t('digest.new'),
  }));
  const watch = s.insights.newWatch.map((w) => `${watchItemName(w, t)} (${t(`watch.kind.${w.kind}`)})`);
  const strategies: string[] = [];
  if (s.strategies.mostUsed) strategies.push(t('digest.mostUsed', { name: s.strategies.mostUsed.name, count: s.strategies.mostUsed.uses }));
  if (s.strategies.best) strategies.push(t('digest.best', { name: s.strategies.best.name, s: s.strategies.best.successes, count: s.strategies.best.total }));
  const f = s.forecasts;
  const forecasts: string[] = [];
  if (f.delivered) forecasts.push(t('digest.alerts', { count: f.delivered, happened: f.happened, stepped: f.steppedIn, calm: f.calm, none: f.noAnswer }));
  if (f.hitRate != null) forecasts.push(t('health.alertsHit', { pct: pct(f.hitRate) }));
  if (f.skill28 != null) forecasts.push(f.skill28 > 0 ? t('digest.skill', { pct: pct(f.skill28) }) : t('health.notYet'));
  const meds = s.medications.perMed.map((m) => t('digest.medLine', { name: m.name, pct: m.rate != null ? pct(m.rate) : '–', given: m.taken + m.late, scheduled: m.scheduled }))
    .concat(s.medications.changes.map((c) => `${c.name}: ${t(`report.change.${c.changeType}`)}`));
  const sleep = s.sleep.nights && s.sleep.avgHours != null
    ? [t('digest.sleepLine', { avg: num1(lang, s.sleep.avgHours), ref: num1(lang, s.sleep.refHours), count: s.sleep.nights })] : [];
  return { patterns, watch, strategies, forecasts, meds, sleep };
}

const list = (items: string[]) => `<ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;

export function renderDigestHtml(s: DigestStats, t: TFn, o: { nickname: string; lang: Lang; size: PageSize }): string {
  const L = o.lang;
  const title = t('digest.pdfTitle', { name: o.nickname });
  const range = `${dateYearIn(L, s.weekStart)} – ${dateYearIn(L, s.weekEnd)}`;
  const lines = digestLines(s, t, L);
  const parts = [
    `<div class="cover"><div class="brand">EmoLens</div><h1>${esc(title)}</h1>${para(range)}</div>`,
    section(t('digest.summary'), templateNarrative(s, t, o.nickname, L).map((x) => para(x)).join('')
      + (s.avg4Weeks != null ? para(t('digest.vsAvg', { avg: num1(L, s.avg4Weeks) }), 'muted') : '')),
    section(t('digest.daily'), `<div class="chart keep">${countBarChart(s.episodes.perDay.map((d) => ({ label: weekdayShortIn(L, d.date), count: d.count })),
      { title: t('digest.daily') })}</div>`),
    section(t('digest.todTitle'), `<div class="chart keep">${countBarChart(TOD_GROUPS.map((g) => ({ label: t(`digest.todShort.${g}`), count: s.episodes.byTod[g] })),
      { title: t('digest.todTitle') })}</div>`),
    section(t('digest.patterns'), lines.patterns.length ? list(lines.patterns) : para(t('digest.patternsNone'), 'muted')),
  ];
  if (lines.watch.length) parts.push(section(t('digest.newWatch'), list(lines.watch) + para(t('watch.note'), 'muted small')));
  parts.push(section(t('digest.strategies'), lines.strategies.length ? list(lines.strategies) : para(t('digest.strategiesNone'), 'muted')));
  parts.push(section(t('digest.logging'), para(t('digest.loggingDays', { count: s.logging.daysClosed }) + ' · ' + t('digest.streak', { count: s.logging.streak }))));
  if (lines.forecasts.length) parts.push(section(t('digest.forecasts'), list(lines.forecasts)));
  if (lines.meds.length) parts.push(section(t('digest.meds'), list(lines.meds)));
  if (lines.sleep.length) parts.push(section(t('digest.sleep'), list(lines.sleep)));
  parts.push(`<div class="disclaimer">${esc(t('report.disclaimer'))}</div>`);
  return page({ lang: L, size: o.size, title, footer: `${title} · ${range}`, body: parts.join('') });
}
