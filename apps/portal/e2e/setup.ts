/**
 * Test data for the portal smoke tests, made through the normal API as real people would (no secret key): a family
 * with a child, a few hard moments and a medication, the phone's insight snapshot, a clinician and a teacher on the
 * team, and three share links (working, revoked, expired: the last made expired through the local database).
 */
import { writeFileSync } from 'node:fs';
import { addMember, call, db, email, makeChild, signIn, std } from '../../../supabase/tests/integration/local';

export const FIXTURES = new URL('./.fixtures.json', import.meta.url).pathname;

export default async function setup() {
  const who = { owner: email('e2e-owner'), clinician: email('e2e-clinician'), teacher: email('e2e-teacher') };
  const owner = await signIn(who.owner);
  const [clinician, teacher] = await Promise.all([signIn(who.clinician), signIn(who.teacher)]);
  const childId = await makeChild(owner, 'Sam');
  const now = Date.now();
  const episodes = [0, 1, 2, 5, 9].map((d, i) => ({ id: crypto.randomUUID(), child_id: childId, started_at: new Date(now - d * 86_400_000 - 3_600_000).toISOString(),
    type: i % 2 ? 'shutdown' : 'meltdown', intensity: 3, duration_min: 15, place_type: i === 1 ? 'school' : 'home', source: 'manual',
    antecedent_tags: ['transition'], behavior_tags: ['crying'], ...std(owner.userId) }));
  const check = (r: { error: unknown }) => { if (r.error) throw r.error; };
  check(await owner.sb.from('episodes').insert(episodes));
  check(await owner.sb.from('medications').insert({ id: crypto.randomUUID(), child_id: childId, name: 'Medication A', active_from: '2026-08-01', ...std(owner.userId) }));
  check(await owner.sb.from('insight_snapshots').insert({ child_id: childId, computed_at: new Date(now - 3_600_000).toISOString(),
    fit_summary: { lang: 'en', learning: false, labeledDays: 30 },
    insights: [{ key: 'planned_transitions', status: 'likely', rawStatus: 'likely', requires: 'calendar', sentence: 'Planned transitions: about 2.1× the usual chance',
      range: '1.4× to 3.0×', unit: 1, or: 2.1, orLo: 1.4, orHi: 3, pHarm: 0.97, confidence: 62, exposed: 40, exposedPos: 12, unexposed: 300, unexposedPos: 30 }],
    worth_watching: [], strategies: [{ name: 'Quiet space', context: 'during', uses: 6, mean: 0.75, lo80: 0.5, hi80: 0.9 }],
    model_health: {}, time_of_day: [] }));
  await addMember(owner, childId, clinician, 'clinician');
  await addMember(owner, childId, teacher, 'teacher');

  const snap = (audience: string) => ({ version: 1, nickname: 'Sam', tz: 'America/Chicago', lang: 'en', audience, from: '2026-09-01', to: '2026-09-30', days: 30,
    generatedAt: now, pageSize: 'letter', summary: { total: 0, byType: { meltdown: 0, shutdown: 0, other: 0 }, avgIntensity: null, totalDurationMin: 0, perDay: [],
      byTod: { morning: 0, midday: 0, afternoon: 0, evening: 0 }, busiestDay: null },
    previous: { total: 0, byType: { meltdown: 0, shutdown: 0, other: 0 }, avgIntensity: null, totalDurationMin: 0, perDay: [], byTod: { morning: 0, midday: 0, afternoon: 0, evening: 0 }, busiestDay: null },
    timeOfDay: [], episodes: [], patterns: [], watch: [], strategies: [], notes: [],
    forecast: { health: { n: 0, positives: 0, enough: false, brier: 0, brierBaseline: 0, skill: null, logLoss: 0, auroc: null, reliability: [] },
      alerts: { delivered: 0, happened: 0, steppedIn: 0, calm: 0, noAnswer: 0, hitRate: null, steppedShare: null } } });
  const link = async (audience: string) => {
    const r = await call(owner.sb, 'share-create', { child_id: childId, audience, from: '2026-09-01', to: '2026-09-30', expires_in_days: 7, snapshot: snap(audience) });
    if (r.status !== 200) throw new Error(`share-create ${r.status} ${JSON.stringify(r.body)}`);
    return r.body as { id: string; token: string };
  };
  const [working, revoked, expired] = [await link('school'), await link('family'), await link('clinician')];
  await call(owner.sb, 'share-revoke', { id: revoked.id });
  await db((c) => c.query("update public.share_links set expires_at = now() - interval '1 minute' where id = $1", [expired.id]));

  writeFileSync(FIXTURES, JSON.stringify({ who, childId, tokens: { working: working.token, revoked: revoked.token, expired: expired.token } }));
}
