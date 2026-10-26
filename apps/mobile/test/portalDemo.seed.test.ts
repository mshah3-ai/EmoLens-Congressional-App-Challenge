/**
 * @jest-environment node
 *
 * Seeds the LOCAL Supabase with a synthetic demo child for presenting the clinician portal (not run by `pnpm test` or
 * CI). LOCAL ONLY: it refuses to run unless the stack it talks to is on 127.0.0.1 / localhost.
 *   supabase start
 *   pnpm --filter @emolens/mobile seed:portal-demo
 *
 * What it does, with the app's own code so the portal shows exactly what a real family's phone would upload:
 *  1. Signs in parent@emolens.test and clinician@emolens.test (emailed codes, read from the local Mailpit).
 *  2. Removes an earlier "Sam (demo)" that parent@emolens.test owns, so running it again doesn't make a second one.
 *  3. Builds the demo family (the simulator's default scenario, 120 days, the real engine) on a phone database,
 *     exactly like More → Demo mode, adds a few short made-up caregiver notes (the demo has notes only on hard
 *     moments; the portal's session prep and reports read these), then turns on Care Team as the parent and uploads
 *     everything (initialPush).
 *  4. Uploads today's insight snapshot (patterns, model health, strategies, time of day) and the school-hours forecast.
 *  5. Invites the clinician; the clinician accepts; the clinician's first note says this is synthetic demo data.
 */
import './nodeFetchShim'; // must stay first: see the file
import { SUSPECTED_TRIGGERS } from '@emolens/shared';
import { DEMO_SUSPECTED } from '@emolens/simulator';
import { buildDemo } from '../src/demo/build';
import { getChild, toChildProfile } from '../src/db/repo/children';
import { getAllSettings, setSettings } from '../src/db/repo/settings';
import { Repo } from '../src/db/repo/writer';
import { all } from '../src/db/types';
import { supabaseApi } from '../src/cloud/supabaseApi';
import { runForecast } from '../src/forecast/run';
import { initialPush, turnOnCareTeam } from '../src/sync/enable';
import { shareAfterForecast } from '../src/sync/snapshot';
import { SYNC_SPECS } from '../src/sync/tables';
import { call, db, localEnv, signIn } from '../../../supabase/tests/integration/local';
import { testRepo } from './nodeDb';

jest.setTimeout(900_000);
const run = process.env.EMOLENS_SEED_PORTAL_DEMO === '1' ? describe : describe.skip;
const TZ = 'America/Chicago';
const PARENT = 'parent@emolens.test', CLINICIAN = 'clinician@emolens.test';
/** Made-up caregiver notes, days before "now" (synthetic, like everything else here). */
const CAREGIVER_NOTES: [number, string][] = [
  [104, 'First week of logging. Mornings before school feel rushed.'],
  [88, 'Tried a visual schedule for the morning routine. Smoother start to the day.'],
  [71, 'Short night after a late family event. Afternoon was hard.'],
  [55, 'Teacher says transitions between classes are the hardest part of the day.'],
  [40, 'Had a cold this week. Lower energy and more hard moments in the afternoons.'],
  [26, 'Headphones in the car helped on the way to therapy.'],
  [12, 'Missed the morning medication on Tuesday; the afternoon was harder.'],
  [3, 'Calm weekend. Quiet space after school is working well.'],
];
export const DEMO_LABEL = 'DEMO DATA: a synthetic family made by the EmoLens simulator (default scenario, 120 days). Not a real child.';

/** Never production: both the API and the database must be on this Mac. */
function assertLocal(): void {
  const { url, dbUrl } = localEnv();
  const local = (u: string) => ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(u.replace(/^postgres(ql)?:/, 'http:')).hostname);
  if (!local(url) || !local(dbUrl)) throw new Error(`Refusing to seed: not the local Supabase (${new URL(url).hostname})`);
}

