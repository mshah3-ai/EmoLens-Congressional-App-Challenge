'use client';
import { useActionState } from 'react';
import { joinTeam } from './actions';

export function JoinForm() {
  const [error, join, pending] = useActionState(joinTeam, null);
  return (
    <form action={join} className="space-y-3">
      <label className="block text-sm font-semibold" htmlFor="code">Invite code</label>
      <input id="code" name="code" required autoComplete="off" placeholder="ABCD 2345"
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 uppercase tracking-widest" />
      <button className="rounded-lg bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={pending} type="submit">Join</button>
      {error ? <p role="alert" className="text-sm text-high">{error}</p> : null}
    </form>
  );
}
