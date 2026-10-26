/**
 * share-revoke (SPEC 24.3): the owner switches a share link off for good. Not in SPEC 7.4's list: share links may
 * only be changed by edge functions (DECISIONS).
 */
import { isOwner, isUuid, serveFunction } from '../_shared/handler.ts';
import { fail, json } from '../_shared/http.ts';

serveFunction('user', async ({ userId, admin, body, headers }) => {
  const { id } = body;
  if (!isUuid(id)) return fail('bad_request', 400, headers);
  const { data: link } = await admin.from('share_links').select('child_id, revoked_at').eq('id', id).maybeSingle();
  if (!link) return fail('not_found', 404, headers);
  if (!await isOwner(admin, link.child_id, userId!)) return fail('not_owner', 403, headers);
  if (!link.revoked_at) {
    const { error } = await admin.from('share_links').update({ revoked_at: new Date().toISOString() }).eq('id', id);
    if (error) return fail('server_error', 500, headers);
  }
  return json({ revoked: true }, 200, headers);
});
