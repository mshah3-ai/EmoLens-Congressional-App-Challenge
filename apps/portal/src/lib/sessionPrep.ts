/**
 * Session-prep drafts (SPEC 24.2): the summary JSON the portal sends to the ai-session-prep function. It is built
 * from the same report data as the portal's Report page (assembleReport), plus the caregivers' own notes for the
 * range, then the nickname is replaced by [CHILD] everywhere (redactDeep). Times are written in the family's time zone.
 * Pure functions: unit-tested in test/portal.test.ts.
 */
import { addDays, formatHHMM, localDateOf, localMinuteOf } from '@emolens/engine';
import { redactDeep } from '@emolens/shared';
import type { ReportData } from '@emolens/reports';

/** SPEC 24.2: from the day of the last clinician note (or 60 days back when there is none), never more than 60 days. */
export const PREP_MAX_DAYS = 60;
export function prepRange(lastNoteAt: number | null, now: number, tz: string): { from: string; to: string } {
  const to = localDateOf(now, tz);
  const earliest = addDays(to, -(PREP_MAX_DAYS - 1));
  const since = lastNoteAt == null ? earliest : localDateOf(lastNoteAt, tz);
  return { from: since < earliest ? earliest : since > to ? to : since, to };
}

/** A from..to request from the form, checked: real dates, in order, at most 60 days. */
export function checkedRange(from: unknown, to: unknown): { from: string; to: string } | null {
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof from !== 'string' || typeof to !== 'string' || !date.test(from) || !date.test(to) || from > to) return null;
  if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) return null;
  return addDays(from, PREP_MAX_DAYS - 1) < to ? null : { from, to };
}

const stamp = (t: number, tz: string) => `${localDateOf(t, tz)} ${formatHHMM(localMinuteOf(t, tz))}`;

export function sessionPrepSummary(d: ReportData, caregiverNotes: { at: number; text: string }[]): Record<string, unknown> {
  const tz = d.tz;
  const summary = {
    range: { from: d.from, to: d.to, days: d.days, time_zone: tz },
    hard_moments: {
      this_period: { total: d.summary.total, by_type: d.summary.byType, avg_intensity_1_to_5: d.summary.avgIntensity,
        total_minutes_logged: d.summary.totalDurationMin, by_time_of_day: d.summary.byTod, busiest_day: d.summary.busiestDay },
      previous_period_same_length: { total: d.previous.total, by_type: d.previous.byType, avg_intensity_1_to_5: d.previous.avgIntensity },
      list: d.episodes.map((e) => ({
        at: stamp(e.startedAt, tz), type: e.type, intensity: e.intensity, duration_min: e.durationMin, place_type: e.placeType,
        before: e.antecedentTags, before_note: e.antecedentNote, looked_like: e.behaviorTags,
        what_was_tried: e.helped.map((h) => `${h.name} (${h.outcome})`),
      })),
    },
    patterns_from_family_phone: d.patterns.filter((p) => p.status !== 'hidden').map((p) => ({
      factor: p.key, status: p.status, confidence_0_100: Math.round(p.confidence), odds_ratio: p.or, odds_ratio_80pct: [p.orLo, p.orHi], summary: p.sentence,
    })),
    worth_watching: d.watch.map((w) => ({ kind: w.kind, item: w.label, times_present: w.nExposed, with_hard_moment: w.kExposed })),
    medications: d.medications ? {
      list: d.medications.list.map((m) => ({ name: m.name, strength: m.strength, as_needed: m.asNeeded, times: m.times, adherence: m.adherence })),
      changes: d.medications.changes.map((c) => ({ name: c.name, at: stamp(c.at, tz), change: c.changeType, from: c.oldValue, to: c.newValue })),
    } : null,
    sleep: d.sleep ?? null,
    strategies: d.strategies,
    forecast_quality_last_28_days: { skill: d.forecast.health.skill, checked_forecasts: d.forecast.health.n, alerts: d.forecast.alerts },
    caregiver_notes: caregiverNotes.map((n) => ({ at: stamp(n.at, tz), text: n.text.slice(0, 2000) })),
  };
  return redactDeep(summary, d.nickname);
}
