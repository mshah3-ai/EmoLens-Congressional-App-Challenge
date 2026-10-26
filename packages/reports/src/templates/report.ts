/**
 * The PDF report as HTML (SPEC 22.2), from `ReportData` (data.ts) and a translation function. Sections, in order:
 *   1 cover · 2 summary · 3 calendar heatmap · 4 time of day · 5 hard moments table · 6 patterns · 7 worth watching ·
 *   8 medications (not for School) · 9 sleep (not for School) · 10 strategies · 11 forecast quality · 12 selected notes ·
 *   13 "How to read this report".
 * The Family audience gets the same sections with plainer wording (effects as sentences instead of odds ratios).
 * Every piece of text is escaped. Pure: no React Native, so tests render it in Node.
 */
import { BLOCK_HOURS, FEATURE_BY_KEY } from '@emolens/shared';
import { effectSentence, featureLabel, localDateOf, localMinuteOf, rangeSentence } from '@emolens/engine';
import type { ReportData } from '../types';
import { blockRangeIn, dateYearAt, dateYearIn, num1, pct, shortDateIn, timeIn, weekdayShortIn } from '../format';
import { precisionPct, watchItemName } from '../labels';
import { calendarHeatmap, esc, rateBarChart } from '../svg';
import { embeddedPage, page, para, section, table, tile, type PageDoc, type TFn } from './shell';

/** Section ids, in order; the report builder lists them per audience. */
export const REPORT_SECTIONS = ['summary', 'calendar', 'timeOfDay', 'episodes', 'patterns', 'watch', 'medications', 'sleep',
  'strategies', 'forecast', 'notes', 'glossary'] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];

/** The sections a report for this audience contains (the cover is always there). */
export function sectionsFor(audience: ReportData['audience']): ReportSection[] {
  return REPORT_SECTIONS.filter((s) => audience !== 'school' || (s !== 'medications' && s !== 'sleep'));
}

const minutes = (t: TFn, m: number) => (m >= 60 ? t('common.hoursMinutes', { h: Math.floor(m / 60), m: m % 60 }) : t('common.minutes', { count: m }));

function changeText(t: TFn, cur: number, prev: number): string {
  if (prev === 0 && cur === 0) return t('report.changeNone');
  if (prev === 0) return t('report.changeFromZero');
  const d = (cur - prev) / prev;
  if (Math.abs(d) < 0.05) return t('report.changeSame');
  return t(d < 0 ? 'report.changeDown' : 'report.changeUp', { pct: pct(Math.abs(d)) });
}

export function renderReportHtml(d: ReportData, t: TFn): string {
  return page(reportDocument(d, t));
}

/** The report inside another page (the portal): styles scoped to `scope`. */
export function renderReportEmbedded(d: ReportData, t: TFn, scope = '.emolens-report'): { css: string; body: string } {
  return embeddedPage(reportDocument(d, t), scope);
}

