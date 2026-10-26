/**
 * share-view (SPEC 7.4, 24.3): the public share page asks for a snapshot by its token. No sign-in needed: the long
 * random token is the key. An unknown, expired or revoked token all get the same answer ("unavailable"), so the
 * response never reveals whether a link ever existed.
 */
import { isShareToken, sha256Hex } from '../_shared/codes.ts';
import { serveFunction } from '../_shared/handler.ts';
import { fail, json } from '../_shared/http.ts';
import { shareUsable } from '../_shared/ratelimit.ts';

serveFunction('none', async ({ admin, body, headers }) => {
  if (!isShareToken(body.token)) return fail('unavailable', 404, headers);
  const { data: link } = await admin.from('share_links').select('snapshot, audience, expires_at, revoked_at')
    .eq('token_hash', await sha256Hex(body.token)).maybeSingle();
  if (!link || !shareUsable(link, Date.now())) return fail('unavailable', 404, headers);
  return json({ snapshot: link.snapshot, audience: link.audience, expires_at: link.expires_at }, 200, headers);
});
