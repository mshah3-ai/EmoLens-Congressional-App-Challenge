/**
 * Invite codes and share-link tokens (SPEC 7.4). Pure functions using only the Web Crypto API, so they run the same
 * in Supabase's edge runtime (Deno) and in the unit tests.
 *
 * - Invite code: 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L), e.g. "ABCD2345". 31^8 is about
 *   850 billion codes, a code expires after 7 days, and invite-accept allows only 10 wrong tries per hour, so guessing
 *   one is hopeless.
 * - Share token: 32 random bytes as base64url (43 characters), too long to guess at all.
 * - Only the SHA-256 hash of a code or token is stored, so someone who could read the database still couldn't use it.
 */

/** A-Z and 2-9 without the ambiguous I, L, O (and 0, 1). */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_LENGTH = 8;
export const INVITE_DAYS = 7;

/**
 * A random invite code. Each character comes from one random byte; bytes that would make some characters more
 * likely than others (the top 8 of 256, since 256 = 8 x 31 + 8) are thrown away and drawn again ("rejection
 * sampling"), so every character is equally likely.
 */
export function newInviteCode(random: (n: number) => Uint8Array = randomBytes): string {
  const limit = 256 - (256 % INVITE_ALPHABET.length);
  let code = '';
  while (code.length < INVITE_LENGTH) {
    for (const b of random(INVITE_LENGTH * 2)) {
      if (b >= limit) continue;
      code += INVITE_ALPHABET[b % INVITE_ALPHABET.length];
      if (code.length === INVITE_LENGTH) break;
    }
  }
  return code;
}

/**
 * What the person typed, cleaned up: upper case, without spaces or dashes ("abcd-2345" -> "ABCD2345").
 * Returns null when it can't be a code (wrong length or a character that is never used).
 */
export function normalizeInviteCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 40) return null;
  const code = input.toUpperCase().replace(/[\s-]/g, '');
  if (code.length !== INVITE_LENGTH) return null;
  for (const ch of code) if (!INVITE_ALPHABET.includes(ch)) return null;
  return code;
}

/** 32 random bytes as base64url (no padding): the secret part of a share link. */
export function newShareToken(random: (n: number) => Uint8Array = randomBytes): string {
  return base64url(random(32));
}

/** A share token has exactly 43 base64url characters. */
export function isShareToken(input: unknown): input is string {
  return typeof input === 'string' && /^[A-Za-z0-9_-]{43}$/.test(input);
}

/** SHA-256 as lowercase hex. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}
