/**
 * Ask EmoLens tools that read logged entries (SPEC Appendix A.2): hard moments, one day's summary, medications and
 * doses, meals, sleep, comparing two periods, and searching notes. Each one is a plain SQL read of this phone's
 * database; nothing is changed. Place names are labels only (never coordinates).
 */
import { datesBetween } from '@emolens/engine';
import { all } from '../../db/types';
import { parseJson, type DoseRow, type EpisodeRow, type MealItemJson, type MealRow, type MedSchedule, type MedicationRow, type SleepRow } from '../../db/rows';
import { ToolInputError, dateArg, list, localDay, localStamp, rangeArgs, round, type ToolEnv, type ToolOutput } from './common';

type In = Record<string, unknown>;
const tzOf = (env: ToolEnv) => env.profile.homeTz;

// ---------------------------------------------------------------------------------------------------- hard moments
interface EpisodeOut extends EpisodeRow { place_label: string | null; helped: string | null; }

async function episodesBetween(env: ToolEnv, startIso: string, endIso: string): Promise<EpisodeOut[]> {
  return all<EpisodeOut>(env.repo.db,
    `SELECT e.*, p.label AS place_label,
       (SELECT group_concat(s.name || ' (' || u.outcome || ')', '; ') FROM strategy_uses u JOIN strategies s ON s.id = u.strategy_id
         WHERE u.episode_id = e.id AND u.deleted_at IS NULL) AS helped
     FROM episodes e LEFT JOIN places p ON p.id = e.place_id
     WHERE e.child_id = ? AND e.deleted_at IS NULL AND e.started_at >= ? AND e.started_at < ? ORDER BY e.started_at`,
    [env.profile.id, startIso, endIso]);
}

const episodeView = (e: EpisodeOut, tz: string) => ({
  ref: `E:${e.id}`, at: localStamp(e.started_at, tz), type: e.type, intensity: e.intensity, duration_min: e.duration_min,
  place: e.place_label, place_type: e.place_type, before: parseJson<string[]>(e.antecedent_tags, []), before_note: e.antecedent_note,
  looked_like: parseJson<string[]>(e.behavior_tags, []), what_was_tried: e.helped, notes: e.notes, safety_concern: e.safety_concern === 1,
});

export async function getEpisodes(input: In, env: ToolEnv): Promise<ToolOutput> {
  const r = rangeArgs(input, env);
  const types = Array.isArray(input.types) ? input.types.filter((t): t is string => typeof t === 'string') : null;
  const minI = typeof input.min_intensity === 'number' ? input.min_intensity : null;
  const placeType = typeof input.place_type === 'string' ? input.place_type : null;
  const rows = (await episodesBetween(env, r.startIso, r.endIso))
    .filter((e) => (!types || types.length === 0 || types.includes(e.type)) && (minI == null || (e.intensity ?? 0) >= minI)
      && (!placeType || e.place_type === placeType));
  return list(rows.map((e) => episodeView(e, tzOf(env))), { range: { from: localDay(r.from), to: localDay(r.to) } });
}

// ---------------------------------------------------------------------------------------------------- medications
export async function getMedications(_input: In, env: ToolEnv): Promise<ToolOutput> {
  const meds = await all<MedicationRow>(env.repo.db, 'SELECT * FROM medications WHERE child_id = ? AND deleted_at IS NULL ORDER BY active_from', [env.profile.id]);
  const changes = await all<{ medication_id: string; changed_at: string; change_type: string; old_value: string | null; new_value: string | null; id: string }>(env.repo.db,
    `SELECT c.* FROM medication_changes c JOIN medications m ON m.id = c.medication_id
     WHERE m.child_id = ? AND c.deleted_at IS NULL ORDER BY c.changed_at`, [env.profile.id]);
  const rows = meds.map((m) => {
    const sched = parseJson<MedSchedule>(m.schedule, { times: [], days: [] });
    return {
      ref: `MED:${m.id}`, name: m.name, strength: m.strength, form: m.form, as_needed: m.as_needed === 1,
      schedule_times: sched.times, schedule_days: sched.days, active_from: m.active_from, active_to: m.active_to,
      changes: changes.filter((c) => c.medication_id === m.id).map((c) => ({ at: localStamp(c.changed_at, tzOf(env)), change: c.change_type, from: c.old_value, to: c.new_value })),
    };
  });
  return { result: { rows, total: rows.length, truncated: false }, refs: [] };
}

