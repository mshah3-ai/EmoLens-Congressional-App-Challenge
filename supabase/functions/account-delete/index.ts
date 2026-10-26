/**
 * account-delete (SPEC 7.4, 27.4): deletes everything the caller owns in the cloud and then the account itself.
 *  - children they own, with every row about them (the tables cascade from children);
 *  - their memberships in other families (they leave those teams);
 *  - their profile, AI usage, invites, share links and clinician notes (cascade from the auth user).
 * The phone deletes its local data afterwards.
 */
import { serveFunction } from '../_shared/handler.ts';
import { fail, json } from '../_shared/http.ts';

serveFunction('user', async ({ userId, admin, headers }) => {
  const steps = [
    () => admin.from('children').delete().eq('owner_id', userId!),
    () => admin.from('memberships').delete().eq('user_id', userId!),
    () => admin.from('ai_usage').delete().eq('user_id', userId!),
    () => admin.from('profiles').delete().eq('user_id', userId!),
  ];
  for (const step of steps) {
    const { error } = await step();
    if (error) return fail('server_error', 500, headers);
  }
  const { error } = await admin.auth.admin.deleteUser(userId!);
  if (error) return fail('server_error', 500, headers);
  return json({ deleted: true }, 200, headers);
});
