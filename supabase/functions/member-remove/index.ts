/**
 * member-remove (SPEC 9.8, 27.4): the owner removes someone from the care team. Their access ends immediately
 * (row-level security only counts active members); their app deletes its copy at the next sync.
 * Not in SPEC 7.4's list: memberships may only be changed by edge functions (DECISIONS).
 */
import { isOwner, isUuid, serveFunction } from '../_shared/handler.ts';
import { fail, json } from '../_shared/http.ts';

serveFunction('user', async ({ userId, admin, body, headers }) => {
  const { child_id, user_id } = body;
  if (!isUuid(child_id) || !isUuid(user_id)) return fail('bad_request', 400, headers);
  if (!await isOwner(admin, child_id, userId!)) return fail('not_owner', 403, headers);
  if (user_id === userId) return fail('bad_request', 400, headers); // the owner can't remove themselves
  const { data, error } = await admin.from('memberships').update({ status: 'removed' })
    .eq('child_id', child_id).eq('user_id', user_id).neq('role', 'owner').select('user_id');
  if (error) return fail('server_error', 500, headers);
  if (!data?.length) return fail('not_found', 404, headers);
  return json({ removed: true }, 200, headers);
});
