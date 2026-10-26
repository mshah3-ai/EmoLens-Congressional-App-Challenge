/**
 * Medications, their change history, and dose rows (SPEC 10.3).
 * Every add / stop / dose change / time change writes a `medication_changes` row, because the engine's
 * `med_change_recent` feature looks for recent changes. RxNorm search and reminders arrive in Phase 4.
 */
import { addDays, doseStatusForTaken, isDoseMissed, isoWeekday, localDateOf, parseHHMM, zonedToUtc } from '@emolens/engine';
import type { ChildProfile } from '@emolens/shared';
import { all, one, type Executor } from '../types';
import { parseJson, type DoseRow, type MedicationRow, type MedSchedule } from '../rows';
import { iso, ms, nowIso } from '../time';
import { around, medChangeRange, type Repo, type Writer } from './writer';

export interface MedicationInput {
  name: string; strength: string | null; form: string | null; schedule: MedSchedule; asNeeded: boolean;
  remindersEnabled: boolean; activeFrom: string; notes: string | null; rxcui?: string | null;
}

const columns = (m: MedicationInput) => ({
  name: m.name.trim(), rxcui: m.rxcui ?? null, strength: m.strength, form: m.form,
  schedule: JSON.stringify({ times: [...m.schedule.times].sort(), days: m.schedule.days }),
  as_needed: m.asNeeded ? 1 : 0, reminders_enabled: m.remindersEnabled ? 1 : 0, active_from: m.activeFrom, notes: m.notes,
});

async function recordChange(w: Writer, childId: string, medicationId: string, type: 'start' | 'stop' | 'dose_change' | 'time_change',
  oldValue: string | null, newValue: string | null): Promise<void> {
  const at = nowIso();
  await w.insert('medication_changes', { medication_id: medicationId, changed_at: at, change_type: type, old_value: oldValue, new_value: newValue },
    [medChangeRange(childId, at)]);
}

export async function addMedicationWith(w: Writer, childId: string, m: MedicationInput): Promise<string> {
  const id = await w.insert('medications', { child_id: childId, ...columns(m), active_to: null });
  await recordChange(w, childId, id, 'start', null, JSON.stringify({ strength: m.strength, times: m.schedule.times }));
  return id;
}

export function addMedication(repo: Repo, childId: string, m: MedicationInput): Promise<string> {
  return repo.write((w) => addMedicationWith(w, childId, m));
}

export function updateMedication(repo: Repo, childId: string, id: string, m: MedicationInput): Promise<void> {
  return repo.write(async (w) => {
    const old = await one<MedicationRow>(w.ex, 'SELECT * FROM medications WHERE id = ?', [id]);
    if (!old) throw new Error('medication not found');
    await w.update('medications', id, columns(m));
    if ((old.strength ?? '') !== (m.strength ?? '')) await recordChange(w, childId, id, 'dose_change', old.strength, m.strength);
    const oldTimes = parseJson<MedSchedule>(old.schedule, { times: [], days: [] });
    const newTimes = { times: [...m.schedule.times].sort(), days: m.schedule.days };
    if (JSON.stringify(oldTimes) !== JSON.stringify(newTimes)) {
      await recordChange(w, childId, id, 'time_change', JSON.stringify(oldTimes), JSON.stringify(newTimes));
      // Future pending doses no longer match the schedule; they are regenerated on next app open.
      const future = await all<{ id: string }>(w.ex, "SELECT id FROM med_doses WHERE medication_id = ? AND status = 'pending' AND scheduled_for > ?", [id, nowIso()]);
      for (const d of future) await w.softDelete('med_doses', d.id);
    }
  });
}

export function stopMedication(repo: Repo, child: ChildProfile, id: string): Promise<void> {
  return repo.write(async (w) => {
    await w.update('medications', id, { active_to: localDateOf(Date.now(), child.homeTz) });
    await recordChange(w, child.id, id, 'stop', null, null);
    const future = await all<{ id: string }>(w.ex, "SELECT id FROM med_doses WHERE medication_id = ? AND status = 'pending' AND scheduled_for > ?", [id, nowIso()]);
    for (const d of future) await w.softDelete('med_doses', d.id);
  });
}

export function listMedications(ex: Executor, childId: string, includeStopped = false): Promise<MedicationRow[]> {
  return all<MedicationRow>(ex,
    `SELECT * FROM medications WHERE child_id = ? AND deleted_at IS NULL ${includeStopped ? '' : 'AND active_to IS NULL'} ORDER BY name`, [childId]);
}

export function getMedication(ex: Executor, id: string): Promise<MedicationRow | null> {
  return one<MedicationRow>(ex, 'SELECT * FROM medications WHERE id = ?', [id]);
}

/**
 * Creates today's scheduled dose rows (and any missing ones for the last 6 days) with status 'pending'
 * (SPEC 10.3: "at local midnight, and on app open for any missing days"). Returns how many were added.
 */
