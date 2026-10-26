/**
 * Reading a child's synced data for the portal, always as the signed-in person (row-level security decides what comes
 * back: a teacher simply gets no medications, sleep or snapshots). Cloud rows are turned into the same report inputs
 * the phone uses, so `assembleReport` (@emolens/reports) builds the same report here as on the phone.
 * What the portal can't compute itself (patterns, time of day, forecast quality) comes from the newest insight snapshot
 * uploaded by the family's forecasting phone.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  alertMetrics, evaluablePredictions, modelHealth, previousPeriod, rangeBounds, type AlertMetrics, type HealthMetrics, type TimeOfDayRow, type WatchItem,
} from '@emolens/engine';
import { serverTimeMs, type EpisodeType, type PlaceType } from '@emolens/shared';
import type { InputDose, ReportInputs, SnapInsight } from '@emolens/reports';

export type Role = 'owner' | 'caregiver' | 'teacher' | 'clinician';

export interface ChildRow {
  id: string; nickname: string; home_tz: string; typical_sleep_hours: number | null; wake_start: string; wake_end: string; school_days: number[];
}

export interface ChildContext { child: ChildRow; role: Role; }

type Row = Record<string, unknown>;
const ms = (v: unknown): number => serverTimeMs(v);
const msOrNull = (v: unknown): number | null => (v == null ? null : serverTimeMs(v));
const isoOf = (t: number) => new Date(t).toISOString();

/** The children the signed-in person is an active member of, with their role. */
export async function myChildren(sb: SupabaseClient, userId: string): Promise<(ChildRow & { role: Role })[]> {
  const { data: members, error } = await sb.from('memberships').select('child_id, role').eq('user_id', userId).eq('status', 'active');
  if (error || !members?.length) return [];
  const { data: kids } = await sb.from('children').select('id, nickname, home_tz, typical_sleep_hours, wake_start, wake_end, school_days')
    .in('id', members.map((m) => m.child_id)).is('deleted_at', null).order('nickname');
  const role = new Map(members.map((m) => [m.child_id as string, m.role as Role]));
  return ((kids ?? []) as ChildRow[]).map((k) => ({ ...k, role: role.get(k.id) as Role }));
}

export async function childContext(sb: SupabaseClient, userId: string, childId: string): Promise<ChildContext | null> {
  const kids = await myChildren(sb, userId);
  const k = kids.find((c) => c.id === childId);
  return k ? { child: k, role: k.role } : null;
}

export interface Snapshot {
  computedAt: number;
  fit: { lang?: string; learning?: boolean; labeledDays?: number; tau?: number; converged?: boolean };
  insights: SnapInsight[];
  worthWatching: WatchItem[];
  strategies: { name: string; context: 'proactive' | 'during'; uses: number; successes?: number; mean: number; lo80?: number; hi80?: number }[];
  /** Model Health as the phone computed it; parts can be missing in an older or partial snapshot. */
  health: { health?: { last28?: HealthMetrics; allTime?: HealthMetrics }; alerts?: { last28?: AlertMetrics; allTime?: AlertMetrics } } | null;
  timeOfDay: TimeOfDayRow[];
}

/** The newest insight snapshot, or null (none yet, or this role may not see snapshots). */
export async function latestSnapshot(sb: SupabaseClient, childId: string): Promise<Snapshot | null> {
  const { data } = await sb.from('insight_snapshots').select('*').eq('child_id', childId).order('computed_at', { ascending: false }).limit(1);
  const r = data?.[0] as Row | undefined;
  if (!r) return null;
  return {
    computedAt: ms(r.computed_at), fit: (r.fit_summary ?? {}) as Snapshot['fit'], insights: (r.insights ?? []) as SnapInsight[],
    worthWatching: (r.worth_watching ?? []) as WatchItem[], strategies: (r.strategies ?? []) as Snapshot['strategies'],
    health: (r.model_health ?? null) as Snapshot['health'], timeOfDay: (r.time_of_day ?? []) as TimeOfDayRow[],
  };
}

/** "No forecasts checked yet", as the engine itself reports it. */
const emptyHealth = (): HealthMetrics => modelHealth(evaluablePredictions([], new Map()));
const emptyAlerts = (): AlertMetrics => alertMetrics([], [], Date.now());

/** All rows of a query, 1000 at a time (PostgREST returns at most 1000 per request). */
export async function allRows(q: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error || !data) break;
    out.push(...(data as Row[]));
    if (data.length < 1000) break;
  }
  return out;
}

export const episodeFrom = (e: Row): ReportInputs['episodes'][number] => ({
  id: String(e.id), startedAt: ms(e.started_at), durationMin: (e.duration_min as number | null) ?? null, type: e.type as EpisodeType,
  intensity: (e.intensity as number | null) ?? null, placeId: (e.place_id as string | null) ?? null, placeType: (e.place_type as string | null) ?? null,
  antecedentTags: (e.antecedent_tags as string[] | null) ?? [], antecedentNote: (e.antecedent_note as string | null) ?? null,
  behaviorTags: (e.behavior_tags as string[] | null) ?? [],
});

