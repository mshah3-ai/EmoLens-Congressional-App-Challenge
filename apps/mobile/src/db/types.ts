/**
 * The `Db` interface (SPEC 30.2). The app talks to SQLite only through this, so the same repository code runs
 * on the phone (op-sqlite + SQLCipher, see opsqlite.ts) and in unit tests (better-sqlite3 in Node).
 */
export type SqlValue = string | number | null;
export type Row = Record<string, SqlValue>;

export interface QueryResult { rows: Row[]; rowsAffected: number; }

/** Anything that can run SQL: the database itself or an open transaction. */
export interface Executor {
  execute(sql: string, params?: SqlValue[]): Promise<QueryResult>;
}

export interface Db extends Executor {
  /** Runs `fn` inside BEGIN/COMMIT; rolls back if it throws. Do not nest. */
  transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>;
  close(): void;
}

/** Read helpers: typed first row / all rows. The caller states the row shape it selected. */
export async function all<T>(ex: Executor, sql: string, params: SqlValue[] = []): Promise<T[]> {
  return (await ex.execute(sql, params)).rows as unknown as T[];
}
export async function one<T>(ex: Executor, sql: string, params: SqlValue[] = []): Promise<T | null> {
  const rows = (await ex.execute(sql, params)).rows;
  return rows.length ? (rows[0] as unknown as T) : null;
}
