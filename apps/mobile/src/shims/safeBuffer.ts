/**
 * Stands in for the Node package `safe-buffer` in the phone app (metro.config.js, DECISIONS #134).
 * whisper.rn imports it only to decode base64 audio in transcribeData() / detectVoice(), which EmoLens never calls:
 * voice notes are transcribed from a WAV file path. If someone starts using those base64 calls, this fails loudly
 * instead of silently, and the right fix is to pass an ArrayBuffer (which needs no Buffer at all).
 */
function unsupported(): never {
  throw new Error('Buffer is not available in the EmoLens app: pass whisper.rn a file path or an ArrayBuffer, not base64.');
}

export const Buffer = { from: unsupported, alloc: unsupported, allocUnsafe: unsupported, isBuffer: () => false };