export function ensureDoseRows(repo: Repo, child: ChildProfile, now = Date.now()): Promise<number> {
  return repo.write(async (w) => {
    const today = localDateOf(now, child.homeTz);
    const meds = await listMedications(w.ex, child.id, true);
    let added = 0;
    for (const med of meds) {
      if (med.as_needed) continue;
      const sched = parseJson<MedSchedule>(med.schedule, { times: [], days: [] });
      for (let i = 6; i >= 0; i--) {
        const date = addDays(today, -i);
        if (date < med.active_from || (med.active_to != null && date > med.active_to)) continue;
        if (!sched.days.includes(isoWeekday(date))) continue;
        for (const time of sched.times) {
          const scheduledFor = iso(zonedToUtc(date, parseHHMM(time), child.homeTz));
          // Deleted rows count as existing, so a dose the user removed is not recreated.
          const exists = await one(w.ex, 'SELECT 1 AS x FROM med_doses WHERE medication_id = ? AND scheduled_for = ?', [med.id, scheduledFor]);
          if (exists) continue;
          await w.insert('med_doses', { medication_id: med.id, scheduled_for: scheduledFor, taken_at: null, status: 'pending', dose_text: med.strength });
          added++;
        }
      }
    }
    return added;
  });
}

/** Pending doses more than 240 min past their time become 'missed' (SPEC 10.3). */
export function markMissedDoses(repo: Repo, childId: string, now = Date.now()): Promise<number> {
  return repo.write(async (w) => {
    const pending = await all<DoseRow>(w.ex,
      `SELECT d.* FROM med_doses d JOIN medications m ON m.id = d.medication_id
        WHERE m.child_id = ? AND d.status = 'pending' AND d.deleted_at IS NULL AND d.scheduled_for IS NOT NULL`, [childId]);
    let n = 0;
    for (const d of pending) {
      if (!isDoseMissed(d.status, ms(d.scheduled_for as string), now)) continue;
      await w.update('med_doses', d.id, { status: 'missed' }, [around(childId, d.scheduled_for as string)]);
      n++;
    }
    return n;
  });
}

export function markDoseTaken(repo: Repo, childId: string, dose: DoseRow, takenAt: string): Promise<void> {
  const status = doseStatusForTaken(dose.scheduled_for ? ms(dose.scheduled_for) : null, ms(takenAt));
  return repo.write((w) => w.update('med_doses', dose.id, { status, taken_at: takenAt }, [around(childId, dose.scheduled_for ?? takenAt)]));
}

export function skipDose(repo: Repo, childId: string, dose: DoseRow): Promise<void> {
  return repo.write((w) => w.update('med_doses', dose.id, { status: 'skipped', taken_at: null }, [around(childId, dose.scheduled_for ?? nowIso())]));
}

/** An as-needed dose, or an extra dose logged from Log → Med. */
export function logAsNeededDose(repo: Repo, childId: string, medicationId: string, takenAt: string, doseText: string | null): Promise<string> {
  return repo.write((w) => w.insert('med_doses', { medication_id: medicationId, scheduled_for: null, taken_at: takenAt, status: 'taken', dose_text: doseText },
    [around(childId, takenAt)]));
}

export type DoseWithMed = DoseRow & { med_name: string; med_strength: string | null };

/** Scheduled doses still pending within ±60 min of now (Today's "Medication due" card, SPEC 9.2). */
export function dueDoses(ex: Executor, childId: string, now = Date.now()): Promise<DoseWithMed[]> {
  return all<DoseWithMed>(ex,
    `SELECT d.*, m.name AS med_name, m.strength AS med_strength FROM med_doses d JOIN medications m ON m.id = d.medication_id
      WHERE m.child_id = ? AND d.deleted_at IS NULL AND d.status = 'pending' AND d.scheduled_for BETWEEN ? AND ?
      ORDER BY d.scheduled_for`, [childId, iso(now - 60 * 60_000), iso(now + 60 * 60_000)]);
}

/** Today's scheduled doses for the Log → Med sheet. */
export function dosesBetween(ex: Executor, childId: string, fromIso: string, toIso: string): Promise<DoseWithMed[]> {
  return all<DoseWithMed>(ex,
    `SELECT d.*, m.name AS med_name, m.strength AS med_strength FROM med_doses d JOIN medications m ON m.id = d.medication_id
      WHERE m.child_id = ? AND d.deleted_at IS NULL AND d.scheduled_for >= ? AND d.scheduled_for < ? ORDER BY d.scheduled_for`,
    [childId, fromIso, toIso]);
}

export const getDose = (ex: Executor, id: string) =>
  one<DoseWithMed>(ex, 'SELECT d.*, m.name AS med_name, m.strength AS med_strength FROM med_doses d JOIN medications m ON m.id = d.medication_id WHERE d.id = ?', [id]);

