/** The portal's frame: EmoLens header (sign out when signed in) and the page. English UI (DECISIONS). */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { currentUserId } from '@/lib/supabase/server';
import './globals.css';

export const metadata: Metadata = {
  title: 'EmoLens portal',
  description: 'Summaries of a child’s caregiver-logged data for their care team.',
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const userId = await currentUserId();
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <header className="no-print border-b border-line bg-surface">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/children" className="text-lg font-semibold text-primary">EmoLens</Link>
            {userId ? (
              <nav className="flex items-center gap-4 text-sm">
                <Link href="/children" className="hover:underline">Children</Link>
                <Link href="/join" className="hover:underline">Join a care team</Link>
                <form action="/auth/signout" method="post"><button className="text-muted hover:underline" type="submit">Sign out</button></form>
              </nav>
            ) : null}
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <footer className="no-print mx-auto max-w-5xl px-4 pb-8 text-xs text-muted">
          EmoLens shows caregiver-reported observations and statistical patterns. It is not a medical device and does not diagnose.
        </footer>
      </body>
    </html>
  );
}
