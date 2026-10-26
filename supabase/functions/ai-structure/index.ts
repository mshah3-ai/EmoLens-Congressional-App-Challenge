/**
 * ai-structure (SPEC 20.1, 20.2): a voice-note transcript or a school report's text → proposed log entries
 * (`{log}`, the record_structured_log shape). Nothing is saved here: the phone shows each proposal on a review screen
 * and saves only what the parent checks.
 */
import { checkStructureRequest, structureParams } from '../_shared/ai.ts';
import { runAi } from '../_shared/aiHandler.ts';
import { serveFunction } from '../_shared/handler.ts';
import { fail, json } from '../_shared/http.ts';

serveFunction('user', async ({ userId, admin, body, headers }) => {
  const check = checkStructureRequest(body);
  if (!check.ok) return fail(check.error, check.error === 'too_large' ? 413 : 400, headers);
  const r = await runAi(admin, userId!, headers, (model) => structureParams(check.value, model));
  if (!r.ok) return r.response;
  if (r.message.stop_reason === 'refusal') return fail('ai_declined', 422, headers);
  const text = r.message.content.find((b) => b.type === 'text');
  try {
    // structured outputs: the text is JSON in the schema's shape (the phone checks it again before showing it)
    return json({ log: JSON.parse(text && text.type === 'text' ? text.text : '') }, 200, headers);
  } catch {
    return fail('ai_unavailable', 502, headers); // cut off (max_tokens) or empty
  }
});
