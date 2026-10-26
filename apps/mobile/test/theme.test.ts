/**
 * @jest-environment node
 * SPEC 28.2: WCAG 2.1 AA contrast in both themes. Text needs 4.5:1; icons and large text need 3:1.
 * Risk colors are used for icons and borders only (their text label uses `text`), so they need 3:1.
 */
import { HERO_GLASS, accents, dark, light, tint } from '../src/ui/theme';
import { contrast, over } from '../src/ui/contrast';

describe.each([['light', light, accents.light], ['dark', dark, accents.dark]] as const)('%s theme', (_name, c, a) => {
  test('body and muted text on background and cards: 4.5:1', () => {
    for (const bg of [c.bg, c.surface, c.surfaceAlt]) {
      expect(contrast(c.text, bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.textMuted, bg)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onDemo, c.demo)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.primary, c.surface)).toBeGreaterThanOrEqual(4.5); // links / text buttons
    expect(contrast(c.text, c.primarySoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.danger, c.surface)).toBeGreaterThanOrEqual(4.5);
  });

  test('white text on the Today header gradient and its see-through boxes: 4.5:1 (BUGS #33)', () => {
    for (const hero of [c.heroFrom, c.heroTo]) {
      expect(contrast('#FFFFFF', hero)).toBeGreaterThanOrEqual(4.5);
      expect(contrast('#FFFFFF', over(HERO_GLASS.color, HERO_GLASS.alpha, hero))).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('risk and learning icons: 3:1 on cards', () => {
    for (const k of ['riskLow', 'riskModerate', 'riskHigh', 'learning'] as const) {
      expect(contrast(c[k], c.surface)).toBeGreaterThanOrEqual(3);
    }
  });

  test('accent icons on their 14% tint: 3:1', () => {
    for (const color of Object.values(a)) {
      expect(contrast(color, over(color, 0.14, c.surface))).toBeGreaterThanOrEqual(3);
    }
    expect(tint('#FFFFFF', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
  });
});