export async function getDoseHistory(input: In, env: ToolEnv): Promise<ToolOutput> {
  const r = rangeArgs(input, env);
  const name = typeof input.medication_name === 'string' ? input.medication_name.trim().toLowerCase() : '';
  const rows = await all<DoseRow & { med_name: string }>(env.repo.db,
    `SELECT d.*, m.name AS med_name FROM med_doses d JOIN medications m ON m.id = d.medication_id
     WHERE m.child_id = ? AND d.deleted_at IS NULL AND d.status != 'pending'
       AND COALESCE(d.scheduled_for, d.taken_at) >= ? AND COALESCE(d.scheduled_for, d.taken_at) < ?
     ORDER BY COALESCE(d.scheduled_for, d.taken_at)`, [env.profile.id, r.startIso, r.endIso]);
  const tz = tzOf(env);
  return list(rows.filter((d) => !name || d.med_name.toLowerCase().includes(name)).map((d) => ({
    ref: `M:${d.id}`, medication: d.med_name, status: d.status, scheduled: localStamp(d.scheduled_for, tz), taken: localStamp(d.taken_at, tz), dose: d.dose_text,
  })));
}

// ---------------------------------------------------------------------------------------------------- meals, sleep
export async function getMeals(input: In, env: ToolEnv): Promise<ToolOutput> {
  const r = rangeArgs(input, env);
  const rows = await all<MealRow>(env.repo.db,
    'SELECT * FROM meals WHERE child_id = ? AND deleted_at IS NULL AND eaten_at >= ? AND eaten_at < ? ORDER BY eaten_at', [env.profile.id, r.startIso, r.endIso]);
  return list(rows.map((m) => ({
    ref: `F:${m.id}`, at: localStamp(m.eaten_at, tzOf(env)), meal_type: m.meal_type, amount: m.amount,
    items: parseJson<MealItemJson[]>(m.items, []).map((i) => ({ name: i.name, tags: i.tags })), notes: m.notes,
  })));
}

async function sleepRows(env: ToolEnv, from: string, to: string): Promise<SleepRow[]> {
  // a night belongs to the date it ends on (the morning the child woke up)
  const r = rangeArgs({ a: from, b: to }, env, 'a', 'b');
  return all<SleepRow>(env.repo.db,
    'SELECT * FROM sleep_entries WHERE child_id = ? AND deleted_at IS NULL AND sleep_end >= ? AND sleep_end < ? ORDER BY sleep_end', [env.profile.id, r.startIso, r.endIso]);
}

export async function getSleep(input: In, env: ToolEnv): Promise<ToolOutput> {
  const r = rangeArgs(input, env);
  const rows = await sleepRows(env, r.from, r.to);
  const tz = tzOf(env);
  return list(rows.map((s) => ({
    ref: `SL:${s.id}`, bedtime: localStamp(s.sleep_start, tz), woke: localStamp(s.sleep_end, tz), hours_asleep: round(s.duration_min / 60, 1),
    night_wakings: s.night_wakings, quality: s.quality, source: s.source,
  })), { typical_sleep_hours: env.profile.typicalSleepHours });
}

