/** The smaller log types: meals (10.4), sleep (10.5), places + check-ins (10.6), illness (10.7), routine changes (10.8), notes (10.9). */
import type { PlaceType } from '@emolens/shared';
import { all, one, type Executor } from '../types';
import type { IllnessKind, IllnessRow, MealAmount, MealItemJson, MealRow, MealType, NoteRow, PlaceRow, RoutineRow, SleepRow, VisitRow } from '../rows';
import { iso, ms, nowIso } from '../time';
import { around, type Repo, type Writer } from './writer';
import { setSettings } from './settings';
import type { VisitChange } from '../../integrations/geofence';

// ---------- meals ----------

/** Keyword rules for automatic item tags that need no nutrition data (SPEC 10.4). `high_sugar` needs food search (Phase 4). */
const CAFFEINE = ['caffeine', 'coffee', 'cola', 'energy drink', 'tea', 'espresso', 'latte', 'café', 'cafe', 'té', 'refresco de cola'];
const ARTIFICIAL_COLOR = ['red 40', 'yellow 5', 'yellow 6', 'blue 1', 'rojo 40', 'amarillo 5', 'amarillo 6', 'azul 1'];

export const normalizeFood = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** Whole-word match so "tea" does not match "steak". Works with accented letters. */
function hasPhrase(name: string, phrase: string): boolean {
  const words = normalizeFood(name).split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ');
  return (` ${words} `).includes(` ${phrase} `);
}

export function autoFoodTags(name: string): string[] {
  const tags: string[] = [];
  if (CAFFEINE.some((k) => hasPhrase(name, k))) tags.push('caffeine');
  if (ARTIFICIAL_COLOR.some((k) => hasPhrase(name, k))) tags.push('artificial_color');
  return tags;
}

/** A food as picked in the meal sheet: from a barcode, a search, a recent chip, or typed in. */
export interface MealItemInput { name: string; source?: MealItemJson['source']; code?: string | null; tags?: string[] }
export interface MealInput { eatenAt: string; mealType: MealType; items: MealItemInput[]; amount: MealAmount | null; notes: string | null; }

async function buildItems(ex: Executor, childId: string, picked: MealItemInput[], excludeMealId: string | null): Promise<MealItemJson[]> {
  const prior = await all<{ items: string }>(ex,
    'SELECT items FROM meals WHERE child_id = ? AND deleted_at IS NULL AND id != ?', [childId, excludeMealId ?? '']);
  const seen = new Set<string>();
  for (const r of prior) for (const it of JSON.parse(r.items) as MealItemJson[]) seen.add(normalizeFood(it.name));
  return picked.map((p) => ({ ...p, name: p.name.trim() })).filter((p) => p.name).map((p) => {
    // Tags from a food lookup are kept, keyword tags are added, and `new_food` is recomputed every save.
    const tags = new Set([...(p.tags ?? []).filter((t) => t !== 'new_food'), ...autoFoodTags(p.name)]);
    if (!seen.has(normalizeFood(p.name))) tags.add('new_food');
    return { name: p.name, source: p.source ?? 'custom', code: p.code ?? null, tags: [...tags] };
  });
}

export function logMeal(repo: Repo, childId: string, m: MealInput, id?: string, previousAt?: string): Promise<string> {
  return repo.write(async (w) => {
    const items = await buildItems(w.ex, childId, m.items, id ?? null);
    const values = { child_id: childId, eaten_at: m.eatenAt, meal_type: m.mealType, items: JSON.stringify(items), amount: m.amount, notes: m.notes };
    const dirty = [around(childId, m.eatenAt), ...(previousAt ? [around(childId, previousAt)] : [])];
    if (id) { await w.update('meals', id, values, dirty); return id; }
    return w.insert('meals', values, dirty);
  });
}

/** The 12 most-logged items, as one-tap chips (SPEC 10.4). Each keeps its most recent spelling, source and tags. */
export async function recentFoods(ex: Executor, childId: string, limit = 12): Promise<MealItemJson[]> {
  const rows = await all<{ items: string }>(ex, 'SELECT items FROM meals WHERE child_id = ? AND deleted_at IS NULL ORDER BY eaten_at DESC LIMIT 300', [childId]);
  const counts = new Map<string, { item: MealItemJson; n: number }>();
  for (const r of rows) for (const it of JSON.parse(r.items) as MealItemJson[]) {
    const k = normalizeFood(it.name);
    const c = counts.get(k) ?? { item: { ...it, tags: it.tags.filter((t) => t !== 'new_food') }, n: 0 };
    c.n++; counts.set(k, c);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.item.name.localeCompare(b.item.name)).slice(0, limit).map((c) => c.item);
}

export const getMeal = (ex: Executor, id: string) => one<MealRow>(ex, 'SELECT * FROM meals WHERE id = ?', [id]);

// ---------- sleep ----------

export interface SleepInput { sleepStart: string; sleepEnd: string; nightWakings: number | null; quality: number | null; }

