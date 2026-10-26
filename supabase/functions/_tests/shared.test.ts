/**
 * Unit tests of the edge functions' pure helpers (SPEC 30.3: invite codes, rate limiting, share-token hashing),
 * run with `deno test`. No database or network needed.
 */
import { assert, assertEquals, assertFalse, assertMatch, assertNotEquals } from 'jsr:@std/assert@1';
import {
  INVITE_ALPHABET, INVITE_LENGTH, base64url, isShareToken, newInviteCode, newShareToken, normalizeInviteCode, sha256Hex,
} from '../_shared/codes.ts';
import { allowedOrigin } from '../_shared/http.ts';
import { INVITE_MAX_FAILURES, inviteLocked, inviteUsable, shareExpiry, shareUsable } from '../_shared/ratelimit.ts';
import { checkShareRequest, schoolSafe } from '../_shared/share.ts';

Deno.test('invite codes: 8 characters from the alphabet without look-alikes', () => {
  for (const ch of '01ILO') assertFalse(INVITE_ALPHABET.includes(ch), ch);
  for (let i = 0; i < 500; i++) {
    const c = newInviteCode();
    assertEquals(c.length, INVITE_LENGTH);
    for (const ch of c) assert(INVITE_ALPHABET.includes(ch));
  }
});

Deno.test('invite codes: every character is about equally likely (no modulo bias)', () => {
  const counts = new Map<string, number>();
  const n = 4000;
  for (let i = 0; i < n; i++) for (const ch of newInviteCode()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  const expected = (n * INVITE_LENGTH) / INVITE_ALPHABET.length;
  assertEquals(counts.size, INVITE_ALPHABET.length);
  for (const [ch, k] of counts) assert(Math.abs(k - expected) < expected * 0.15, `${ch}: ${k} vs ${expected}`);
});

Deno.test('invite codes: bytes that would bias the result are skipped', () => {
  // 248..255 would favour the first 8 characters, so they are thrown away; 0 -> 'A', 30 -> '9'
  const bytes = [255, 248, 0, 30, 31, 249, 1, 2, 3, 4, 5, 6];
  let i = 0;
  const code = newInviteCode((n) => Uint8Array.from({ length: n }, () => bytes[i++ % bytes.length]));
  assertEquals(code, 'A9ABCDEF');
});

Deno.test('invite codes: what people type is cleaned up; anything else is rejected', () => {
  assertEquals(normalizeInviteCode('abcd-2345'), 'ABCD2345');
  assertEquals(normalizeInviteCode(' AB CD 23 45 '), 'ABCD2345');
  assertEquals(normalizeInviteCode('ABCD234'), null);       // too short
  assertEquals(normalizeInviteCode('ABCD23450'), null);     // too long
  assertEquals(normalizeInviteCode('ABCD2341'), null);      // 1 is never used
  assertEquals(normalizeInviteCode('ABCDO345'), null);      // O is never used
  assertEquals(normalizeInviteCode(12345678), null);
  assertEquals(normalizeInviteCode('A'.repeat(100)), null);
});

Deno.test('share tokens: 32 random bytes as 43 base64url characters, all different', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const t = newShareToken();
    assert(isShareToken(t));
    assertMatch(t, /^[A-Za-z0-9_-]{43}$/);
    seen.add(t);
  }
  assertEquals(seen.size, 200);
  assertFalse(isShareToken('short'));
  assertFalse(isShareToken(`${'a'.repeat(42)}=`));
  assertEquals(base64url(new Uint8Array([251, 255])), '-_8');
});

