/**
 * @jest-environment node
 * SPEC 28.3 + SPEC 1: every string the code asks for exists; English and Spanish are complete and use the same
 * placeholders; neither language uses words the product principles forbid.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import en from '@emolens/shared/i18n/en.json';
import es from '@emolens/shared/i18n/es.json';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(f) ? [p] : [];
  });
}

/** Keys written as t('a.b') and key prefixes written as t(`a.${x}`). */
function usedKeys(files: string[]): { exact: string[]; prefixes: string[] } {
  const exact = new Set<string>(), prefixes = new Set<string>();
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) exact.add(m[1]);
    for (const m of s.matchAll(/\bt\(\s*`([a-zA-Z0-9_.]+)\.\$\{/g)) prefixes.add(m[1]);
  }
  return { exact: [...exact], prefixes: [...prefixes] };
}

type Tree = { [k: string]: string | Tree };
function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v; else Object.assign(out, flatten(v, key));
  }
  return out;
}
const EN = flatten(en as Tree), ES = flatten(es as Tree);
const has = (flat: Record<string, string>, key: string) => key in flat || `${key}_one` in flat || `${key}_other` in flat;
const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

test('every key used in the code exists in English', () => {
  const root = join(__dirname, '..');
  // the report template lives in packages/reports (shared with the portal) but uses the app's strings
  const reports = join(root, '..', '..', 'packages', 'reports', 'src');
  const { exact, prefixes } = usedKeys([...sourceFiles(join(root, 'app')), ...sourceFiles(join(root, 'src')), ...sourceFiles(reports)]);
  expect(exact.length).toBeGreaterThan(300); // the scanner really found the keys
  const missing = exact.filter((k) => !has(EN, k));
  expect(missing).toEqual([]);
  for (const p of prefixes) expect(Object.keys(EN).some((k) => k.startsWith(`${p}.`))).toBe(true);
  for (const k of ['today.greetingMorning', 'today.greetingAfternoon', 'today.greetingEvening']) expect(has(EN, k)).toBe(true);
});

test('a plural-only string is always asked for with a count (otherwise the raw key shows)', () => {
  const root = join(__dirname, '..');
  const files = [...sourceFiles(join(root, 'app')), ...sourceFiles(join(root, 'src')), ...sourceFiles(join(root, '..', '..', 'packages', 'reports', 'src'))];
  const bad: string[] = [];
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'\s*(,\s*\{[^}]*\})?/g)) {
      const key = m[1];
      if (key in EN || !(`${key}_other` in EN)) continue;
      if (!/\bcount\b/.test(m[2] ?? '')) bad.push(`${f.split('/').slice(-2).join('/')}: ${key}`);
    }
  }
  expect(bad).toEqual([]);
});

test('Spanish has exactly the same keys and placeholders as English', () => {
  expect(Object.keys(ES).sort()).toEqual(Object.keys(EN).sort());
  for (const k of Object.keys(EN)) expect([k, placeholders(ES[k])]).toEqual([k, placeholders(EN[k])]);
});

test('language rules (SPEC 1): no forbidden words in either language', () => {
  const bannedEn = /\b(tantrums?|outbursts?|bad behaviou?r|acting out|naughty|punish\w*|consequences?|causes?|caused|proves?|guarantee\w*|will happen|patients?)\b/i;
  const bannedEs = /\b(rabietas?|berrinches?|mal comportamiento|castig\w*|causa\w*|garantiza\w*|pacientes?)\b/i;
  expect(Object.entries(EN).filter(([, v]) => bannedEn.test(v))).toEqual([]);
  expect(Object.entries(ES).filter(([, v]) => bannedEs.test(v))).toEqual([]);
});

test('no "(s)"-style plurals: counts use i18next plural keys in both languages', () => {
  const parenPlural = /\w\((s|es|as|os|a|o)\)/;
  expect(Object.entries(EN).filter(([, v]) => parenPlural.test(v))).toEqual([]);
  expect(Object.entries(ES).filter(([, v]) => parenPlural.test(v))).toEqual([]);
  // A string that shows {{count}} must be a plural form (key_one / key_other), so i18next can pick the right one.
  const countNotPlural = (flat: Record<string, string>) => Object.entries(flat).filter(([k, v]) => v.includes('{{count}}') && !/_(one|other)$/.test(k));
  expect(countNotPlural(EN)).toEqual([]);
  expect(countNotPlural(ES)).toEqual([]);
  for (const k of Object.keys(EN).filter((x) => x.endsWith('_one'))) expect(EN[k.replace(/_one$/, '_other')]).toBeDefined();
});

test('no app text is a note for the people who built it (2026-10-22 polish)', () => {
  type Tree = { [k: string]: string | Tree };
  const all = (t: Tree): string[] => Object.values(t).flatMap((v) => (typeof v === 'string' ? [v] : all(v)));
  const CREATOR = /(iOS Simulator|simulador de iOS|DECISIONS|Phase \d|coming update|próxima actualización|future version|Fitbit|τ|shrinkage|engine run|\d ms\b|\(soon\)|\(pronto\))/i;
  const hits = [...all(en as Tree), ...all(es as Tree)].filter((s) => CREATOR.test(s) || /\bSPEC\b/.test(s));
  expect(hits).toEqual([]);
});
