/** A `Db` backed by better-sqlite3 so repository code can be tested in Node (SPEC 30.2). Not encrypted. */
import Database from 'better-sqlite3';
import { migrate } from '../src/db/migrate';
import type { Db, Executor, QueryResult, Row, SqlValue } from '../src/db/types';
import { Repo } from '../src/db/repo/writer';

export function nodeDb(): Db {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const execute = async (sql: string, params: SqlValue[] = []): Promise<QueryResult> => {
    const stmt = sqlite.prepare(sql);
    if (stmt.reader) return { rows: stmt.all(...params) as Row[], rowsAffected: 0 };
    return { rows: [], rowsAffected: stmt.run(...params).changes };
  };
  return {
    execute,
    async transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T> {
      sqlite.exec('BEGIN');
      try {
        const out = await fn({ execute });
        sqlite.exec('COMMIT');
        return out;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
    close: () => sqlite.close(),
  };
}

export async function testRepo(): Promise<Repo> {
  const db = nodeDb();
  await migrate(db);
  return new Repo(db, { deviceId: 'test-device', createdBy: 'local' });
}
