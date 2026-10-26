/** Reason texts use proper plurals ("1 planned transition", "2 planned transitions"), in English and Spanish. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_COPY, HOW_WE_KNOW, LEARNING_REASON, fmt, isPluralOne, type Lang } from '@emolens/shared';
import { buildReasons, effectSentence } from '../src/index';

const transitionsReason = (n: number, lang: Lang) => buildReasons({
  keys: ['planned_transitions'], contributions: [0.5], statuses: { planned_transitions: 'likely' }, estimated: [],
  params: { sleepDeficitHours: 0, transitions: n }, lang,
}).raising[0].text;

test('planned transitions: singular for 1, plural otherwise (English)', () => {
  assert.equal(transitionsReason(1, 'en'), '1 planned transition in this window');
  assert.equal(transitionsReason(2, 'en'), '2 planned transitions in this window');
  assert.equal(transitionsReason(3, 'en'), '3 planned transitions in this window');
});

test('planned transitions: singular for 1, plural otherwise (Spanish)', () => {
  assert.equal(transitionsReason(1, 'es'), '1 transición planeada en este horario');
  assert.equal(transitionsReason(2, 'es'), '2 transiciones planeadas en este horario');
});

test('fmt: plural choice and placeholders together; unknown parameters stay as written', () => {
  const tpl = '{name} had {n, plural, one {# hard moment} other {# hard moments}}';
  assert.equal(fmt(tpl, { name: 'Sam', n: 1 }), 'Sam had 1 hard moment');
  assert.equal(fmt(tpl, { name: 'Sam', n: 0 }), 'Sam had 0 hard moments');
  assert.equal(fmt('{x} stays', {}), '{x} stays');
});

test('no engine-facing text uses "(s)"-style plurals', () => {
  const texts: string[] = [];
  for (const c of Object.values(FEATURE_COPY)) {
    for (const pair of [c.label, c.phrase, c.raise, c.protect]) if (pair) texts.push(pair.en, pair.es);
  }
  texts.push(HOW_WE_KNOW.en, HOW_WE_KNOW.es, LEARNING_REASON.en, LEARNING_REASON.es);
  const bad = texts.filter((s) => /\w\((s|es|as|os|a|o)\)/.test(s));
  assert.deepEqual(bad, []);
});

test('plural rule without Intl.PluralRules (the phone\'s Hermes engine has none, BUGS.md #11)', () => {
  const intl = Intl as unknown as { PluralRules?: unknown };
  const saved = intl.PluralRules;
  delete intl.PluralRules;
  try {
    assert.equal(transitionsReason(1, 'en'), '1 planned transition in this window');
    assert.equal(transitionsReason(2, 'es'), '2 transiciones planeadas en este horario');
    assert.match(effectSentence('sleep_deficit', 2, 2.1, 'en'), /^About 2\.1× the usual chance/);
  } finally {
    intl.PluralRules = saved;
  }
});

test('isPluralOne follows CLDR for English and Spanish', () => {
  assert.equal(isPluralOne(1, 'en'), true);
  assert.equal(isPluralOne('1', 'en'), true);
  assert.equal(isPluralOne('1.0', 'en'), false); // English: "1.0 hours"
  assert.equal(isPluralOne('1.0', 'es'), true);  // Spanish: n = 1
  for (const n of [0, 2, 1.5, 21, 101]) { assert.equal(isPluralOne(n, 'en'), false); assert.equal(isPluralOne(n, 'es'), false); }
});

