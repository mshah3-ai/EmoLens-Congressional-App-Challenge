/**
 * Read-only share links (SPEC 24.3). The owner picks a date range, who it's for (Clinician / School / Family, the same
 * audiences as the PDF report; for School, only school-time hard moments unless the owner turns that off) and 7 or 30 days. The phone builds the report's data exactly like the PDF does
 * (reports/data.ts: a School report has no medications, sleep or places outside school; caregiver notes only if
 * ticked) and sends it to the share-create function, which checks it again and returns a random token.
 * The link is {portal}/share/{token}. The token is kept on this phone (encrypted) so the link can be copied again;
 * the cloud only has its hash.
 */
import type { ChildProfile, Lang } from '@emolens/shared';
import type { Executor } from '../db/types';
import { getSetting, setSettings } from '../db/repo/settings';
import type { CloudApi, CloudError, ShareLinkRow } from '../cloud/api';
import { PORTAL_URL } from '../cloud/client';
import { loadReportData, type Audience } from '../reports/data';

export const SHARE_VERSION = 1;
export type ShareDays = 7 | 30;

export interface NewShare {
  from: string; to: string; audience: Audience; days: ShareDays; noteIds: string[]; lang: Lang; now?: number;
  /** School only: just school-time hard moments (default on, BUGS #23). */
  schoolOnly?: boolean;
}

export const shareUrl = (token: string, portal = PORTAL_URL): string => `${portal.replace(/\/+$/, '')}/share/${token}`;

/** Builds the snapshot a share link shows: the same data as the PDF report for that range and audience. */
export async function shareSnapshot(ex: Executor, profile: ChildProfile, o: NewShare): Promise<Record<string, unknown>> {
  const data = await loadReportData(ex, profile, {
    from: o.from, to: o.to, audience: o.audience, noteIds: o.noteIds, lang: o.lang, now: o.now ?? Date.now(), pageSize: 'letter', schoolOnly: o.schoolOnly,
  });
  // A School report has no medications or sleep at all: leave the fields out, not just empty (SPEC 22.1).
  if (o.audience === 'school') {
    const { medications: _m, sleep: _s, ...rest } = data;
    return { version: SHARE_VERSION, ...rest };
  }
  return { version: SHARE_VERSION, ...data };
}

export async function createShareLink(ex: Executor, api: CloudApi, profile: ChildProfile, o: NewShare):
  Promise<{ id: string; url: string; expiresAt: string } | { error: CloudError }> {
  const snapshot = await shareSnapshot(ex, profile, o);
  const res = await api.call<{ id: string; token: string; expires_at: string }>('share-create', {
    child_id: profile.id, audience: o.audience, from: o.from, to: o.to, expires_in_days: o.days, snapshot,
  });
  if (res.error) return { error: res.error };
  const tokens = await getSetting(ex, 'share_tokens');
  await setSettings(ex, { share_tokens: { ...tokens, [res.data.id]: res.data.token } });
  return { id: res.data.id, url: shareUrl(res.data.token), expiresAt: res.data.expires_at };
}

export interface ShareLinkView extends ShareLinkRow { url: string | null; active: boolean; }

export async function listShareLinks(ex: Executor, api: CloudApi, childId: string, now = Date.now()): Promise<ShareLinkView[] | { error: CloudError }> {
  const res = await api.shareLinks(childId);
  if (res.error) return { error: res.error };
  const tokens = await getSetting(ex, 'share_tokens');
  return res.data.map((l) => ({
    ...l, url: tokens[l.id] ? shareUrl(tokens[l.id]) : null,
    active: l.revoked_at == null && Date.parse(l.expires_at) > now,
  }));
}

export async function revokeShareLink(ex: Executor, api: CloudApi, id: string): Promise<CloudError | null> {
  const res = await api.call<{ revoked: boolean }>('share-revoke', { id });
  if (res.error) return res.error;
  const tokens = { ...(await getSetting(ex, 'share_tokens')) };
  delete tokens[id];
  await setSettings(ex, { share_tokens: tokens });
  return null;
}
