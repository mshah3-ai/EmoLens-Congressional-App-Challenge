/** Runs a database read and re-runs it whenever data changes (`dataVersion`) or `deps` change. */
import { useEffect, useState, type DependencyList } from 'react';
import { recordError } from '../db/repo/errors';
import { useSession } from '../store/session';

export function useDbQuery<T>(fn: () => Promise<T>, deps: DependencyList, initial: T): { data: T; loading: boolean } {
  const version = useSession((s) => s.dataVersion);
  const repo = useSession((s) => s.repo);
  const [state, setState] = useState<{ data: T; loading: boolean }>({ data: initial, loading: true });
  useEffect(() => {
    let alive = true;
    fn().then(
      (data) => { if (alive) setState({ data, loading: false }); },
      (e) => { if (repo) void recordError(repo.db, 'query', e); if (alive) setState((s) => ({ ...s, loading: false })); },
    );
    return () => { alive = false; };
  }, [version, ...deps]);
  return state;
}
