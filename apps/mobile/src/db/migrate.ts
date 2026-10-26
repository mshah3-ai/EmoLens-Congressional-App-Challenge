/**
 * Applies numbered migrations in order, each inside its own transaction, and records them in
 * schema_migrations (SPEC 6.1). Running it twice is safe: applied versions are skipped.
 * If a migration fails, the transaction rolls back and the error is thrown; the app then shows a
 * recovery screen and never deletes data (SPEC 29).
 */
import { MIGRATIONS, type Migration } from './migrations';
import type { Db } from './types';

/** Splits a migration file into statements. Our SQL has no semicolons inside strings or triggers. */
export function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export async function migrate(db: Db, migrations: Migration[] = MIGRATIONS): Promise<number[]> {
  await db.execute('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT)');
  const done = new Set((await db.execute('SELECT version FROM schema_migrations')).rows.map((r) => Number(r.version)));
  const applied: number[] = [];
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (done.has(m.version)) continue;
    await db.transaction(async (tx) => {
      for (const stmt of splitStatements(m.sql)) await tx.execute(stmt);
      await tx.execute('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [m.version, new Date().toISOString()]);
    });
    applied.push(m.version);
  }
  return applied;
}