// ---------------------------------------------------------------------------------------------------- one day
export async function getDaySummary(input: In, env: ToolEnv): Promise<ToolOutput> {
  const date = dateArg(input, 'date')!;
  const day = { start_date: date, end_date: date };
  const r = rangeArgs(day, env);
  const db = env.repo.db, id = env.profile.id, tz = tzOf(env);
  const [episodes, meals, doses, sleep] = await Promise.all([getEpisodes(day, env), getMeals(day, env), getDoseHistory(day, env), getSleep(day, env)]);
  const visits = await all<{ id: string; arrived_at: string; departed_at: string | null; place_type: string; label: string | null }>(db,
    `SELECT v.id, v.arrived_at, v.departed_at, v.place_type, p.label FROM place_visits v LEFT JOIN places p ON p.id = v.place_id
     WHERE v.child_id = ? AND v.deleted_at IS NULL AND v.arrived_at < ? AND COALESCE(v.departed_at, v.arrived_at) >= ? ORDER BY v.arrived_at`,
    [id, r.endIso, r.startIso]);
  const strategies = await all<{ id: string; used_at: string; context: string; outcome: string; name: string }>(db,
    `SELECT u.id, u.used_at, u.context, u.outcome, s.name FROM strategy_uses u JOIN strategies s ON s.id = u.strategy_id
     WHERE u.child_id = ? AND u.deleted_at IS NULL AND u.used_at >= ? AND u.used_at < ? ORDER BY u.used_at`, [id, r.startIso, r.endIso]);
  const notes = await all<{ id: string; noted_at: string; text: string }>(db,
    'SELECT id, noted_at, text FROM notes WHERE child_id = ? AND deleted_at IS NULL AND noted_at >= ? AND noted_at < ? ORDER BY noted_at', [id, r.startIso, r.endIso]);
  const illness = await all<{ id: string; started_at: string; ended_at: string | null; kind: string; severity: number }>(db,
    `SELECT id, started_at, ended_at, kind, severity FROM illness_logs WHERE child_id = ? AND deleted_at IS NULL
       AND started_at < ? AND (ended_at IS NULL OR ended_at >= ?)`, [id, r.endIso, r.startIso]);
  const routine = await all<{ id: string; description: string | null; severity: number }>(db,
    'SELECT id, description, severity FROM routine_changes WHERE child_id = ? AND deleted_at IS NULL AND local_date = ?', [id, date]);
  // Calendar titles stay on the phone unless the parent allowed sharing them (SPEC 19.1); tags are always fine.
  const events = await all<{ title: string; start_at: string; tags: string }>(db,
    `SELECT title, start_at, tags FROM calendar_events WHERE ignored = 0 AND start_at >= ? AND start_at < ? ORDER BY start_at`, [r.startIso, r.endIso]);
  const schedule = events.map((e) => ({
    at: localStamp(e.start_at, tz), tags: parseJson<string[]>(e.tags, []), ...(env.settings.ai_share_event_titles ? { title: e.title } : {}),
  })).filter((e) => e.tags.length > 0 || 'title' in e);
  const refs = [...episodes.refs, ...meals.refs, ...doses.refs, ...sleep.refs,
    ...visits.map((v) => `P:${v.id}`), ...strategies.map((s) => `S:${s.id}`), ...notes.map((n) => `N:${n.id}`),
    ...illness.map((i) => `I:${i.id}`), ...routine.map((x) => `R:${x.id}`)];
  return {
    result: {
      date: localDay(date),
      hard_moments: (episodes.result as { rows: unknown[] }).rows,
      meals: (meals.result as { rows: unknown[] }).rows,
      medication_doses: (doses.result as { rows: unknown[] }).rows,
      sleep_last_night: (sleep.result as { rows: unknown[] }).rows,
      places: visits.map((v) => ({ ref: `P:${v.id}`, place: v.label, place_type: v.place_type, arrived: localStamp(v.arrived_at, tz), left: localStamp(v.departed_at, tz) })),
      strategies: strategies.map((s) => ({ ref: `S:${s.id}`, at: localStamp(s.used_at, tz), name: s.name, context: s.context, outcome: s.outcome })),
      notes: notes.map((n) => ({ ref: `N:${n.id}`, at: localStamp(n.noted_at, tz), text: n.text })),
      illness: illness.map((i) => ({ ref: `I:${i.id}`, kind: i.kind, severity: i.severity, since: localStamp(i.started_at, tz) })),
      routine_changes: routine.map((x) => ({ ref: `R:${x.id}`, description: x.description, severity: x.severity })),
      schedule,
    },
    refs,
  };
}

// ---------------------------------------------------------------------------------------------------- comparing
const METRICS = ['episode_count', 'episode_rate_per_day', 'avg_intensity', 'avg_duration', 'sleep_hours', 'dose_adherence'] as const;
type Metric = (typeof METRICS)[number];

