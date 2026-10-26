/**
 * invite-create (SPEC 7.4, 23.2): the child's owner asks for an invite code for a caregiver, teacher or clinician.
 * Returns the 8-character code once; only its SHA-256 hash is stored. The code works once, for 7 days.
 */
import { INVITE_DAYS, newInviteCode, sha256Hex } from '../_shared/codes.ts';
import { isOwner, isUuid, serveFunction } from '../_shared/handler.ts';
import { fail, json } from '../_shared/http.ts';

serveFunction('user', async ({ userId, admin, body, headers }) => {
  const { child_id, role } = body;
  if (!isUuid(child_id) || (role !== 'caregiver' && role !== 'teacher' && role !== 'clinician')) return fail('bad_request', 400, headers);
  if (!await isOwner(admin, child_id, userId!)) return fail('not_owner', 403, headers);

  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString();
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newInviteCode();
    const { error } = await admin.from('invites').insert({
      child_id, role, code_hash: await sha256Hex(code), expires_at: expiresAt, created_by: userId,
    });
    if (!error) return json({ code, role, expires_at: expiresAt }, 200, headers);
    if (error.code !== '23505') break; // 23505 = the same code already exists (astronomically rare): try another
  }
  return fail('server_error', 500, headers);
});
