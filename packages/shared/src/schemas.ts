/**
 * zod schemas (spec 3.3, 22.5), imported as `@emolens/shared/schemas` (kept out of the main entry so the engine,
 * which imports `@emolens/shared`, stays free of runtime dependencies), for the "Export all data" backup file:
 *   { format: 'emolens-backup', schema_version, exported_at, tables: { episodes: [ {...row}, ... ], ... } }
 * The envelope is fixed here. The row schema of each table is built from that table's columns as the database reports
 * them (`PRAGMA table_info`), so it always matches the migrations and never has to be updated by hand.
 */
import { z } from 'zod';

export const BACKUP_FORMAT = 'emolens-backup';

/** One SQLite value: text, a number or NULL (EmoLens stores no binary data). */
export const SqlValue = z.union([z.string(), z.number(), z.null()]);
export type SqlValue = z.infer<typeof SqlValue>;

export const BackupFileSchema = z.strictObject({
  format: z.literal(BACKUP_FORMAT),
  /** The number of the newest database migration when the file was made. */
  schema_version: z.number().int().positive(),
  exported_at: z.string(),
  tables: z.record(z.string(), z.array(z.record(z.string(), SqlValue))),
});
export type BackupFile = z.infer<typeof BackupFileSchema>;

/** One column, from `PRAGMA table_info(table)`. */
export interface ColumnInfo { name: string; type: string; notNull: boolean; hasDefault: boolean; primaryKey: boolean; }

/**
 * The schema of one row: exactly the table's columns (an unknown column is an error), each with its SQLite type.
 * A column may be missing from the file only if it can be NULL or has a default, so a backup made before a later
 * migration added such a column still imports; key columns and required columns must be there.
 */
export function rowSchemaFor(columns: ColumnInfo[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const c of columns) {
    const t = c.type.toUpperCase();
    let v: z.ZodType = t.includes('INT') ? z.number().int() : t.includes('REAL') ? z.number() : t.includes('TEXT') ? z.string() : SqlValue;
    if (!c.notNull && !c.primaryKey) v = v.nullable();
    if ((!c.notNull || c.hasDefault) && !c.primaryKey) v = v.optional();
    shape[c.name] = v;
  }
  return z.strictObject(shape);
}

/** A short, readable description of what is wrong with a file (for the import screen and the error log). */
export function describeSchemaError(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return 'invalid file';
  const where = first.path.length ? first.path.join('.') : 'file';
  return `${where}: ${first.message}`;
}

/**
 * Phase 8 (SPEC 20, Appendix A.3): the structured log the AI returns for a voice note or a school report, checked
 * again on the phone before anything is shown (the AI's answer is never trusted blindly). Numbers outside the allowed
 * range become null rather than failing the whole note.
 */
const nullableText = z.string().max(2000).nullable();
const inRange = (lo: number, hi: number) => z.number().int().nullable().transform((n) => (n != null && n >= lo && n <= hi ? n : null));

export const StructuredLogSchema = z.object({
  episodes: z.array(z.object({
    started_at_local: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/),
    type: z.enum(['meltdown', 'shutdown', 'other']),
    intensity: inRange(1, 5).default(null),
    duration_min: inRange(0, 600).default(null),
    place_label: nullableText.default(null),
    antecedent_note: nullableText.default(null),
    strategies: z.array(z.object({ name: z.string().min(1).max(200), helped: z.boolean().nullable().default(null) })).max(20).default([]),
  })).max(20),
  med_doses: z.array(z.object({
    medication_name: z.string().min(1).max(200),
    taken_at_local: nullableText.default(null),
    status: z.enum(['taken', 'missed', 'skipped']),
  })).max(20),
  meals: z.array(z.object({
    eaten_at_local: nullableText.default(null),
    meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'drink']),
    items: z.array(z.string().min(1).max(200)).max(30),
  })).max(20),
  sleep: z.object({ bedtime_local: nullableText.default(null), wake_local: nullableText.default(null), night_wakings: inRange(0, 30).default(null) }).nullable().default(null),
  illness: z.array(z.object({ kind: z.string().min(1).max(100), severity: inRange(1, 3).default(null) })).max(10),
  routine_change: nullableText.default(null),
  notes: nullableText.default(null),
});
export type StructuredLog = z.output<typeof StructuredLogSchema>;