export function logSleep(repo: Repo, childId: string, s: SleepInput, id?: string): Promise<string> {
  const duration = Math.max(0, Math.round((ms(s.sleepEnd) - ms(s.sleepStart)) / 60_000));
  const values = { child_id: childId, sleep_start: s.sleepStart, sleep_end: s.sleepEnd, duration_min: duration, quality: s.quality,
    night_wakings: s.nightWakings, source: 'manual', external_id: null };
  return repo.write(async (w) => {
    if (id) { await w.update('sleep_entries', id, values, [around(childId, s.sleepEnd)]); return id; }
    return w.insert('sleep_entries', values, [around(childId, s.sleepEnd)]);
  });
}

/** Sleep ending today (for the "How did X sleep?" card, SPEC 10.5). */
export const sleepEndingBetween = (ex: Executor, childId: string, fromIso: string, toIso: string) =>
  one<SleepRow>(ex, 'SELECT * FROM sleep_entries WHERE child_id = ? AND deleted_at IS NULL AND sleep_end >= ? AND sleep_end < ? ORDER BY sleep_end DESC LIMIT 1', [childId, fromIso, toIso]);

export const getSleep = (ex: Executor, id: string) => one<SleepRow>(ex, 'SELECT * FROM sleep_entries WHERE id = ?', [id]);

// ---------- places ----------

export interface PlaceInput { label: string; type: PlaceType; }

export async function addPlaceWith(w: Writer, childId: string, p: PlaceInput): Promise<string> {
  return w.insert('places', { child_id: childId, label: p.label.trim(), type: p.type, latitude: null, longitude: null, radius_m: 150, geofence_enabled: 1 });
}
export const addPlace = (repo: Repo, childId: string, p: PlaceInput) => repo.write((w) => addPlaceWith(w, childId, p));
export const updatePlace = (repo: Repo, id: string, p: PlaceInput) => repo.write((w) => w.update('places', id, { label: p.label.trim(), type: p.type }));
export const deletePlace = (repo: Repo, id: string) => repo.write((w) => w.softDelete('places', id));
export const listPlaces = (ex: Executor, childId: string) =>
  all<PlaceRow>(ex, 'SELECT * FROM places WHERE child_id = ? AND deleted_at IS NULL ORDER BY (type = \'home\') DESC, label', [childId]);

/** The visit the child is in right now (no departure yet), if any. */
export const currentVisit = (ex: Executor, childId: string) =>
  one<VisitRow & { place_label: string | null }>(ex,
    `SELECT v.*, p.label AS place_label FROM place_visits v LEFT JOIN places p ON p.id = v.place_id
      WHERE v.child_id = ? AND v.deleted_at IS NULL AND v.departed_at IS NULL ORDER BY v.arrived_at DESC LIMIT 1`, [childId]);

/**
 * Sets a place's map location (local only). For the home place it also sets the weather location, rounded to 2 decimals
 * (about 1 km) so the exact address is never sent to the weather service (SPEC 11.4).
 */
export function setPlaceLocation(repo: Repo, place: PlaceRow, latitude: number, longitude: number, radiusM = 150): Promise<void> {
  return repo.write(async (w) => {
    await w.update('places', place.id, { latitude, longitude, radius_m: radiusM });
    if (place.type === 'home') {
      await setSettings(w.ex, { weather_lat: Math.round(latitude * 100) / 100, weather_lon: Math.round(longitude * 100) / 100 });
    }
  });
}

/** Removes a place's map location (and, for Home, the weather location). */
export function clearPlaceLocation(repo: Repo, place: PlaceRow): Promise<void> {
  return repo.write(async (w) => {
    await w.update('places', place.id, { latitude: null, longitude: null });
    if (place.type === 'home') await setSettings(w.ex, { weather_lat: null, weather_lon: null });
  });
}

/** Applies a geofence change (integrations/geofence.ts) at time `at`. */
export function applyVisitChange(repo: Repo, childId: string, change: VisitChange, at: string,
  source: 'geofence_child_device' | 'geofence_parent'): Promise<boolean> {
  if (!change.close.length && !change.open) return Promise.resolve(false);
  return repo.write(async (w) => {
    for (const id of change.close) await w.update('place_visits', id, { departed_at: at }, [around(childId, at)]);
    if (change.open) {
      await w.insert('place_visits', { child_id: childId, place_id: change.open.placeId, place_type: change.open.placeType, arrived_at: at, departed_at: null, source },
        [around(childId, at)]);
    }
    return true;
  });
}

/** Manual check-in (SPEC 10.6): closes any open visit and opens a new one. `place = null` means "Away / somewhere else". */
export function checkIn(repo: Repo, childId: string, place: PlaceRow | null, at: string = nowIso()): Promise<string> {
  return repo.write(async (w) => {
    const open = await all<{ id: string }>(w.ex, 'SELECT id FROM place_visits WHERE child_id = ? AND deleted_at IS NULL AND departed_at IS NULL', [childId]);
    for (const v of open) await w.update('place_visits', v.id, { departed_at: at });
    return w.insert('place_visits', {
      child_id: childId, place_id: place?.id ?? null, place_type: place?.type ?? 'away_untagged', arrived_at: at, departed_at: null, source: 'manual',
    }, [around(childId, at)]);
  });
}