run('seed the LOCAL portal with "Sam (demo)"', () => {
  test('builds, uploads and shares the demo child', async () => {
    assertLocal();
    const now = Date.now();
    const [parent, clinician] = [await signIn(PARENT), await signIn(CLINICIAN)];

    // 2. an earlier demo child of this parent goes first (everything about it is removed with it)
    const removed = await db((c) => c.query(`delete from public.children ch where ch.nickname = 'Sam (demo)' and exists (
      select 1 from public.memberships m where m.child_id = ch.id and m.user_id = $1 and m.role = 'owner') returning ch.id`, [parent.userId]));

    // 3. the demo family on a phone database, then Care Team on and the full upload
    const phone = await testRepo();
    await buildDemo(phone, { lang: 'en', tz: TZ, now, days: 120, yieldToUi: false });
    const repo = new Repo(phone.db, { deviceId: 'portal-demo-seed', createdBy: parent.userId });
    const childId = (await getChild(repo.db))!.id;
    await repo.write(async (w) => {
      for (const [daysAgo, text] of CAREGIVER_NOTES) {
        await w.insert('notes', { child_id: childId, noted_at: new Date(now - daysAgo * 86_400_000 - 3 * 3_600_000).toISOString(), text,
          source: 'manual', audio_path: null, structured_status: null });
      }
    });
    await turnOnCareTeam(repo.db, parent.userId);
    const api = supabaseApi(parent.sb);
    const pushError = await initialPush(repo.db, api, parent.userId);
    expect(pushError).toBeNull();
    await setSettings(repo.db, { care_team_pushed: true });

    // 4. today's snapshot and school-hours forecast, the way the forecasting phone shares them
    const child = (await getChild(repo.db))!;
    const profile = toChildProfile(child, SUSPECTED_TRIGGERS.filter((t) => DEMO_SUSPECTED.includes(t.id)).map((t) => t.id));
    const settings = { ...(await getAllSettings(repo.db)), care_team_enabled: true, primary_forecaster: true, care_team_pushed: true };
    const fc = await runForecast(repo, profile, { now });
    const shared = await shareAfterForecast(repo, profile, settings, fc.snapshot, now, api, null);
    expect(shared.snapshot).toBe(true);

    // 5. the clinician joins with a code, and leaves a note that labels the child as demo data
    const inv = await call(parent.sb, 'invite-create', { child_id: child.id, role: 'clinician' });
    expect(inv.status).toBe(200);
    expect((await call(clinician.sb, 'invite-accept', { code: inv.body.code })).status).toBe(200);
    const note = await clinician.sb.from('clinician_notes').insert({ child_id: child.id, author_id: clinician.userId, body: DEMO_LABEL, kind: 'note' });
    expect(note.error).toBeNull();

    // what landed in the cloud
    const counts: Record<string, number> = {};
    for (const spec of SYNC_SPECS.filter((x) => !x.childFrom)) { // doses, medication changes and alert answers hang off a parent row
      const { count } = await clinician.sb.from(spec.cloud).select('*', { count: 'exact', head: true }).eq(spec.cloud === 'children' ? 'id' : 'child_id', child.id);
      counts[spec.cloud] = count ?? -1;
    }
    const { count: snaps } = await clinician.sb.from('insight_snapshots').select('*', { count: 'exact', head: true }).eq('child_id', child.id);
    const local = (await all<{ n: number }>(repo.db, 'SELECT COUNT(*) AS n FROM episodes'))[0].n;
    console.log([
      `Seeded "Sam (demo)" in the LOCAL Supabase (${localEnv().url}); removed ${removed.rowCount ?? 0} earlier demo child(ren).`,
      `child id: ${child.id}`,
      `rows the clinician can read: ${JSON.stringify(counts)}; insight snapshots: ${snaps}; hard moments on the phone: ${local}`,
      `memberships: ${PARENT} (owner), ${CLINICIAN} (clinician)`,
    ].join('\n'));
    expect(snaps).toBeGreaterThan(0);
  });
});
