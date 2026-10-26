/**
 * ai-ask (SPEC 19.2): one step of an Ask EmoLens conversation. The app sends the conversation so far (the nickname
 * already replaced by [CHILD]); this function adds the fixed system prompt and tool list, asks Claude once, and
 * returns `{content, stop_reason, model, usage}`. When Claude asks for a tool, the phone runs it on its own database and calls
 * again with the result: the data never has to live in the cloud.
 */
import { askParams, checkAskRequest, echoableContent } from '../_shared/ai.ts';
import { runAi } from '../_shared/aiHandler.ts';
import { serveFunction } from '../_shared/handler.ts';
import { fail, json } from '../_shared/http.ts';

serveFunction('user', async ({ userId, admin, body, headers }) => {
  const check = checkAskRequest(body);
  if (!check.ok) return fail(check.error, check.error === 'too_large' ? 413 : 400, headers);
  const r = await runAi(admin, userId!, headers, (model) => askParams(check.value, model, Date.now()));
  if (!r.ok) return r.response;
  const u = r.message.usage;
  // usage: token counts only (no content), so the app's live check can report what a question really costs
  return json({ content: echoableContent(r.message), stop_reason: r.message.stop_reason, model: r.message.model,
    usage: { input_tokens: u.input_tokens, output_tokens: u.output_tokens, cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0 } }, 200, headers);
});
