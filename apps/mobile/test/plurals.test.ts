/**
 * Proper plurals ("1 planned transition", "2 planned transitions"; "Helped 1 of 1 time"), in English and Spanish:
 * the app's own strings through i18next, the engine's reason texts in a heads-up notification.
 */
import { buildReasons } from '@emolens/engine';
import i18n, { setLanguage } from '../src/i18n';
import { riskAlertContent } from '../src/notifications/forecast';

afterAll(() => { setLanguage('en'); });

const reasonFor = (n: number, lang: 'en' | 'es') => buildReasons({
  keys: ['planned_transitions'], contributions: [0.6], statuses: { planned_transitions: 'strong' }, estimated: [],
  params: { sleepDeficitHours: 0, transitions: n }, lang,
}).raising.map((r) => r.text);

test('heads-up notification: "1 planned transition" / "2 planned transitions"', () => {
  setLanguage('en');
  const one = riskAlertContent({ alertId: 'a', blockStart: 0, blockIndex: 7, nickname: 'Sam', reasons: reasonFor(1, 'en') });
  expect(one.body).toBe('Higher chance of a hard moment for Sam. Main reasons: 1 planned transition in this window. Tap for ideas that have helped.');
  const two = riskAlertContent({ alertId: 'a', blockStart: 0, blockIndex: 7, nickname: 'Sam', reasons: reasonFor(2, 'en') });
  expect(two.body).toContain('2 planned transitions in this window');
  expect(`${one.body}${two.body}`).not.toMatch(/\(s\)/);
});

test('heads-up notification in Spanish: "1 transición planeada" / "2 transiciones planeadas"', () => {
  setLanguage('es');
  const one = riskAlertContent({ alertId: 'a', blockStart: 0, blockIndex: 7, nickname: 'Sam', reasons: reasonFor(1, 'es') });
  expect(one.body).toContain('1 transición planeada en este horario');
  expect(riskAlertContent({ alertId: 'a', blockStart: 0, blockIndex: 7, nickname: 'Sam', reasons: reasonFor(3, 'es') }).body)
    .toContain('3 transiciones planeadas en este horario');
  setLanguage('en');
});

test.each([
  ['en', 'forecast.helpedCount', { s: 1, count: 1 }, 'Helped 1 of 1 time'],
  ['en', 'forecast.helpedCount', { s: 6, count: 7 }, 'Helped 6 of 7 times'],
  ['es', 'forecast.helpedCount', { s: 1, count: 1 }, 'Ayudó 1 de 1 vez'],
  ['es', 'strategies.helped', { s: 6, count: 7 }, 'Ayudó 6 de 7 veces'],
  ['en', 'insights.seenIn', { count: 1 }, 'Seen in 1 time block so far'],
  ['en', 'insights.seenIn', { count: 4 }, 'Seen in 4 time blocks so far'],
  ['en', 'trigger.evidenceWith', { k: 0, count: 1 }, '0 of 1 time block with it had a hard moment.'],
  ['en', 'trigger.evidenceWithout', { k: 19, count: 212 }, 'Compared with 19 of 212 time blocks without it.'],
  ['es', 'health.dataPos', { count: 1 }, '1 momento difícil'],
  ['en', 'health.dataPos', { count: 2 }, '2 hard moments'],
  ['en', 'demo.info', { count: 120, date: 'Sep 28' }, 'Simulated 120 days, up to Sep 28.'],
] as const)('%s %s %j -> %s', (lang, key, opts, expected) => {
  setLanguage(lang);
  expect(i18n.t(key, opts)).toBe(expected);
});
