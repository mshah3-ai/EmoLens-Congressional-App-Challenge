/** Limits that protect the edge functions (pure, so they are unit-tested without a database). */

/** invite-accept: at most this many wrong codes per person in one hour. */
export const INVITE_MAX_FAILURES = 10;
export const INVITE_WINDOW_MS = 60 * 60 * 1000;

/** True when a person with `failures` wrong tries in the last hour must wait before trying again. */
export function inviteLocked(failures: number): boolean {
  return failures >= INVITE_MAX_FAILURES;
}

/** Start of the window in which failures are counted. */
export function inviteWindowStart(now: number): string {
  return new Date(now - INVITE_WINDOW_MS).toISOString();
}

/** share-create: the snapshot may not be bigger than this (a 90-day report is far smaller). */
export const SHARE_MAX_BYTES = 2_000_000;
export const SHARE_DAYS = [7, 30] as const;

/** When a link made now for `days` days stops working. */
export function shareExpiry(now: number, days: number): string {
  return new Date(now + days * 86_400_000).toISOString();
}

/** A link works only before it expires and while it isn't revoked. */
export function shareUsable(link: { expires_at: string; revoked_at: string | null }, now: number): boolean {
  return link.revoked_at == null && Date.parse(link.expires_at) > now;
}

/** An invite can be used once, before it expires. */
export function inviteUsable(invite: { expires_at: string; accepted_at: string | null }, now: number): boolean {
  return invite.accepted_at == null && Date.parse(invite.expires_at) > now;
}
