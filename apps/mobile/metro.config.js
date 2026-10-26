// Metro (the bundler that builds the phone app's JavaScript): Expo's default settings plus one rule.
//
// whisper.rn (voice notes) imports the Node package `safe-buffer`, which needs Node's `buffer` module. React Native
// has no `buffer`, so the bundle failed ("Unable to resolve module buffer"). whisper.rn only uses Buffer to decode
// base64 audio for transcribeData()/detectVoice(); EmoLens always passes a WAV file path to transcribe(). So instead
// of adding a Node polyfill to the app, `safe-buffer` is pointed at src/shims/safeBuffer.ts, which throws a clear
// error if that base64 path is ever used (DECISIONS #134). `pnpm --filter @emolens/mobile bundle:check` (in CI)
// fails if any Node-only import reaches the app again.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const SHIMS = { 'safe-buffer': path.resolve(__dirname, 'src/shims/safeBuffer.ts') };
const previous = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const shim = SHIMS[moduleName];
  if (shim) return { type: 'sourceFile', filePath: shim };
  return (previous ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
