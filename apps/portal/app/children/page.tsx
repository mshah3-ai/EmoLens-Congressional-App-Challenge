/** /children (SPEC 24.1): every child the signed-in person is on the care team of, with their role. */
import Link from 'next/link';
import { myChildren } from '@/lib/data';
import { ROLE_LABEL, requireUser } from '@/lib/session';

export default async function Children() {
  const { userId, supabase } = await requireUser();
  const kids = await myChildren(supabase, userId);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Children</h1>
      {kids.length ? (
        <ul className="grid gap-3 sm:grid-cols-2" data-testid="children-list">
          {kids.map((k) => (
            <li key={k.id}>
              <Link href={`/children/${k.id}`} className="block rounded-2xl border border-line bg-surface p-4 hover:border-primary">
                <div className="text-lg font-semibold">{k.nickname}</div>
                <div className="text-sm text-muted">{ROLE_LABEL[k.role]}</div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-line bg-surface p-6">
          <p>You aren&apos;t on a care team yet.</p>
          <p className="text-sm text-muted">Ask the child&apos;s parent for an invite code, then <Link className="text-primary underline" href="/join">join here</Link>.</p>
        </div>
      )}
    </div>
  );
}
