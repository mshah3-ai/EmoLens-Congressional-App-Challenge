// Builds the phone app's JavaScript bundle for iOS and Android exactly as a release would (`expo export`), into a
// temporary folder, then deletes it. Jest mocks the native libraries, so a Node-only import (e.g. `buffer`, `fs`,
// `crypto`) pulled in by a library can pass every test and still break the app with a red "Unable to resolve module"
// screen. This check fails in that case. Run: pnpm --filter @emolens/mobile bundle:check (also in CI).
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Node-only packages that must never be in the phone bundle (metro.config.js keeps safe-buffer out, DECISIONS #134).
const FORBIDDEN = ['/node_modules/safe-buffer/', '/node_modules/buffer/'];

const out = mkdtempSync(join(tmpdir(), 'emolens-bundle-'));
try {
  const run = (cmd, args) => {
    const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, CI: '1' } });
    if (r.status !== 0) {
      console.error(`\nbundle:check FAILED: \`${cmd} ${args.join(' ')}\` exited with ${r.status}. A module the phone can't load was imported (see the import stack above).`);
      process.exit(1);
    }
  };
  run('node', ['scripts/bundle-text.mjs']);
  run('npx', ['expo', 'export', '--platform', 'ios', '--platform', 'android', '--no-bytecode', '--source-maps', '--output-dir', out, '--clear']);

  let bundles = 0;
  for (const platform of ['ios', 'android']) {
    const dir = join(out, '_expo', 'static', 'js', platform);
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.map'))) {
      bundles++;
      const sources = JSON.parse(readFileSync(join(dir, f), 'utf8')).sources;
      const bad = sources.filter((s) => FORBIDDEN.some((p) => s.includes(p)));
      if (bad.length) {
        console.error(`\nbundle:check FAILED: Node-only modules in the ${platform} bundle:\n  ${bad.join('\n  ')}`);
        process.exit(1);
      }
      console.log(`bundle:check ${platform}: ${sources.length} modules, none Node-only`);
    }
  }
  if (bundles !== 2) {
    console.error(`bundle:check FAILED: expected an iOS and an Android bundle, found ${bundles}`);
    process.exit(1);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