/** Everything `assembleReport` needs for a range, read from the cloud. */
export async function reportInputs(sb: SupabaseClient, child: ChildRow, fromDate: string, toDate: string, snapshot: Snapshot | null,
  noteIds: string[] = []): Promise<ReportInputs> {
  const tz = child.home_tz;
  const prev = previousPeriod(fromDate, toDate);
  const [from, to] = rangeBounds(fromDate, toDate, tz);
  const [prevFrom] = rangeBounds(prev.from, prev.to, tz);
  const id = child.id;

  const [episodes, places, strategies, uses, meds, doses, changes, sleep, notes] = await Promise.all([
    allRows((a, b) => sb.from('episodes').select('*').eq('child_id', id).is('deleted_at', null)
      .gte('started_at', isoOf(prevFrom)).lt('started_at', isoOf(to)).order('started_at').range(a, b)),
    allRows((a, b) => sb.from('places_public').select('id, label, type').eq('child_id', id).range(a, b)),
    allRows((a, b) => sb.from('strategies').select('id, name').eq('child_id', id).range(a, b)),
    allRows((a, b) => sb.from('strategy_uses').select('strategy_id, context, outcome, episode_id, used_at').eq('child_id', id).is('deleted_at', null)
      .gte('used_at', isoOf(from)).lt('used_at', isoOf(to)).order('used_at').range(a, b)),
    allRows((a, b) => sb.from('medications').select('*').eq('child_id', id).is('deleted_at', null).lte('active_from', toDate).order('name').range(a, b)),
    allRows((a, b) => sb.from('med_doses').select('medication_id, scheduled_for, status').eq('child_id', id).is('deleted_at', null)
      .gte('scheduled_for', isoOf(from)).lt('scheduled_for', isoOf(to)).range(a, b)),
    allRows((a, b) => sb.from('medication_changes').select('medication_id, changed_at, change_type, old_value, new_value').eq('child_id', id)
      .is('deleted_at', null).gte('changed_at', isoOf(from)).lt('changed_at', isoOf(to)).range(a, b)),
    allRows((a, b) => sb.from('sleep_entries').select('sleep_end, duration_min').eq('child_id', id).is('deleted_at', null)
      .gte('sleep_end', isoOf(from - 29 * 86_400_000)).lt('sleep_end', isoOf(to)).range(a, b)),
    noteIds.length
      ? allRows((a, b) => sb.from('notes').select('id, noted_at, text').eq('child_id', id).is('deleted_at', null).in('id', noteIds).order('noted_at').range(a, b))
      : Promise.resolve([] as Row[]),
  ]);

  const names = new Map(strategies.map((s) => [String(s.id), String(s.name)]));
  const activeMeds = meds.filter((m) => m.active_to == null || String(m.active_to) >= fromDate);
  return {
    profile: { id, nickname: child.nickname, homeTz: tz, typicalSleepHours: child.typical_sleep_hours ?? 10, schoolDays: child.school_days },
    episodes: episodes.map(episodeFrom),
    places: places.map((p) => ({ id: String(p.id), label: String(p.label), type: p.type as PlaceType })),
    uses: uses.map((u) => ({ strategyId: String(u.strategy_id), name: names.get(String(u.strategy_id)) ?? '', context: u.context as 'proactive' | 'during',
      outcome: String(u.outcome), episodeId: (u.episode_id as string | null) ?? null, usedAt: ms(u.used_at) })),
    timeOfDay: snapshot?.timeOfDay ?? [],
    patterns: snapshot?.insights ?? [],
    watch: snapshot?.worthWatching ?? [],
    health: snapshot?.health?.health?.last28 ?? emptyHealth(),
    alerts: snapshot?.health?.alerts?.last28 ?? emptyAlerts(),
    medications: {
      meds: activeMeds.map((m) => ({ id: String(m.id), name: String(m.name), strength: (m.strength as string | null) ?? null, form: (m.form as string | null) ?? null,
        rxcui: (m.rxcui as string | null) ?? null, asNeeded: !!m.as_needed, times: ((m.schedule as { times?: string[] } | null)?.times) ?? [],
        activeFrom: String(m.active_from), activeTo: (m.active_to as string | null) ?? null })),
      doses: doses.map((d) => ({ medicationId: String(d.medication_id), scheduledFor: msOrNull(d.scheduled_for), status: d.status as InputDose['status'] })),
      changes: changes.map((c) => ({ medicationId: String(c.medication_id), at: ms(c.changed_at), changeType: String(c.change_type),
        oldValue: (c.old_value as string | null) ?? null, newValue: (c.new_value as string | null) ?? null })),
    },
    sleep: sleep.map((s) => ({ sleepEnd: ms(s.sleep_end), durationMin: Number(s.duration_min) })),
    notes: notes.map((n) => ({ id: String(n.id), at: ms(n.noted_at), text: String(n.text) })),
  };
}
