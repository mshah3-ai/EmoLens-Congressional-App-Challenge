/**
 * "Import a backup" (SPEC 22.5): check a backup file, show what's in it, then merge it into this phone's database.
 *  1. Check (zod, @emolens/shared/schemas): the file's shape, a schema version this app understands, only tables and
 *     columns this database has, and the right type in every column. A bad file changes nothing.
 *  2. Preview: rows per table and the child's nickname.
 *  3. Merge, in one transaction, row by row by primary key:
 *     - tables with `updated_at`: the newer edit wins; on a tie this phone's copy stays (last-writer-wins, SPEC 23.3);
 *     - other tables: rows this phone doesn't have yet are added.
 *     - settings: this phone's own settings stay; device-only ones (data-source connections, device role...) are never
 *       copied from another phone;
 *     - merging the same child: the tables the phone computes itself (blocks, features, fits, forecasts) are skipped.
 *  4. Afterwards every time block is marked for recomputing, so the next forecast run rebuilds features and labels.
 * EmoLens keeps one child per phone: if this phone already has a different child, the file is not merged; the parent can
 * choose "Replace", which clears this phone's data first (DECISIONS #73).
 */
import { BackupFileSchema, describeSchemaError, rowSchemaFor, type BackupFile, type SqlValue } from '@emolens/shared/schemas';
import { all, type Db, type Executor } from '../db/types';
import { backupTables, schemaVersion, tableColumns } from './export';

/**
 * Tables the phone works out itself from the logs (time blocks, features, model fits, forecasts, the engine's saved
 * result). Merging the same child's backup skips them: this phone already has its own, and old copies (e.g. a fit it has
 * since replaced) would only add noise. A fresh restore or a replace imports them, so Model Health keeps its history.
 */
export const DERIVED_TABLES = new Set(['blocks', 'block_features', 'model_fits', 'predictions', 'engine_snapshots']);

/** Settings that describe this phone, not the child: never copied from a backup. */
export const DEVICE_SETTINGS = new Set(['device_role', 'integration_state', 'calendar_ids', 'demo_info', 'simulated_sources',
  'notified_insights', 'primary_forecaster', 'receive_alerts', 'app_lock', 'mode', 'care_team_enabled', 'account_user_id',
  'account_email', 'member_role', 'care_team_pushed', 'removed_from_team', 'last_snapshot_date', 'share_tokens']);

export type ImportProblem = 'not_json' | 'not_backup' | 'newer_version' | 'unknown_table' | 'bad_rows' | 'no_child';

export class ImportError extends Error {
  constructor(public problem: ImportProblem, detail = '') { super(detail ? `${problem}: ${detail}` : problem); }
}

export interface ImportPreview {
  file: BackupFile;
  nickname: string;
  childId: string;
  exportedAt: string;
  /** The backed-up child's home time zone (for showing exportedAt as a date). */
  homeTz: string;
  counts: { table: string; rows: number }[];
  /** 'fresh' = this phone has no child yet; 'same' = the same child (merge); 'different' = another child (replace only). */
  match: 'fresh' | 'same' | 'different';
}

/** Parses and checks a backup file's text against this database. Throws ImportError. */
export async function previewImport(ex: Executor, text: string): Promise<ImportPreview> {
  let raw: unknown;
  try { raw = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new ImportError('not_json'); }
  const parsed = BackupFileSchema.safeParse(raw);
  if (!parsed.success) throw new ImportError('not_backup', describeSchemaError(parsed.error));
  const file = parsed.data;
  if (file.schema_version > await schemaVersion(ex)) throw new ImportError('newer_version', String(file.schema_version));

  const local = new Set(await backupTables(ex));
  for (const [table, rows] of Object.entries(file.tables)) {
    if (!local.has(table)) throw new ImportError('unknown_table', table);
    const schema = rowSchemaFor(await tableColumns(ex, table));
    for (let i = 0; i < rows.length; i++) {
      const r = schema.safeParse(rows[i]);
      if (!r.success) throw new ImportError('bad_rows', `${table}[${i}] ${describeSchemaError(r.error)}`);
    }
  }
  const child = (file.tables.children ?? []).find((c) => c.deleted_at == null);
  if (!child || typeof child.id !== 'string') throw new ImportError('no_child');

  const mine = await all<{ id: string }>(ex, 'SELECT id FROM children WHERE deleted_at IS NULL');
  const match = !mine.length ? 'fresh' : mine.some((c) => c.id === child.id) ? 'same' : 'different';
  return {
    file, nickname: String(child.nickname ?? ''), childId: child.id, exportedAt: file.exported_at,
    homeTz: typeof child.home_tz === 'string' && child.home_tz ? child.home_tz : Intl.DateTimeFormat().resolvedOptions().timeZone, match,
    counts: Object.entries(file.tables).map(([table, rows]) => ({ table, rows: rows.length })).filter((c) => c.rows > 0),
  };
}

export interface ImportResult { added: number; updated: number; kept: number; }

/**
 * Merges a checked file into the database (see the file comment). With `replace`, this phone's data tables are emptied
 * first, inside the same transaction, so a failure leaves everything as it was.
 */
export async function applyImport(db: Db, preview: ImportPreview, o: { replace?: boolean } = {}): Promise<ImportResult> {
  if (preview.match === 'different' && !o.replace) throw new ImportError('no_child', 'different child');
  const result: ImportResult = { added: 0, updated: 0, kept: 0 };
  await db.transaction(async (tx) => {
    // Rows arrive in any order (an episode before its child); foreign keys are checked once, at commit.
    await tx.execute('PRAGMA defer_foreign_keys = ON');
    if (o.replace) for (const t of await backupTables(tx)) await tx.execute(`DELETE FROM "${t}"`);
    for (const [table, rows] of Object.entries(preview.file.tables)) {
      if (!rows.length || (preview.match === 'same' && !o.replace && DERIVED_TABLES.has(table))) continue;
      const cols = await tableColumns(tx, table);
      const pk = cols.filter((c) => c.primaryKey).map((c) => c.name);
      const lww = cols.some((c) => c.name === 'updated_at') && pk.length > 0;
      for (const row of rows) {
        if (table === 'settings' && DEVICE_SETTINGS.has(String(row.key))) continue;
        const names = Object.keys(row);
        const values = names.map((n) => row[n] as SqlValue);
        const quoted = names.map((n) => `"${n}"`).join(', ');
        const marks = names.map(() => '?').join(', ');
        const where = pk.map((n) => `"${n}" = ?`).join(' AND ');
        const existed = lww && (await all(tx, `SELECT 1 FROM "${table}" WHERE ${where}`, pk.map((n) => row[n] as SqlValue))).length > 0;
        const res = lww
          ? await tx.execute(`INSERT INTO "${table}" (${quoted}) VALUES (${marks})
            ON CONFLICT(${pk.map((n) => `"${n}"`).join(', ')}) DO UPDATE SET ${names.filter((n) => !pk.includes(n)).map((n) => `"${n}" = excluded."${n}"`).join(', ')}
            WHERE excluded.updated_at > "${table}".updated_at
            ON CONFLICT DO NOTHING`, values)
          : await tx.execute(`INSERT OR IGNORE INTO "${table}" (${quoted}) VALUES (${marks})`, values);
        if (!res.rowsAffected) result.kept++;
        else if (existed) result.updated++;
        else result.added++;
      }
    }
    // Recompute everything derived from the logs (features, labels) on the next forecast run.
    await tx.execute('UPDATE blocks SET dirty = 1');
  });
  return result;
}
