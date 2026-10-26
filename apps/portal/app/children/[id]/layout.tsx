/** A child's pages: name, the viewer's role and the tabs this role may use (teachers have no medications). */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ROLE_LABEL, requireChild } from '@/lib/session';

export default async function ChildLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { child, role } = await requireChild(id);
  const tabs = [
    ['', 'Overview'], ['/episodes', 'Hard moments'], ...(role === 'teacher' ? [] : [['/medications', 'Medications']]),
    ['/strategies', 'Strategies'], ...(role === 'teacher' ? [] : [['/notes', 'Notes'], ['/report', 'Report']]),
  ];
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold" data-testid="child-name">{child.nickname}</h1>
        <span className="text-sm text-muted">You: {ROLE_LABEL[role]}</span>
      </div>
      <nav className="no-print flex flex-wrap gap-2 text-sm">
        {tabs.map(([path, label]) => (
          <Link key={path} href={`/children/${id}${path}`} className="rounded-full border border-line bg-surface px-3 py-1 hover:border-primary">{label}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