async function metricFor(metric: Metric, from: string, to: string, env: ToolEnv): Promise<{ value: number | null; n: number; refs: string[] }> {
  const r = rangeArgs({ a: from, b: to }, env, 'a', 'b');
  if (metric === 'sleep_hours') {
    const s = await sleepRows(env, from, to);
    return { value: s.length ? round(s.reduce((a, x) => a + x.duration_min, 0) / s.length / 60, 2) : null, n: s.length, refs: s.map((x) => `SL:${x.id}`) };
  }
  if (metric === 'dose_adherence') {
    const d = await all<{ id: string; status: string }>(env.repo.db,
      `SELECT d.id, d.status FROM med_doses d JOIN medications m ON m.id = d.medication_id
       WHERE m.child_id = ? AND d.deleted_at IS NULL AND d.scheduled_for IS NOT NULL AND d.status != 'pending' AND d.scheduled_for >= ? AND d.scheduled_for < ?`,
      [env.profile.id, r.startIso, r.endIso]);
    // SPEC 21: adherence = (taken + late) ÷ scheduled
    const ok = d.filter((x) => x.status === 'taken' || x.status === 'late').length;
    return { value: d.length ? round(ok / d.length, 3) : null, n: d.length, refs: d.map((x) => `M:${x.id}`) };
  }
  const eps = await episodesBetween(env, r.startIso, r.endIso);
  const refs = eps.map((e) => `E:${e.id}`);
  const days = datesBetween(from, to).length;
  const mean = (xs: number[]) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length, 2) : null);
  switch (metric) {
    case 'episode_count': return { value: eps.length, n: eps.length, refs };
    case 'episode_rate_per_day': return { value: round(eps.length / days, 2), n: eps.length, refs };
    case 'avg_intensity': return { value: mean(eps.flatMap((e) => (e.intensity == null ? [] : [e.intensity]))), n: eps.length, refs };
    default: return { value: mean(eps.flatMap((e) => (e.duration_min == null ? [] : [e.duration_min]))), n: eps.length, refs };
  }
}

export async function comparePeriods(input: In, env: ToolEnv): Promise<ToolOutput> {
  const metric = input.metric;
  if (!METRICS.includes(metric as Metric)) throw new ToolInputError(`metric must be one of ${METRICS.join(', ')}`);
  const a = rangeArgs(input, env, 'a_start', 'a_end');
  const b = rangeArgs(input, env, 'b_start', 'b_end');
  const [va, vb] = await Promise.all([metricFor(metric as Metric, a.from, a.to, env), metricFor(metric as Metric, b.from, b.to, env)]);
  const change = va.value != null && vb.value != null ? round(vb.value - va.value, 3) : null;
  return {
    result: {
      metric,
      a: { from: localDay(a.from), to: localDay(a.to), days: datesBetween(a.from, a.to).length, value: va.value, entries: va.n },
      b: { from: localDay(b.from), to: localDay(b.to), days: datesBetween(b.from, b.to).length, value: vb.value, entries: vb.n },
      change_b_minus_a: change,
    },
    refs: [...va.refs, ...vb.refs].slice(0, 400),
  };
}

// ---------------------------------------------------------------------------------------------------- notes search
const likeEscape = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function searchNotes(input: In, env: ToolEnv): Promise<ToolOutput> {
  const query = typeof input.query === 'string' ? input.query.trim() : '';
  if (!query) throw new ToolInputError('query is empty');
  // dates are optional here: without them, all notes are searched
  const from = dateArg(input, 'start_date', false);
  const to = dateArg(input, 'end_date', false);
  const r = from && to ? rangeArgs(input, env) : {
    startIso: from ? rangeArgs({ a: from, b: from }, env, 'a', 'b').startIso : '0000',
    endIso: to ? rangeArgs({ a: to, b: to }, env, 'a', 'b').endIso : '9999',
  };
  const q = likeEscape(query);
  const db = env.repo.db, id = env.profile.id, tz = tzOf(env);
  const notes = await all<{ id: string; noted_at: string; text: string; source: string }>(db,
    `SELECT id, noted_at, text, source FROM notes WHERE child_id = ? AND deleted_at IS NULL AND text LIKE ? ESCAPE '\\'
       AND noted_at >= ? AND noted_at < ? ORDER BY noted_at DESC`, [id, q, r.startIso, r.endIso]);
  const eps = await all<{ id: string; started_at: string; notes: string | null; antecedent_note: string | null; type: string }>(db,
    `SELECT id, started_at, notes, antecedent_note, type FROM episodes WHERE child_id = ? AND deleted_at IS NULL
       AND (notes LIKE ? ESCAPE '\\' OR antecedent_note LIKE ? ESCAPE '\\') AND started_at >= ? AND started_at < ? ORDER BY started_at DESC`,
    [id, q, q, r.startIso, r.endIso]);
  const rows = [
    ...notes.map((n) => ({ ref: `N:${n.id}`, at: localStamp(n.noted_at, tz), kind: 'note', text: n.text, sort: n.noted_at })),
    ...eps.map((e) => ({ ref: `E:${e.id}`, at: localStamp(e.started_at, tz), kind: `${e.type} note`, text: [e.antecedent_note, e.notes].filter(Boolean).join(' / '), sort: e.started_at })),
  ].sort((x, y) => (x.sort < y.sort ? 1 : -1)).map(({ sort: _s, ...rest }) => rest);
  return list(rows);
}
