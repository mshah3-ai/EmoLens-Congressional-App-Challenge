/**
 * Voice-note recording settings (SPEC 20.1 step 2): 16 kHz, mono, 16-bit PCM in a WAV file, the format whisper.rn
 * reads. iOS records WAV directly. Android's recorder can't write WAV, so voice notes are iPhone-only for now
 * (DECISIONS #125); Android shows a message instead.
 */
import { Platform } from 'react-native';
import { AudioQuality, IOSOutputFormat, type RecordingOptions } from 'expo-audio';

export const MAX_RECORDING_MS = 3 * 60_000;

export const VOICE_RECORDING: RecordingOptions = {
  extension: '.wav',
  sampleRate: 16_000,
  numberOfChannels: 1,
  bitRate: 256_000,
  ios: { outputFormat: IOSOutputFormat.LINEARPCM, audioQuality: AudioQuality.HIGH, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
  android: { outputFormat: 'default', audioEncoder: 'default' },
  web: {},
};

export const voiceNotesSupported = (): boolean => Platform.OS === 'ios';
