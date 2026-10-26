/**
 * Phone implementation of `Db` using op-sqlite built with SQLCipher (package.json "op-sqlite": {"sqlcipher": true}).
 * SQLCipher encrypts the whole database file with the key from keys.ts; without the key the file is unreadable.
 */
import { open, isSQLCipher, type DB } from '@op-engineering/op-sqlite';
import type { Db, Executor, QueryResult, Row, SqlValue } from './types';

function toResult(r: { rows: Record<string, unknown>[]; rowsAffected: number }): QueryResult {
  return { rows: r.rows as Row[], rowsAffected: r.rowsAffected };
}

export function openEncrypted(name: string, encryptionKey: string): Db {
  if (!isSQLCipher()) {
    // Never silently store family data unencrypted (SPEC 27.2).
    throw new Error('SQLCipher is not enabled in this build');
  }
  const db: DB = open({ name, encryptionKey });
  // SPEC 6.1 pragmas. They must run outside a transaction.
  db.executeSync('PRAGMA foreign_keys = ON');
  db.executeSync('PRAGMA journal_mode = WAL');
  return wrap(db);
}

function wrap(db: DB): Db {
  return {
    async execute(sql: string, params: SqlValue[] = []) {
      return toResult(await db.execute(sql, params));
    },
    async transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
      let result: T | undefined;
      await db.transaction(async (tx) => {
        result = await fn({ execute: async (sql, params = []) => toResult(await tx.execute(sql, params)) });
      });
      return result as T;
    },
    close() { db.close(); },
  };
}

/** Deletes a database file (used by "Delete all data" and "Reset demo"). Opens it first because op-sqlite deletes by handle. */
export function deleteDatabaseFile(name: string, encryptionKey: string): void {
  const db = open({ name, encryptionKey });
  db.delete();
}
