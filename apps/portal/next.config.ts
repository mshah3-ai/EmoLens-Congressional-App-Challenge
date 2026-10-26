/**
 * Next.js settings for the clinician portal. The shared EmoLens packages are TypeScript source, so Next compiles them
 * (transpilePackages). Security headers for every page (SPEC 24.4); the Content-Security-Policy is set per request in
 * proxy.ts because it carries a fresh random nonce each time.
 */
import type { NextConfig } from 'next';
import path from 'node:path';

const config: NextConfig = {
  transpilePackages: ['@emolens/reports', '@emolens/engine', '@emolens/shared'],
  poweredByHeader: false,
  turbopack: { root: path.join(process.cwd(), '..', '..') },
  outputFileTracingRoot: path.join(process.cwd(), '..', '..'),
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      ],
    }];
  },
};

export default config;
