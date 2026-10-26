/**
 * Spanish pass (SPEC 28.3, Phase 10): the main screens, rendered in Spanish on the Spanish demo family, show no English
 * string, no raw i18n key and no English filler words, in their text or in their screen-reader labels.
 */
import { act, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import en from '@emolens/shared/i18n/en.json';
import es from '@emolens/shared/i18n/es.json';
import { setLanguage } from '../src/i18n';
import { buildDemo } from '../src/demo/build';
import { setSettings } from '../src/db/repo/settings';
import { useSession } from '../src/store/session';
import Today from '../app/(tabs)/index';
import Insights from '../app/(tabs)/insights/index';
import ModelHealth from '../app/(tabs)/insights/model-health';
import Strategies from '../app/(tabs)/insights/strategies';
import Timeline from '../app/(tabs)/timeline';
import Team from '../app/(tabs)/team/index';
import Reports from '../app/reports/index';
import EpisodeSheet from '../app/log/episode';
import Invite from '../app/team/invite';
import { testRepo } from './nodeDb';

jest.setTimeout(180_000);
jest.mock('../src/forecast', () => ({ ...jest.requireActual('../src/forecast'), requestForecast: jest.fn() }));

type Tree = { [k: string]: string | Tree };
const flatten = (tree: Tree, prefix = ''): Record<string, string> => Object.entries(tree).reduce<Record<string, string>>((out, [k, v]) => {
  const key = prefix ? `${prefix}.${k}` : k;
  return typeof v === 'string' ? { ...out, [key]: v } : { ...out, ...flatten(v, key) };
}, {});
const EN = flatten(en as Tree), ES = flatten(es as Tree);
/** English strings that differ in Spanish and are long enough to be words (not "OK", "dB" or a number). */
const ENGLISH = new Set(Object.keys(EN).filter((k) => EN[k] !== ES[k] && !EN[k].includes('{{') && /[a-z]{3}/i.test(EN[k])).map((k) => EN[k]));
const KEY = /^[a-z][a-zA-Z]+(\.[a-zA-Z0-9_]+)+$/;
const FILLER = /\b(the|and|your|with|today|hard moments?)\b/i;

type Node = { props?: Record<string, unknown>; children?: (Node | string)[] | null };
function strings(node: Node | Node[] | null, out: string[] = []): string[] {
  if (!node) return out;
  if (Array.isArray(node)) { node.forEach((n) => strings(n, out)); return out; }
  for (const p of ['accessibilityLabel', 'accessibilityHint', 'placeholder'] as const) {
    const v = node.props?.[p];
    if (typeof v === 'string') out.push(v);
  }
  for (const c of node.children ?? []) { if (typeof c === 'string') out.push(c); else strings(c, out); }
  return out;
}
const englishIn = (texts: string[]) => texts.map((s) => s.trim()).filter((s) => s && (ENGLISH.has(s) || KEY.test(s) || FILLER.test(s)));

beforeAll(async () => {
  const repo = await testRepo();
  await buildDemo(repo, { lang: 'es', tz: 'America/Chicago', days: 30, yieldToUi: false });
  await setSettings(repo.db, { language: 'es', simulated_sources: false, demo_info: null });
  await useSession.getState().useRepoForTests(repo);
  await act(async () => { setLanguage('es'); });
});
afterAll(async () => { await act(async () => { setLanguage('en'); }); });

const SCREENS: [string, () => React.JSX.Element][] = [
  ['Today', Today], ['Insights', Insights], ['Model Health', ModelHealth], ['Strategies', Strategies], ['Timeline', Timeline],
  ['Team', Team], ['Reports', Reports], ['Log a hard moment', EpisodeSheet], ['Invite', Invite],
];

test.each(SCREENS)('%s has no English in Spanish', async (_name, Screen) => {
  await renderRouter({ index: Screen }, { initialUrl: '/' });
  // let the screen load its data
  await waitFor(() => expect(strings(screen.toJSON() as Node | Node[] | null).length).toBeGreaterThan(3));
  const texts = strings(screen.toJSON() as Node | Node[] | null);
  expect(texts.length).toBeGreaterThan(3);
  expect(englishIn(texts)).toEqual([]);
});

test('the checker really catches English', () => {
  expect(englishIn(['Hard moments', 'today.title', 'Sam had a calm day with the family', 'Momentos difíciles'])).toEqual(
    ['Hard moments', 'today.title', 'Sam had a calm day with the family']);
});