/** The report's parts: title, footer, page size and the escaped HTML body. */
export function reportDocument(d: ReportData, t: TFn): PageDoc {
  const L = d.lang;
  const family = d.audience === 'family';
  const name = d.nickname;
  const range = `${dateYearIn(L, d.from)} – ${dateYearIn(L, d.to)}`;
  const s = d.summary;
  const parts: string[] = [];
  const sections = new Set(sectionsFor(d.audience));

  // 1. cover
  parts.push(`<div class="cover"><div class="brand">EmoLens</div><h1>${esc(t('report.coverTitle', { name }))}</h1>`
    + para(range)
    + para(t('report.generated', { date: dateYearAt(L, d.generatedAt, d.tz), audience: t(`report.audience.${d.audience}`) }), 'muted')
    + (d.schoolOnly ? para(t('report.schoolOnlyNote'), 'muted') : '')
    + `<div class="disclaimer">${esc(t('report.disclaimer'))}</div></div>`);

  // 2. summary
  const weeks = Math.max(1, d.days / 7);
  // "Most likely" names the tallest bar of the time-of-day chart, so the summary and the chart can't disagree (BUGS #24).
  const todTop = d.timeOfDay.filter((r) => r.k > 0).sort((a, b) => b.rate - a.rate || b.k - a.k || a.index - b.index)[0];
  const chartBlocks = new Set(d.timeOfDay.map((r) => r.index));
  const outsideChart = d.episodes.filter((e) => !chartBlocks.has(Math.floor(localMinuteOf(e.startedAt, d.tz) / 60 / BLOCK_HOURS))).length;
  parts.push(section(t('report.summary'),
    `<div class="tiles">${tile(String(s.total), t('report.tileTotal', { count: s.total }))}`
    + tile(num1(L, s.total / weeks), t('report.tilePerWeek'))
    + tile(s.avgIntensity != null ? `${num1(L, s.avgIntensity)} / 5` : '–', t('report.tileIntensity'))
    + tile(s.total ? minutes(t, Math.round(s.totalDurationMin / Math.max(1, s.total))) : '–', t('report.tileDuration'))
    + tile(String(s.perDay.filter((x) => x.count === 0).length), t('report.tileCalmDays', { days: s.perDay.length }))
    + '</div>'
    + para(t('report.trend', { change: changeText(t, s.total, d.previous.total), prev: d.previous.total }))
    + para(t('report.byType', { meltdown: s.byType.meltdown, shutdown: s.byType.shutdown, other: s.byType.other }))
    + (s.busiestDay ? para(t('report.busiest', { date: shortDateIn(L, s.busiestDay.date), n: s.busiestDay.count })) : '')
    + (s.total && todTop ? para(t('report.mostLikely', { when: blockRangeIn(L, todTop.index) })) : '')));

  // 3. calendar heatmap
  parts.push(section(t('report.calendar'), `<div class="chart keep">${calendarHeatmap(s.perDay, {
    title: t('report.calendarTitle', { name }),
    // row labels Mon..Sun: the weekday names of any Monday-to-Sunday week
    weekdayLabels: ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'].map((x) => weekdayShortIn(L, x)),
    weekLabel: (date) => shortDateIn(L, date),
  })}</div>${para(t('report.calendarNote'), 'muted small')}`));

  // 4. time of day
  const todHas = d.timeOfDay.some((r) => r.n > 0);
  parts.push(section(t('report.timeOfDay'), todHas
    ? `<div class="chart keep">${rateBarChart(d.timeOfDay.map((r) => ({ label: blockRangeIn(L, r.index), rate: r.rate, lo: r.lo80, hi: r.hi80, caption: `${r.k}/${r.n}` })),
      { title: t('report.timeOfDayTitle'), format: pct })}</div>${para(t('report.timeOfDayNote'), 'muted small')}`
      + (outsideChart ? para(t(d.schoolOnly ? 'report.outsideSchoolBlocks' : 'report.outsideWaking', { count: outsideChart }), 'small') : '')
    : para(t('report.timeOfDayEmpty'), 'muted')));

  // 5. hard moments table (a School report has no "Where" column: places outside school stay private)
  const tags = (list: string[], kind: 'antecedent' | 'behavior') => list.map((x) => t(`tags.${kind}.${x}`)).join(', ');
  const showWhere = d.audience !== 'school';
  parts.push(section(t('report.episodes'), d.episodes.length
    ? table([t('report.col.date'), t('report.col.time'), t('report.col.type'), t('report.col.intensity'), t('report.col.duration'),
      ...(showWhere ? [t('report.col.setting')] : []), t('report.col.before'), t('report.col.helped')],
    d.episodes.map((e) => {
      const date = new Date(e.startedAt);
      const before = [tags(e.antecedentTags, 'antecedent'), e.antecedentNote ?? ''].filter(Boolean).join('. ');
      const setting = e.placeLabel ?? (e.placeType ? t(`places.types.${e.placeType}`) : '');
      return [
        esc(shortDateIn(L, localDateOf(date.getTime(), d.tz))), esc(timeIn(L, e.startedAt, d.tz)), esc(t(`episode.types.${e.type}`)),
        e.intensity != null ? String(e.intensity) : '–', e.durationMin != null ? esc(minutes(t, e.durationMin)) : '–',
        ...(showWhere ? [esc(setting)] : []),
        esc(before), esc(e.helped.map((h) => `${h.name} (${t(`episode.outcome.${h.outcome}`)})`).join('; ')),
      ];
    }), ['nowrap', 'nowrap', null, null, 'nowrap'])
    : para(t('report.episodesNone', { name }), 'muted'), d.episodes.length > 0));

  // 6. patterns
  const patternRows = d.patterns.map((p) => {
    const label = featureLabel(p.key, L);
    const status = t(`status.${p.status}`);
    const effect = `${effectSentence(p.key, p.unit, p.or, L)} ${rangeSentence(p.orLo, p.orHi, L)}`;
    const evidence = t('report.evidence', { n: p.exposed, k: p.exposedPos, nu: p.unexposed, ku: p.unexposedPos });
    return family
      ? [esc(label), `<span class="badge">${esc(status)}</span>`, esc(effect)]
      : [esc(label), `<span class="badge">${esc(status)}</span>`, esc(effect), esc(precisionPct(p.confidence)), esc(evidence)];
  });
  const medPattern = d.patterns.some((p) => FEATURE_BY_KEY[p.key]?.group === 'medication' && p.status !== 'no_clear_link');
  parts.push(section(t('report.patterns'), d.patterns.length
    ? para(t(family ? 'report.patternsIntroFamily' : 'report.patternsIntro'), 'muted')
      + table(family ? [t('report.col.factor'), t('report.col.status'), t('report.col.effect')]
        : [t('report.col.factor'), t('report.col.status'), t('report.col.effect'), t('report.col.confidence'), t('report.col.evidence')], patternRows)
      + (medPattern ? para(t('trigger.prescriber')) : '')
    : para(t('report.patternsNone'), 'muted'), d.patterns.length > 0));

  // 7. worth watching
  parts.push(section(t('insights.worth'), d.watch.length
    ? `<ul>${d.watch.map((w) => {
      const item = watchItemName(w, t);
      return `<li>${esc(t(`watch.${w.kind}`, { item, n: w.median.toFixed(1), count: w.nExposed }))}</li>`;
    }).join('')}</ul>${para(t('watch.note'), 'muted small')}`
    : para(t('insights.worthEmpty'), 'muted')));

  // 8. medications
  if (sections.has('medications') && d.medications) {
    const m = d.medications;
    parts.push(section(t('report.medications'), m.list.length
      ? table([t('report.col.medication'), t('report.col.schedule'), t('report.col.adherence'), t('report.col.missed')],
        m.list.map((x) => [
          esc([x.name, x.strength, x.form].filter(Boolean).join(' ')),
          esc(x.asNeeded ? t('report.asNeeded') : x.times.join(', ')),
          x.adherence.rate != null ? esc(`${pct(x.adherence.rate)} (${x.adherence.taken + x.adherence.late}/${x.adherence.scheduled})`) : '–',
          String(x.adherence.missed),
        ]))
        + (m.changes.length ? `<h3>${esc(t('report.medChanges'))}</h3><ul>${m.changes.map((c) =>
          `<li>${esc(`${shortDateIn(L, localDateOf(c.at, d.tz))}: ${c.name}, ${t(`report.change.${c.changeType}`)}${c.oldValue || c.newValue ? ` (${[c.oldValue, c.newValue].filter(Boolean).join(' → ')})` : ''}`)}</li>`).join('')}</ul>` : '')
        + para(t('report.medNote'), 'muted small')
      : para(t('report.medicationsNone'), 'muted'), m.list.length > 0));
  }

  // 9. sleep
  if (sections.has('sleep') && d.sleep) {
    const sl = d.sleep;
    parts.push(section(t('report.sleep'), sl.nights
      ? `<div class="tiles">${tile(t('report.hoursValue', { value: num1(L, sl.avgHours ?? 0) }), t('report.sleepAvg'))}`
        + tile(t('report.hoursValue', { value: num1(L, sl.refHours) }), t('report.sleepUsual'))
        + tile(`${num1(L, sl.minHours ?? 0)}–${num1(L, sl.maxHours ?? 0)} h`, t('report.sleepRange'))
        + tile(String(sl.nights), t('report.sleepNights', { count: sl.nights })) + '</div>'
      : para(t('report.sleepNone'), 'muted')));
  }

  // 10. strategies
  parts.push(section(t('report.strategies'), d.strategies.length
    ? table([t('report.col.strategy'), t('report.col.when'), t('report.col.result')], d.strategies.map((x) => [
      esc(x.name), esc(t(x.context === 'proactive' ? 'strategies.before' : 'strategies.during')),
      esc(t('report.helpedOf', { s: x.successes, count: x.successes + x.failures }) + (x.unsure ? ` · ${t('report.unsure', { count: x.unsure })}` : '')),
    ]))
    : para(t('report.strategiesNone'), 'muted'), d.strategies.length > 0));

  // 11. forecast quality
  const h = d.forecast.health, a = d.forecast.alerts;
  parts.push(section(t('report.forecast'),
    (h.enough
      ? para(h.skill > 0 ? t('health.better', { pct: pct(h.skill) }) : t('health.notYet'))
        + (family ? '' : para(t('report.forecastDetail', { n: h.n, brier: h.brier.toFixed(3), base: h.brierBaseline.toFixed(3),
          auroc: h.auroc != null ? h.auroc.toFixed(2) : '–' }), 'muted small'))
      : para(t('report.forecastWaiting', { n: h.n }), 'muted'))
    + (a.delivered
      ? para(t('report.alerts', { count: a.delivered, happened: a.happened, stepped: a.steppedIn, calm: a.calm, none: a.noAnswer })
        + (a.hitRate != null ? ` ${t('health.alertsHit', { pct: pct(a.hitRate) })}` : ''))
      : para(t('health.alertsNone'), 'muted'))));

  // 12. notes
  if (d.notes.length) {
    parts.push(section(t('report.notes'), `<ul>${d.notes.map((n) =>
      `<li><strong>${esc(`${shortDateIn(L, localDateOf(n.at, d.tz))}, ${timeIn(L, n.at, d.tz)}`)}</strong>: ${esc(n.text)}</li>`).join('')}</ul>`));
  }

  // 13. glossary
  parts.push(section(t('report.glossary'), `<ul>${['confidence', 'range', 'odds', 'status', 'blocks'].map((k) =>
    `<li>${esc(t(`report.gloss.${k}`, { name }))}</li>`).join('')}</ul>${para(t('report.disclaimer'), 'muted small')}`, true));

  return { lang: L, size: d.pageSize, title: t('report.coverTitle', { name }), footer: `${t('report.coverTitle', { name })} · ${range}`, body: parts.join('') };
}
