/**
 * The app finds its Supabase project through two EXPO_PUBLIC_ values in apps/mobile/.env, which Expo bakes into the
 * JavaScript bundle when Metro starts. Without them, More → Account says "This copy of EmoLens isn't connected to a
 * server yet". These tests check:
 *  - the app reads the same names that .env.example tells you to fill in, and needs both of them;
 *  - app.config.ts passes the values on, and app.json's empty placeholders don't override them;
 *  - on this computer, apps/mobile/.env (read the way Expo CLI reads it) has a URL and the publishable key. A fresh
 *    checkout (CI) has no .env, because .env is never committed, so that test only runs locally.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

type ExpoEnv = {
  parseEnv: (contents: string) => Record<string, string>;
  parseProjectEnv: (root: string, o: { mode: string; silent: boolean }) => { env: Record<string, string>; files: string[] };
};
// The same .env loader Expo CLI uses (a dependency of the expo package, so it is resolved from there).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const expoEnv = require(require.resolve('@expo/env', { paths: [dirname(require.resolve('expo/package.json'))] })) as ExpoEnv;

const ROOT = join(__dirname, '..');
const URL_NAME = 'EXPO_PUBLIC_SUPABASE_URL';
const KEY_NAME = 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY';
const NAMES = [URL_NAME, KEY_NAME, 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_PORTAL_URL'];
const systemEnv = { ...process.env }; // the Terminal's own values, which win over .env (Expo never overrides them)

afterEach(() => {
  for (const n of NAMES) {
    if (systemEnv[n] === undefined) delete process.env[n];
    else process.env[n] = systemEnv[n];
  }
});

/** Loads src/cloud/client.ts fresh with only these EXPO_PUBLIC_ values set. */
function cloudConfiguredWith(env: Record<string, string>): boolean {
  for (const n of NAMES) delete process.env[n];
  Object.assign(process.env, env);
  let configured = false;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    configured = (require('../src/cloud/client') as typeof import('../src/cloud/client')).cloudConfigured();
  });
  return configured;
}

test('.env.example lists the two names the app reads', () => {
  const example = expoEnv.parseEnv(readFileSync(join(ROOT, '.env.example'), 'utf8'));
  expect(Object.keys(example)).toEqual(expect.arrayContaining([URL_NAME, KEY_NAME]));
});

test('the app is connected only when both the Supabase URL and the publishable key are set', () => {
  const url = 'http://127.0.0.1:54321';
  expect(cloudConfiguredWith({ [URL_NAME]: url, [KEY_NAME]: 'sb_publishable_test' })).toBe(true);
  expect(cloudConfiguredWith({ [KEY_NAME]: 'sb_publishable_test' })).toBe(false); // URL missing
  expect(cloudConfiguredWith({ [URL_NAME]: url })).toBe(false); // key missing
  expect(cloudConfiguredWith({ [URL_NAME]: '', [KEY_NAME]: '' })).toBe(false); // names present, values empty
  expect(cloudConfiguredWith({ [URL_NAME]: url, EXPO_PUBLIC_SUPABASE_ANON_KEY: 'old-name' })).toBe(true); // SPEC 5's name
});

test('app.config.ts passes the .env values on; app.json\'s empty placeholders do not override them', () => {
  const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')) as { expo: ExpoConfig };
  process.env[URL_NAME] = 'http://127.0.0.1:54321';
  process.env.EXPO_PUBLIC_PORTAL_URL = 'http://localhost:3000';
  let make: (c: ConfigContext) => ExpoConfig = () => { throw new Error('app.config.ts did not load'); };
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    make = (require('../app.config') as { default: typeof make }).default;
  });
  const out = make({ config: appJson.expo, projectRoot: ROOT, staticConfigPath: join(ROOT, 'app.json'), packageJsonPath: join(ROOT, 'package.json') });
  expect(out.extra?.supabaseUrl).toBe('http://127.0.0.1:54321');
  expect(out.extra?.portalUrl).toBe('http://localhost:3000');
  expect(out.extra?.eas?.projectId).toBe(appJson.expo.extra?.eas?.projectId); // EAS's id survives
});

// Not in CI: a fresh checkout has no .env (it's never committed).
(process.env.CI ? describe.skip : describe)('this computer\'s apps/mobile/.env', () => {
  test('has the Supabase URL and the publishable key (not the secret key)', () => {
    if (!existsSync(join(ROOT, '.env'))) {
      throw new Error('apps/mobile/.env is missing. Copy .env.example to .env and fill in the Supabase URL and publishable key (`supabase status` for the local ones), then `pnpm start --clear`.');
    }
    const { env } = expoEnv.parseProjectEnv(ROOT, { mode: 'development', silent: true });
    // Expo never overrides a value already set in the Terminal, even an empty one.
    const value = (n: string) => (systemEnv[n] !== undefined ? systemEnv[n] : env[n]) ?? '';
    const url = value(URL_NAME);
    const key = value(KEY_NAME) || value('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    if (!/^https?:\/\/\S+$/.test(url)) {
      throw new Error(`${URL_NAME} is missing or not a web address in apps/mobile/.env (or overridden by the Terminal). Got: "${url}"`);
    }
    if (!key) throw new Error(`${KEY_NAME} is missing or empty in apps/mobile/.env (or overridden by the Terminal).`);
    // The secret key must never be in the app (SPEC 5): it starts sb_secret_, or is the old service_role token.
    expect(key.startsWith('sb_secret_')).toBe(false);
    expect(key.split('.').length === 3 && Buffer.from(key.split('.')[1] ?? '', 'base64').toString().includes('service_role')).toBe(false);
  });
});
