/**
 * Everything one PDF report shows (SPEC 22.1, 22.2), read from SQLite and the last engine run, for a date range and an
 * audience. This file only reads rows; `assembleReport` (@emolens/reports, shared with the portal) applies the
 * audience rules and the engine's summaries, so the School report leaves out medications, sleep, health and places
 * outside school the same way everywhere (test/schoolPrivacy.test.ts checks the finished report).
 */
import type { ChildProfile, EpisodeType, PlaceType } from '@emolens/shared';
import { alertMetrics, awakeIndices, evaluablePredictions, isoWeekday, localDateOf, modelHealth, previousPeriod, rangeBounds, timeOfDayRows } from '@emolens/engine';
import type { LabelStatus } from '@emolens/shared';
import { assembleReport, type ReportData, type ReportOptions } from '@emolens/reports';
import { all, type Executor } from '../db/types';
import { iso, ms } from '../db/time';
import { parseJson, type MedSchedule } from '../db/rows';
import { readSnapshot } from '../forecast/snapshot';

export { AUDIENCES, type Audience, type ReportData, type ReportEpisode, type ReportMedication, type ReportOptions } from '@emolens/reports';

/** Caregiver notes in the range, newest first, for the "notes to include" picker. */
export async function notesInRange(ex: Executor, profile: ChildProfile, from: string, to: string): Promise<{ id: string; at: number; text: string }[]> {
  const [a, b] = rangeBounds(from, to, profile.homeTz);
  const rows = await all<{ id: string; noted_at: string; text: string }>(ex,
    'SELECT id, noted_at, text FROM notes WHERE child_id = ? AND deleted_at IS NULL AND noted_at >= ? AND noted_at < ? ORDER BY noted_at DESC',
    [profile.id, iso(a), iso(b)]);
  return rows.map((r) => ({ id: r.id, at: ms(r.noted_at), text: r.text }));
}

export async function loadReportData(ex: Executor, profile: ChildProfile, o: ReportOptions): Promise<ReportData> {
  const id = profile.id;
  const tz = profile.homeTz;
  const prev = previousPeriod(o.from, o.to);
  const [from, to] = rangeBounds(o.from, o.to, tz);
  const [prevFrom] = rangeBounds(prev.from, prev.to, tz);
  const q = <T>(sql: string, params: (string | number)[]) => all<T>(ex, sql, params);

  const [episodes, places, uses, blocks, snap, preds, alerts, responses, notes] = await Promise.all([
    q<{ id: string; started_at: string; duration_min: number | null; type: EpisodeType; intensity: number | null; place_id: string | null;
      place_type: string | null; antecedent_tags: string; antecedent_note: string | null; behavior_tags: string }>(
      `SELECT id, started_at, duration_min, type, intensity, place_id, place_type, antecedent_tags, antecedent_note, behavior_tags
       FROM episodes WHERE child_id = ? AND deleted_at IS NULL AND started_at >= ? AND started_at < ? ORDER BY started_at`, [id, iso(prevFrom), iso(to)]),
    q<{ id: string; label: string; type: PlaceType }>('SELECT id, label, type FROM places WHERE child_id = ?', [id]),
    q<{ strategy_id: string; name: string; context: 'proactive' | 'during'; outcome: string; episode_id: string | null; used_at: string }>(
      `SELECT u.strategy_id, s.name, u.context, u.outcome, u.episode_id, u.used_at FROM strategy_uses u JOIN strategies s ON s.id = u.strategy_id
       WHERE u.child_id = ? AND u.deleted_at IS NULL AND u.used_at >= ? AND u.used_at < ? ORDER BY u.used_at`, [id, iso(from), iso(to)]),
    q<{ block_index: number; block_start: string; label_status: LabelStatus }>(
      'SELECT block_index, block_start, label_status FROM blocks WHERE child_id = ? AND block_start >= ? AND block_start < ?', [id, iso(from), iso(to)]),
    readSnapshot(ex, id),
    q<{ block_start: string; p: number; p_baseline: number; label_status: LabelStatus | null }>(
      `SELECT p.block_start, p.p, p.p_baseline, b.label_status FROM predictions p
       LEFT JOIN blocks b ON b.child_id = p.child_id AND b.block_start = p.block_start
       WHERE p.child_id = ? AND p.kind = 'day_ahead' AND p.block_start >= ? AND p.block_start < ?`, [id, iso(from), iso(Math.min(to, o.now))]),
    q<{ id: string; block_start: string; scheduled_for: string; status: 'scheduled' | 'delivered' | 'cancelled' | 'suppressed' }>(
      'SELECT id, block_start, scheduled_for, status FROM alerts WHERE child_id = ? AND deleted_at IS NULL AND block_start >= ? AND block_start < ?', [id, iso(from), iso(to)]),
    q<{ alert_id: string; response: 'happened' | 'stepped_in' | 'calm'; responded_at: string }>(
      `SELECT r.alert_id, r.response, r.responded_at FROM alert_responses r JOIN alerts a ON a.id = r.alert_id
       WHERE a.child_id = ? AND r.deleted_at IS NULL AND a.block_start >= ? AND a.block_start < ?`, [id, iso(from), iso(to)]),
    o.noteIds.length
      ? q<{ id: string; noted_at: string; text: string }>(
        `SELECT id, noted_at, text FROM notes WHERE child_id = ? AND deleted_at IS NULL AND id IN (${o.noteIds.map(() => '?').join(',')}) ORDER BY noted_at`,
        [id, ...o.noteIds])
      : Promise.resolve([]),
  ]);

  // forecast quality in the range (SPEC 18 rules)
  const labels = new Map<number, LabelStatus>();
  for (const p of preds) if (p.label_status) labels.set(ms(p.block_start), p.label_status);
  const health = modelHealth(evaluablePredictions(preds.map((p) => ({ blockStart: ms(p.block_start), p: p.p, pBaseline: p.p_baseline })), labels));
  const am = alertMetrics(
    alerts.map((a) => ({ id: a.id, blockStart: ms(a.block_start), scheduledFor: ms(a.scheduled_for), status: a.status })),
    responses.map((r) => ({ alertId: r.alert_id, response: r.response, respondedAt: ms(r.responded_at) })), o.now);

  const school = o.audience === 'school';
  // a school-only report's chart counts school days only (assembleReport keeps the school-hour blocks)
  const chartBlocks = school && o.schoolOnly !== false
    ? blocks.filter((b) => profile.schoolDays.includes(isoWeekday(localDateOf(ms(b.block_start), tz))))
    : blocks;
  return assembleReport({
    profile,
    episodes: episodes.map((e) => ({ id: e.id, startedAt: ms(e.started_at), durationMin: e.duration_min, type: e.type, intensity: e.intensity,
      placeId: e.place_id, placeType: e.place_type, antecedentTags: parseJson<string[]>(e.antecedent_tags, []), antecedentNote: e.antecedent_note,
      behaviorTags: parseJson<string[]>(e.behavior_tags, []) })),
    places,
    uses: uses.map((u) => ({ strategyId: u.strategy_id, name: u.name, context: u.context, outcome: u.outcome, episodeId: u.episode_id, usedAt: ms(u.used_at) })),
    timeOfDay: timeOfDayRows(chartBlocks.map((b) => ({ index: b.block_index, label: b.label_status })), awakeIndices(profile)),
    patterns: snap?.insights ?? [],
    watch: snap?.worthWatching ?? [],
    health, alerts: am,
    // the School report never reads medications or sleep at all
    medications: school ? { meds: [], doses: [], changes: [] } : await loadMedications(ex, id, [o.from, o.to], [from, to]),
    sleep: school ? [] : await loadSleep(ex, profile, o.from, o.to),
    notes: notes.map((n) => ({ id: n.id, at: ms(n.noted_at), text: n.text })),
  }, o);
}

