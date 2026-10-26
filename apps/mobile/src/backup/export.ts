/**
 * "Export all data" (SPEC 22.5): every local table in one JSON file, `emolens-export-{date}.json`, for moving to a new
 * phone or keeping a copy. Sync bookkeeping (`outbox`, `sync_state`, the care-team copies `team_members` and
 * `school_forecasts`) and the migration log are left out; the file
 * records `schema_version` (the newest migration applied) instead. The file is NOT encrypted: the screen says so before
 * sharing it.
 */
import { BACKUP_FORMAT, type BackupFile, type ColumnInfo, type SqlValue } from '@emolens/shared/schemas';
import { all, type Executor } from '../db/types';

/** Tables that never go into a backup. */
export const BACKUP_SKIP = new Set(['outbox', 'sync_state', 'schema_migrations', 'team_members', 'school_forecasts']);

/** Names of the data tables in this database, in creation order. */
export async function backupTables(ex: Executor): Promise<string[]> {
  const rows = await all<{ name: string }>(ex,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid");
  return rows.map((r) => r.name).filter((n) => !BACKUP_SKIP.has(n));
}

/** Column list of one table, as SQLite reports it. `table` comes from `backupTables`, never from user input. */
export async function tableColumns(ex: Executor, table: string): Promise<ColumnInfo[]> {
  const rows = await all<{ name: string; type: string; notnull: number; dflt_value: string | null; pk: number }>(ex, `PRAGMA table_info("${table}")`);
  return rows.map((r) => ({ name: r.name, type: r.type, notNull: r.notnull === 1, hasDefault: r.dflt_value != null, primaryKey: r.pk > 0 }));
}

export async function schemaVersion(ex: Executor): Promise<number> {
  const r = await all<{ v: number | null }>(ex, 'SELECT MAX(version) AS v FROM schema_migrations');
  return r[0]?.v ?? 0;
}

/** Settings that must never be written to an (unencrypted) backup file: share-link tokens work like passwords. */
export const EXPORT_SKIP_SETTINGS = ['share_tokens'];

export async function exportAll(ex: Executor, now = Date.now()): Promise<BackupFile> {
  const tables: Record<string, Record<string, SqlValue>[]> = {};
  for (const name of await backupTables(ex)) tables[name] = await all<Record<string, SqlValue>>(ex, `SELECT * FROM "${name}"`);
  if (tables.settings) tables.settings = tables.settings.filter((r) => !EXPORT_SKIP_SETTINGS.includes(String(r.key)));
  return { format: BACKUP_FORMAT, schema_version: await schemaVersion(ex), exported_at: new Date(now).toISOString(), tables };
}
