/**
 * The speech-to-text model files (SPEC 20.1 step 3). On first use the app downloads one Whisper model from the
 * official whisper.cpp repository on Hugging Face, checks its SHA-256 fingerprint against the published one (so a
 * damaged or swapped file is never used), and keeps it in the app's documents folder under models/.
 *
 * English uses the English-only models (smaller and more accurate for English). Spanish needs the multilingual
 * models, because "tiny.en" only understands English (DECISIONS #124). The fingerprints and sizes below are the ones
 * Hugging Face publishes for these files (read 2026-10-08).
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import type { Lang } from '@emolens/shared';

export type ModelId = 'tiny.en' | 'tiny' | 'base.en' | 'base';

export const MODELS: Record<ModelId, { file: string; sha256: string; bytes: number }> = {
  'tiny.en': { file: 'ggml-tiny.en.bin', sha256: '921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f', bytes: 77_704_715 },
  tiny: { file: 'ggml-tiny.bin', sha256: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21', bytes: 77_691_713 },
  'base.en': { file: 'ggml-base.en.bin', sha256: 'a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002', bytes: 147_964_211 },
  base: { file: 'ggml-base.bin', sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe', bytes: 147_951_465 },
};

const REPO_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';

/** The model for the chosen size (Settings → AI features) and the app's language. */
export function modelFor(size: 'tiny' | 'base', lang: Lang): ModelId {
  return lang === 'en' ? `${size}.en` : size;
}

const modelsDir = () => new Directory(Paths.document, 'models');
export const modelFile = (id: ModelId) => new File(modelsDir(), MODELS[id].file);

/** Downloaded and complete (the fingerprint was checked when it was downloaded). */
export function isModelReady(id: ModelId): boolean {
  const f = modelFile(id);
  return f.exists && f.size === MODELS[id].bytes;
}

export const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export class ModelChecksumError extends Error {}

/** Downloads a model, checks its SHA-256 and only then puts it in place. `onProgress` gets 0..1. */
export async function downloadModel(id: ModelId, onProgress: (share: number) => void, signal?: AbortSignal): Promise<void> {
  const dir = modelsDir();
  if (!dir.exists) dir.create({ intermediates: true });
  const part = new File(dir, `${MODELS[id].file}.part`);
  if (part.exists) part.delete();
  await File.downloadFileAsync(REPO_URL + MODELS[id].file, part, {
    idempotent: true, signal,
    onProgress: ({ bytesWritten, totalBytes }) => onProgress(Math.min(1, bytesWritten / (totalBytes > 0 ? totalBytes : MODELS[id].bytes))),
  });
  const hash = toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await part.bytes()));
  if (hash !== MODELS[id].sha256) {
    part.delete();
    throw new ModelChecksumError('model checksum mismatch');
  }
  const final = modelFile(id);
  if (final.exists) final.delete();
  part.move(final);
}

/** "Delete all data" (SPEC 27.4) also removes the downloaded models and any kept voice recordings. */
export function deleteVoiceFiles(): void {
  for (const name of ['models', 'voice']) {
    try {
      const d = new Directory(Paths.document, name);
      if (d.exists) d.delete();
    } catch { /* nothing to delete */ }
  }
}

/** Where kept voice recordings live ("Keep audio for this note"). */
export const voiceDir = () => new Directory(Paths.document, 'voice');
