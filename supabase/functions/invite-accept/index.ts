/**
 * invite-accept (SPEC 7.4, 23.2): someone types an invite code and joins the child's care team with the invite's
 * role. A removed member can come back with a new code. Wrong codes are counted: after 10 in an hour the person must
 * wait (so codes can't be guessed by trying many).
 */
import { normalizeInviteCode, sha256Hex } from '../_shared/codes.ts';
import { serveFunction } from '../_shared/handler.ts';
import { fail, json } from '../_shared/http.ts';
import { inviteLocked, inviteUsable, inviteWindowStart } from '../_shared/ratelimit.ts';

serveFunction('user', async ({ userId, admin, body, headers }) => {
  const now = Date.now();
  const { count, error: countError } = await admin.from('invite_attempts').select('*', { count: 'exact', head: true })
    .eq('user_id', userId!).gte('at', inviteWindowStart(now));
  if (countError) return fail('server_error', 500, headers);
  if (inviteLocked(count ?? 0)) return fail('too_many_tries', 429, headers);

  const wrong = async (code: 'not_found' | 'expired', status: number) => {
    await admin.from('invite_attempts').insert({ user_id: userId });
    return fail(code, status, headers);
  };
  const code = normalizeInviteCode(body.code);
  if (!code) return wrong('not_found', 404);
  const { data: invite } = await admin.from('invites').select('id, child_id, role, expires_at, accepted_at')
    .eq('code_hash', await sha256Hex(code)).maybeSingle();
  if (!invite) return wrong('not_found', 404);
  if (!inviteUsable(invite, now)) return wrong('expired', 410);

  const { data: existing } = await admin.from('memberships').select('role, status')
    .eq('child_id', invite.child_id).eq('user_id', userId!).maybeSingle();
  if (existing?.status === 'active') return fail('already_member', 409, headers);

  // Use the code (only if nobody else just used it), then add the membership.
  const { data: used } = await admin.from('invites').update({ accepted_by: userId, accepted_at: new Date(now).toISOString() })
    .eq('id', invite.id).is('accepted_at', null).select('id');
  if (!used?.length) return wrong('expired', 410);
  const { error } = await admin.from('memberships').upsert(
    { child_id: invite.child_id, user_id: userId, role: invite.role, status: 'active' }, { onConflict: 'child_id,user_id' });
  if (error) return fail('server_error', 500, headers);

  const { data: child } = await admin.from('children').select('nickname').eq('id', invite.child_id).single();
  return json({ child_id: invite.child_id, role: invite.role, nickname: child?.nickname ?? null }, 200, headers);
});
