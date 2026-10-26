/**
 * SPEC 24.4: the portal must never hold the Supabase secret (service role) key. Fails lint if the portal's code or
 * settings mention a secret-key variable or contain a secret key.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const skip = new Set(['node_modules', '.next', 'playwright-report', 'test-results', 'scripts', 'e2e']);
const bad = [/SERVICE_ROLE/i, /SUPABASE_SECRET/i, /sb_secret_/];
const problems = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skip.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!/\.(ts|tsx|js|mjs|json|env|local|example)$/.test(name) && !name.startsWith('.env')) continue;
    const text = readFileSync(p, 'utf8');
    for (const re of bad) if (re.test(text)) problems.push(`${relative(root, p)}: ${re}`);
  }
}
walk(root);
if (problems.length) {
  console.error('The portal must never contain the Supabase secret key:\n' + problems.join('\n'));
  process.exit(1);
}
