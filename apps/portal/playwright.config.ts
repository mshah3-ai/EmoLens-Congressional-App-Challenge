/**
 * Portal smoke tests (SPEC 30.3) against the LOCAL Supabase (`supabase start`). The portal is started with the local
 * stack's address and publishable key; test people sign in with emailed codes read from Mailpit.
 */
import { defineConfig } from '@playwright/test';
import { localEnv } from '../../supabase/tests/integration/local';

const env = localEnv();
const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 1,
  globalSetup: './e2e/setup.ts',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_PUBLIC_SUPABASE_URL: env.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.publishableKey },
  },
});