async function loadMedications(ex: Executor, childId: string, [fromDate, toDate]: [string, string], [from, to]: [number, number]) {
  const meds = await all<{ id: string; name: string; strength: string | null; form: string | null; rxcui: string | null; as_needed: number;
    schedule: string; active_from: string; active_to: string | null }>(ex,
    `SELECT id, name, strength, form, rxcui, as_needed, schedule, active_from, active_to FROM medications
     WHERE child_id = ? AND deleted_at IS NULL AND active_from <= ? AND (active_to IS NULL OR active_to >= ?) ORDER BY name`, [childId, toDate, fromDate]);
  if (!meds.length) return { meds: [], doses: [], changes: [] };
  const ids = meds.map((m) => m.id);
  const marks = ids.map(() => '?').join(',');
  const [doses, changes] = await Promise.all([
    all<{ medication_id: string; scheduled_for: string | null; status: 'pending' | 'taken' | 'late' | 'missed' | 'skipped' }>(ex,
      `SELECT medication_id, scheduled_for, status FROM med_doses WHERE deleted_at IS NULL AND medication_id IN (${marks})
       AND scheduled_for >= ? AND scheduled_for < ?`, [...ids, iso(from), iso(to)]),
    all<{ medication_id: string; changed_at: string; change_type: string; old_value: string | null; new_value: string | null }>(ex,
      `SELECT medication_id, changed_at, change_type, old_value, new_value FROM medication_changes WHERE deleted_at IS NULL
       AND medication_id IN (${marks}) AND changed_at >= ? AND changed_at < ? ORDER BY changed_at`, [...ids, iso(from), iso(to)]),
  ]);
  return {
    meds: meds.map((m) => ({ id: m.id, name: m.name, strength: m.strength, form: m.form, rxcui: m.rxcui, asNeeded: !!m.as_needed,
      times: parseJson<MedSchedule>(m.schedule, { times: [], days: [] }).times, activeFrom: m.active_from, activeTo: m.active_to })),
    doses: doses.map((d) => ({ medicationId: d.medication_id, scheduledFor: d.scheduled_for == null ? null : ms(d.scheduled_for), status: d.status })),
    changes: changes.map((c) => ({ medicationId: c.medication_id, at: ms(c.changed_at), changeType: c.change_type, oldValue: c.old_value, newValue: c.new_value })),
  };
}

async function loadSleep(ex: Executor, profile: ChildProfile, fromDate: string, toDate: string) {
  const [a, b] = rangeBounds(fromDate, toDate, profile.homeTz);
  const rows = await all<{ sleep_end: string; duration_min: number }>(ex,
    'SELECT sleep_end, duration_min FROM sleep_entries WHERE child_id = ? AND deleted_at IS NULL AND sleep_end >= ? AND sleep_end < ?',
    [profile.id, iso(a - 29 * 86_400_000), iso(b)]);
  return rows.map((r) => ({ sleepEnd: ms(r.sleep_end), durationMin: r.duration_min }));
}