// ---------- illness ----------

export interface IllnessInput { kind: IllnessKind; severity: number; startedAt: string; ongoing: boolean; notes: string | null; }

export function logIllness(repo: Repo, childId: string, i: IllnessInput, id?: string): Promise<string> {
  return repo.write(async (w) => {
    const existing = id ? await one<IllnessRow>(w.ex, 'SELECT * FROM illness_logs WHERE id = ?', [id]) : null;
    const endedAt = i.ongoing ? null : (existing?.ended_at ?? iso(Math.max(ms(i.startedAt), Date.now())));
    const values = { child_id: childId, started_at: i.startedAt, ended_at: endedAt, kind: i.kind, severity: i.severity, notes: i.notes };
    if (id) { await w.update('illness_logs', id, values, [around(childId, i.startedAt)]); return id; }
    return w.insert('illness_logs', values, [around(childId, i.startedAt)]);
  });
}

export const markBetter = (repo: Repo, childId: string, id: string) =>
  repo.write((w) => { const now = nowIso(); return w.update('illness_logs', id, { ended_at: now }, [around(childId, now)]); });

export const ongoingIllnesses = (ex: Executor, childId: string) =>
  all<IllnessRow>(ex, 'SELECT * FROM illness_logs WHERE child_id = ? AND deleted_at IS NULL AND ended_at IS NULL ORDER BY started_at DESC', [childId]);

export const getIllness = (ex: Executor, id: string) => one<IllnessRow>(ex, 'SELECT * FROM illness_logs WHERE id = ?', [id]);

// ---------- routine changes ----------

export interface RoutineInput { localDate: string; startAt: string | null; description: string | null; severity: number; }

export function logRoutineChange(repo: Repo, childId: string, r: RoutineInput, dayStartIso: string, id?: string): Promise<string> {
  const values = { child_id: childId, local_date: r.localDate, start_at: r.startAt, description: r.description, severity: r.severity };
  // unusual_day covers the whole local date, so mark that day's blocks.
  const dirty = [{ childId, from: dayStartIso, to: iso(ms(dayStartIso) + 24 * 3_600_000) }];
  return repo.write(async (w) => {
    if (id) { await w.update('routine_changes', id, values, dirty); return id; }
    return w.insert('routine_changes', values, dirty);
  });
}

export const getRoutine = (ex: Executor, id: string) => one<RoutineRow>(ex, 'SELECT * FROM routine_changes WHERE id = ?', [id]);

// ---------- notes ----------

export function addNote(repo: Repo, childId: string, text: string, notedAt: string, id?: string): Promise<string> {
  const values = { child_id: childId, noted_at: notedAt, text: text.trim(), source: 'manual', audio_path: null, structured_status: 'none' };
  return repo.write(async (w) => {
    if (id) { await w.update('notes', id, values); return id; }
    return w.insert('notes', values);
  });
}

/** A voice-note or document note (Phase 8, SPEC 20): its source, the kept audio file (if any) and where its review stands. */
export interface SourcedNote {
  text: string; notedAt: string; source: 'voice' | 'document'; audioPath: string | null;
  structuredStatus: 'none' | 'pending' | 'accepted' | 'rejected';
}

export function addSourcedNote(repo: Repo, childId: string, n: SourcedNote): Promise<string> {
  return repo.write((w) => w.insert('notes', {
    child_id: childId, noted_at: n.notedAt, text: n.text.trim(), source: n.source, audio_path: n.audioPath, structured_status: n.structuredStatus,
  }));
}

/** After the review screen: 'accepted' when something was saved from the note, otherwise 'rejected'. */
export function setNoteStructured(repo: Repo, id: string, status: 'accepted' | 'rejected', text?: string): Promise<void> {
  return repo.write((w) => w.update('notes', id, text == null ? { structured_status: status } : { structured_status: status, text: text.trim() }));
}

export const getNote = (ex: Executor, id: string) => one<NoteRow>(ex, 'SELECT * FROM notes WHERE id = ?', [id]);

export const getVisit = (ex: Executor, id: string) => one<VisitRow>(ex, 'SELECT * FROM place_visits WHERE id = ?', [id]);

/** Edit a check-in from the Timeline: which place, and when the child arrived. */
export function updateVisit(repo: Repo, childId: string, id: string, place: PlaceRow | null, arrivedAt: string, previousAt: string): Promise<void> {
  return repo.write((w) => w.update('place_visits', id, { place_id: place?.id ?? null, place_type: place?.type ?? 'away_untagged', arrived_at: arrivedAt },
    [around(childId, arrivedAt), around(childId, previousAt)]));
}
