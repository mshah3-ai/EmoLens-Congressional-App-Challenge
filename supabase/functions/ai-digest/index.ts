/**
 * ai-digest (SPEC 21): the week's statistics (numbers only, nickname already replaced) → a 120-180 word summary
 * for the parent (`{narrative}`). Without AI the phone uses its template sentences instead.
 */
import { answerText, checkDigestRequest, digestParams } from '../_shared/ai.ts';
import { runAi } from '../_shared/aiHandler.ts';
import { serveFunction } from '../_shared/handler.ts';
import { fail, json } from '../_shared/http.ts';

serveFunction('user', async ({ userId, admin, body, headers }) => {
  const check = checkDigestRequest(body);
  if (!check.ok) return fail(check.error, check.error === 'too_large' ? 413 : 400, headers);
  const r = await runAi(admin, userId!, headers, (model) => digestParams(check.value.stats, check.value.language, model));
  if (!r.ok) return r.response;
  if (r.message.stop_reason === 'refusal') return fail('ai_declined', 422, headers);
  const narrative = answerText(r.message);
  return narrative ? json({ narrative }, 200, headers) : fail('ai_unavailable', 502, headers);
});
