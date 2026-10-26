/**
 * SPEC 30.2 "Redaction": the nickname must be gone from every outgoing AI payload. Hand-picked cases plus a
 * property-based test: thousands of random nicknames (with accents, apostrophes, spaces) in random casings and
 * random sentences, checked by an independent word-by-word scan.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHILD_PLACEHOLDER, containsNickname, redactDeep, redactText, restoreText } from '../src/redact';

test('whole words, any casing, possessives and punctuation', () => {
  assert.equal(redactText("Max had a hard day. MAX's teacher said max was tired!", 'Max'),
    "[CHILD] had a hard day. [CHILD]'s teacher said [CHILD] was tired!");
  assert.equal(redactText('Maxwell and Maximo are other kids; (max)', 'Max'), 'Maxwell and Maximo are other kids; ([CHILD])');
  assert.equal(redactText('ÁNGEL lloró; ángel se calmó con Ángela', 'Ángel'), '[CHILD] lloró; [CHILD] se calmó con Ángela');
  assert.equal(redactText('Mary Jo and Mary went out', 'Mary Jo'), '[CHILD] and Mary went out');
  assert.equal(redactText('Nothing to hide', ''), 'Nothing to hide');
  assert.equal(redactText('a+b (c) [d]', 'a+b'), '[CHILD] (c) [d]', 'regex characters in a nickname are taken literally');
});

test('the same letter typed two ways (é vs e + accent) is still found', () => {
  assert.equal(redactText('José smiled', 'José'), '[CHILD] smiled');
  assert.equal(redactText('José smiled', 'José'), '[CHILD] smiled');
});

test('redactDeep: every string inside objects and arrays; keys, numbers and booleans untouched', () => {
  const v = { Sam: 1, rows: [{ note: 'Sam was upset', ref: 'E:1', n: 3, ok: true }], label: "Sam's room", nested: { x: [null, 'sam'] } };
  assert.deepEqual(redactDeep(v, 'Sam'),
    { Sam: 1, rows: [{ note: '[CHILD] was upset', ref: 'E:1', n: 3, ok: true }], label: "[CHILD]'s room", nested: { x: [null, '[CHILD]'] } });
});

test('restoreText puts the nickname back for display', () => {
  assert.equal(restoreText(`${CHILD_PLACEHOLDER} slept well; ${CHILD_PLACEHOLDER}'s mornings were calmer.`, 'Lía'), "Lía slept well; Lía's mornings were calmer.");
});

// --- property-based test -----------------------------------------------------------------------------------------
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const LETTERS = 'abcdefghijklmnopqrstuvwxyzáéíóúñüçàèö';
const pick = <T>(r: () => number, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
const randomCase = (r: () => number, s: string) => [...s].map((c) => (r() < 0.5 ? c.toUpperCase() : c.toLowerCase())).join('');

function randomNickname(r: () => number): string {
  const word = () => [...Array(2 + Math.floor(r() * 6))].map(() => pick(r, [...LETTERS])).join('');
  const first = word();
  const roll = r();
  if (roll < 0.1) return `${first} ${word()}`; // two words
  if (roll < 0.15) return `${first}'${word()}`; // apostrophe inside, like D'Andre
  if (roll < 0.2) return `${first}-${word()}`; // hyphenated
  return first[0].toUpperCase() + first.slice(1);
}

/** Independent check: is the nickname present as a whole word (letters/digits around it don't count)? */
function leaks(text: string, nickname: string): boolean {
  const t = text.normalize('NFC').toLocaleLowerCase();
  const n = nickname.normalize('NFC').toLocaleLowerCase();
  const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{M}\p{N}_]/u.test(c);
  for (let i = t.indexOf(n); i !== -1; i = t.indexOf(n, i + 1)) {
    if (!isWordChar(t[i - 1]) && !isWordChar(t[i + n.length])) return true;
  }
  return false;
}

test('property: random nicknames in random casings never survive redaction (3000 cases)', () => {
  const r = rng(20261008);
  const fillers = ['had a meltdown', 'at school', 'after lunch', '—', 'y luego', 'calm', '(break)', 'said', ':', '"', 'mamá', '42'];
  const glue = [' ', ', ', '. ', "'s ", '! ', '? ', '\n', ' (', ') ', '"', '…'];
  for (let i = 0; i < 3000; i++) {
    const nick = randomNickname(r);
    const parts: string[] = [];
    for (let k = 0; k < 4 + Math.floor(r() * 8); k++) {
      parts.push(r() < 0.4 ? randomCase(r, nick) : pick(r, fillers));
      parts.push(pick(r, glue));
    }
    const text = parts.join('');
    const out = redactText(text, nick);
    assert.ok(!leaks(out, nick), `leaked "${nick}" in: ${out}`);
    assert.ok(!containsNickname(out, nick));
    // nothing else is changed: putting the nickname back gives the original (in the nickname's own casing)
    assert.equal(restoreText(out, nick), redactText(text, nick).split(CHILD_PLACEHOLDER).join(nick));
    // and redacting twice changes nothing more
    assert.equal(redactText(out, nick), out);
  }
});

test('property: redactDeep removes the nickname from every string of a random payload', () => {
  const r = rng(7);
  for (let i = 0; i < 500; i++) {
    const nick = randomNickname(r);
    const payload = {
      messages: [{ role: 'user', content: [{ type: 'text', text: `How was ${randomCase(r, nick)}'s week?` }] }],
      rows: [...Array(5)].map((_, j) => ({ ref: `E:${j}`, note: `${randomCase(r, nick)} ${pick(r, ['cried', 'hid', 'was fine'])}`, place: `${randomCase(r, nick)}'s room` })),
    };
    const out = JSON.stringify(redactDeep(payload, nick));
    assert.ok(!leaks(out, nick), `leaked "${nick}"`);
  }
});
