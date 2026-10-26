/**
 * A public read-only report link (SPEC 24.3). The page asks the share-view function for the snapshot (on the server,
 * with the publishable key: no sign-in and no secret key), checks it, and shows it with a banner. Unknown, expired or
 * revoked links all say "This link is no longer available." Not indexed by search engines.
 */
import type { Metadata } from 'next';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { dateYearAt, parseShareSnapshot } from '@emolens/reports';
import { ReportView } from '@/components/ReportView';
import { PrintButton } from '@/components/PrintButton';
import { supabaseEnv } from '@/lib/env';

export const metadata: Metadata = { title: 'Shared EmoLens report', robots: { index: false, follow: false, nocache: true } };
export const dynamic = 'force-dynamic';

async function fetchSnapshot(token: string): Promise<{ snapshot: unknown; expiresAt: string } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const { url, key } = supabaseEnv();
  const sb = createSupabase(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.functions.invoke('share-view', { body: { token } });
  if (error || !data) return null;
  const d = data as { snapshot: unknown; expires_at: string };
  return { snapshot: d.snapshot, expiresAt: d.expires_at };
}

export default async function SharedReport({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const got = await fetchSnapshot(token);
  const data = got ? parseShareSnapshot(got.snapshot) : null;
  if (!got || !data) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-6 text-center" data-testid="share-unavailable">
        <h1 className="text-xl font-semibold">This link is no longer available.</h1>
        <p className="mt-2 text-sm text-muted">It may have expired or been turned off by the family.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4" role="note" data-testid="share-banner">
        <p className="text-sm">Read-only report shared by {data.nickname}&apos;s family. Expires {dateYearAt('en', Date.parse(got.expiresAt), data.tz)}.</p>
        <PrintButton />
      </div>
      <ReportView data={data} />
    </div>
  );
}
