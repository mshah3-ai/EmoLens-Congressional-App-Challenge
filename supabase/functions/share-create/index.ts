/**
 * share-create (SPEC 7.4, 24.3): the owner publishes a read-only report snapshot. Returns a random token once;
 * only its hash is stored. The link {PORTAL_URL}/share/{token} works for 7 or 30 days, until revoked.
 */
import { newShareToken, sha256Hex } from '../_shared/codes.ts';
import { isOwner, serveFunction } from '../_shared/handler.ts';
import { fail, json } from '../_shared/http.ts';
import { shareExpiry } from '../_shared/ratelimit.ts';
import { checkShareRequest } from '../_shared/share.ts';

serveFunction('user', async ({ userId, admin, body, headers }) => {
  const check = checkShareRequest(body);
  if (!check.ok) return fail(check.error, check.error === 'too_large' ? 413 : 400, headers);
  const r = check.value;
  if (!await isOwner(admin, r.childId, userId!)) return fail('not_owner', 403, headers);

  const token = newShareToken();
  const expiresAt = shareExpiry(Date.now(), r.days);
  const { data, error } = await admin.from('share_links').insert({
    child_id: r.childId, created_by: userId, token_hash: await sha256Hex(token), audience: r.audience,
    range_from: r.from, range_to: r.to, snapshot: r.snapshot, expires_at: expiresAt,
  }).select('id').single();
  if (error || !data) return fail('server_error', 500, headers);
  return json({ id: data.id, token, expires_at: expiresAt }, 200, headers);
});
