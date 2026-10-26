/**
 * On-device speech-to-text with whisper.rn (SPEC 20.1 step 4): the recording never leaves the phone. One model is
 * loaded at a time and reused; it is released when another model is chosen.
 */
import { initWhisper, type WhisperContext } from 'whisper.rn/index';
import type { Lang } from '@emolens/shared';
import { modelFile, type ModelId } from './model';

let loaded: { id: ModelId; ctx: WhisperContext } | null = null;

async function contextFor(id: ModelId): Promise<WhisperContext> {
  if (loaded?.id === id) return loaded.ctx;
  if (loaded) { await loaded.ctx.release().catch(() => undefined); loaded = null; }
  const ctx = await initWhisper({ filePath: modelFile(id).uri });
  loaded = { id, ctx };
  return ctx;
}

/** The words in a 16 kHz mono WAV recording, in the app's language. `onProgress` gets 0..100. */
export async function transcribe(wavUri: string, id: ModelId, lang: Lang, onProgress?: (pct: number) => void): Promise<string> {
  const ctx = await contextFor(id);
  const { promise } = ctx.transcribe(wavUri, { language: lang, onProgress });
  const { result } = await promise;
  return result.replace(/\[(BLANK_AUDIO|MUSIC|NOISE)\]/gi, '').replace(/\s+/g, ' ').trim();
}
