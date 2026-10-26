/**
 * Portal unit tests (Node, no server): cloud rows -> report inputs, CSV safety, table filters, the security
 * headers' Content-Security-Policy, and the session-prep summary (redacted, Phase 8). End-to-end pages are tested with Playwright against the local Supabase (e2e/).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsv } from '../src/lib/csv';
import { episodeFrom } from '../src/lib/data';
import { filtersFrom } from '../src/lib/episodes';
import { contentSecurityPolicy } from '../proxy';
import { assembleReport } from '@emolens/reports';
import { checkedRange, prepRange, sessionPrepSummary } from '../src/lib/sessionPrep';

test('a cloud episode becomes a report episode (Postgres times with 6 decimals, JSON tags)', () => {
  const e = episodeFrom({ id: 'e1', started_at: '2026-09-30T14:05:00.123456+00:00', duration_min: null, type: 'shutdown', intensity: 3,
    place_id: null, place_type: 'school', antecedent_tags: ['transition'], antecedent_note: null, behavior_tags: null });
  assert.deepEqual(e, { id: 'e1', startedAt: Date.parse('2026-09-30T14:05:00.123Z'), durationMin: null, type: 'shutdown', intensity: 3,
    placeId: null, placeType: 'school', antecedentTags: ['transition'], antecedentNote: null, behaviorTags: [] });
});

test('CSV: quoting, byte-order mark, and no spreadsheet formulas from typed text', () => {
  const csv = toCsv(['a', 'b'], [['x, y', 'say "hi"'], ['=HYPERLINK("http://evil")', null], ['-1', 2]]);
  assert.ok(csv.startsWith('﻿'));
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[1], '"x, y","say ""hi"""');
  assert.equal(lines[2], `"'=HYPERLINK(""http://evil"")",`);
  assert.equal(lines[3], "'-1,2");
});

test('table filters: defaults to the last 30 days, ignores anything unexpected in the address', () => {
  const f = filtersFrom({ type: 'meltdown', min: '9', setting: "school'; drop table", from: '2026-10-05', to: '2026-10-01' }, 'America/Chicago');
  assert.equal(f.type, 'meltdown');
  assert.equal(f.minIntensity, 5);
  assert.equal(f.setting, '');
  assert.deepEqual([f.from, f.to], ['2026-10-01', '2026-10-05']);
  const d = filtersFrom({ type: 'tantrum' }, 'America/Chicago');
  assert.equal(d.type, '');
});

test('Content-Security-Policy: only scripts with this request\'s nonce, no framing, no plugins, server-side Supabase only', () => {
  const csp = contentSecurityPolicy('abc123', false);
  assert.match(csp, /script-src 'self' 'nonce-abc123' 'strict-dynamic'(;|$)/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  for (const rule of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'", "connect-src 'self'"]) assert.ok(csp.includes(rule), rule);
  assert.match(contentSecurityPolicy('n', true), /unsafe-eval/); // only while developing
});

// --- Phase 8: session-prep drafts (SPEC 24.2) ------------------------------------------------------------------------
test('session prep range: since the last clinician note, at most 60 days, never in the future', () => {
  const tz = 'America/Chicago';
  const now = Date.parse('2026-10-08T18:00:00Z');
  assert.deepEqual(prepRange(Date.parse('2026-09-20T15:00:00Z'), now, tz), { from: '2026-09-20', to: '2026-10-08' });
  assert.deepEqual(prepRange(null, now, tz), { from: '2026-08-10', to: '2026-10-08' });
  assert.deepEqual(prepRange(Date.parse('2026-01-01T15:00:00Z'), now, tz), { from: '2026-08-10', to: '2026-10-08' });
  assert.deepEqual(checkedRange('2026-09-01', '2026-09-30'), { from: '2026-09-01', to: '2026-09-30' });
  for (const [a, b] of [['2026-09-30', '2026-09-01'], ['2026-01-01', '2026-09-30'], ['yesterday', '2026-09-30'], [null, '2026-09-30']]) {
    assert.equal(checkedRange(a, b), null);
  }
});

test('session prep summary: counts and patterns from the report data, nickname never included', () => {
  const tz = 'America/Chicago';
  const data = assembleReport({
    profile: { id: 'c1', nickname: 'Rosa', homeTz: tz, typicalSleepHours: 10 },
    episodes: [
      { id: 'e1', startedAt: Date.parse('2026-09-28T20:05:00Z'), durationMin: 15, type: 'meltdown', intensity: 4, placeId: 'p1', placeType: 'home',
        antecedentTags: ['transition'], antecedentNote: 'Rosa had to leave the park', behaviorTags: [] },
      { id: 'e2', startedAt: Date.parse('2026-09-29T14:00:00Z'), durationMin: null, type: 'shutdown', intensity: null, placeId: null, placeType: 'school',
        antecedentTags: [], antecedentNote: null, behaviorTags: [] },
    ],
    places: [{ id: 'p1', label: "Rosa's room", type: 'home' }], uses: [], timeOfDay: [], watch: [],
    patterns: [{ key: 'sleep_deficit', status: 'likely', rawStatus: 'likely', requires: 'always', sentence: 'Rosa has more hard moments after short sleep.', range: '',
      unit: 1, or: 1.8, orLo: 1.2, orHi: 2.6, pHarm: 0.9, confidence: 61, exposed: 20, exposedPos: 8, unexposed: 60, unexposedPos: 10 }],
    health: { n: 0, positives: 0, enough: false, brier: 0, brierBaseline: 0, skill: 0, logLoss: 0, auroc: null, reliability: [] },
    alerts: { delivered: 0, happened: 0, steppedIn: 0, calm: 0, noAnswer: 0, hitRate: null, steppedShare: null },
    medications: { meds: [], doses: [], changes: [] }, sleep: [], notes: [],
  } as unknown as Parameters<typeof assembleReport>[0], { from: '2026-09-22', to: '2026-10-05', audience: 'clinician', noteIds: [], lang: 'en', now: Date.parse('2026-10-08T18:00:00Z'), pageSize: 'letter' });
  const s = sessionPrepSummary(data, [{ at: Date.parse('2026-09-30T02:00:00Z'), text: 'ROSA slept badly; rosa’s teacher noticed too.' }]);
  const text = JSON.stringify(s);
  assert.ok(!/rosa/i.test(text), text);
  const hm = (s.hard_moments as { this_period: { total: number; by_type: Record<string, number> }; list: { at: string }[] });
  assert.equal(hm.this_period.total, 2);
  assert.deepEqual(hm.this_period.by_type, { meltdown: 1, shutdown: 1, other: 0 });
  assert.equal(hm.list[0].at, '2026-09-28 15:05');
  assert.ok(text.includes('[CHILD] had to leave the park'));
  assert.ok(text.includes('[CHILD] slept badly; [CHILD]’s teacher noticed too.'));
  assert.deepEqual((s.patterns_from_family_phone as { status: string; confidence_0_100: number }[]).map((p) => [p.status, p.confidence_0_100]), [['likely', 61]]);
});
