/**
 * ai-session-prep (SPEC 24.2): for clinicians only. The portal sends a summary of the synced data (nickname replaced
 * by [CHILD]); this returns a draft with four sections (`{draft}`) that the clinician reviews and edits. It is a
 * draft, never an assessment. The clinician role is checked here, on the server, with the admin client.
 */
import { checkSessionPrepRequest, answerText, sessionPrepParams } from '../_shared/ai.ts';
import { runAi } from '../_shared/aiHandler.ts';
import { hasRole, isUuid, serveFunction } from '../_shared/handler.ts';
import { fail, json } from '../_shared/http.ts';

serveFunction('user', async ({ userId, admin, body, headers }) => {
  const check = checkSessionPrepRequest(body);
  if (!check.ok) return fail(check.error, check.error === 'too_large' ? 413 : 400, headers);
  if (!isUuid(check.value.childId)) return fail('bad_request', 400, headers);
  if (!await hasRole(admin, check.value.childId, userId!, ['clinician'])) return fail('not_clinician', 403, headers);
  const r = await runAi(admin, userId!, headers, (model) => sessionPrepParams(check.value.summary, check.value.language, model));
  if (!r.ok) return r.response;
  if (r.message.stop_reason === 'refusal') return fail('ai_declined', 422, headers);
  const draft = answerText(r.message);
  return draft ? json({ draft }, 200, headers) : fail('ai_unavailable', 502, headers);
});