Deno.test('hashing: SHA-256 hex matches a known value, and different inputs differ', async () => {
  assertEquals(await sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assertNotEquals(await sha256Hex('ABCD2345'), await sha256Hex('ABCD2346'));
});

Deno.test('rate limit: the 10th wrong code in an hour locks further tries', () => {
  assertEquals(INVITE_MAX_FAILURES, 10);
  assertFalse(inviteLocked(9));
  assert(inviteLocked(10));
});

Deno.test('invites and links: usable only before expiry, once, and until revoked', () => {
  const now = Date.parse('2026-09-30T12:00:00Z');
  assert(inviteUsable({ expires_at: '2026-10-01T00:00:00Z', accepted_at: null }, now));
  assertFalse(inviteUsable({ expires_at: '2026-09-30T11:59:59Z', accepted_at: null }, now));
  assertFalse(inviteUsable({ expires_at: '2026-10-01T00:00:00Z', accepted_at: '2026-09-30T10:00:00Z' }, now));
  assertEquals(shareExpiry(now, 7), '2026-10-07T12:00:00.000Z');
  assert(shareUsable({ expires_at: shareExpiry(now, 30), revoked_at: null }, now));
  assertFalse(shareUsable({ expires_at: shareExpiry(now, 30), revoked_at: '2026-09-30T11:00:00Z' }, now));
  assertFalse(shareUsable({ expires_at: '2026-09-30T12:00:00Z', revoked_at: null }, now));
});

Deno.test('CORS: only the portal (and a local development portal) may call from a browser', () => {
  const portal = 'https://emolens-portal.vercel.app';
  assertEquals(allowedOrigin('https://emolens-portal.vercel.app', portal), portal);
  assertEquals(allowedOrigin('http://localhost:3000', portal), 'http://localhost:3000');
  assertEquals(allowedOrigin('https://evil.example', portal), null);
  assertEquals(allowedOrigin('https://emolens-portal.vercel.app.evil.example', portal), null);
  assertEquals(allowedOrigin(null, portal), null);
  assertEquals(allowedOrigin('https://x.example', 'not a url'), null);
});

Deno.test('share-create checks: shape, range, expiry choice, size, and School privacy', () => {
  const child = '0190a5e2-0000-7000-8000-000000000001';
  const snap = { audience: 'school', from: '2026-09-01', to: '2026-09-30', medications: null, sleep: null, episodes: [{ placeLabel: null, placeType: null }] };
  const ok = { child_id: child, audience: 'school', from: '2026-09-01', to: '2026-09-30', expires_in_days: 7, snapshot: snap };
  const r = checkShareRequest(ok);
  assert(r.ok);
  for (const bad of [
    { ...ok, child_id: 'x' }, { ...ok, audience: 'teacher' }, { ...ok, from: '2026-10-01' }, { ...ok, expires_in_days: 14 },
    { ...ok, snapshot: [] }, { ...ok, snapshot: { ...snap, audience: 'family' } },
    { ...ok, snapshot: { ...snap, medications: { list: [] } } }, { ...ok, snapshot: { ...snap, sleep: {} } },
    { ...ok, snapshot: { ...snap, episodes: [{ placeLabel: "Grandma's", placeType: 'relative' }] } },
    { ...ok, snapshot: { ...snap, watch: [{ kind: 'medication', label: 'Medication A' }] } },
    { ...ok, snapshot: { ...snap, watch: [{ kind: 'place', label: "Grandma's" }] } },
    { ...ok, snapshot: { ...snap, patterns: [{ key: 'sleep_deficit' }] } },
    { ...ok, snapshot: { ...snap, patterns: [{ key: 'place_therapy_medical' }] } },
  ]) assertEquals(checkShareRequest(bad).ok, false, JSON.stringify(bad).slice(0, 80));
  const huge = checkShareRequest({ ...ok, snapshot: { ...snap, notes: 'x'.repeat(2_100_000) } });
  assertEquals(huge, { ok: false, error: 'too_large' });
  // clinician and family snapshots may include medications and sleep
  assert(checkShareRequest({ ...ok, audience: 'clinician', snapshot: { ...snap, audience: 'clinician', medications: { list: [] } } }).ok);
  assert(schoolSafe({ medications: null, sleep: null, episodes: [] }));
  assert(schoolSafe({ episodes: [], watch: [{ kind: 'food', label: 'Juice' }], patterns: [{ key: 'planned_transitions' }] }));
});
