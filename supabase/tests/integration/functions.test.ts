/**
 * Edge functions and row-level security through the real API (SPEC 7.4, 30.3), against the local Supabase:
 * invites (create, accept, wrong / used / guessed codes), who may invite or share, removing a member, share links
 * (view, revoke, expiry, the School privacy check), deleting an account, and the AI functions' checks (sign-in,
 * request shape, clinician-only session prep, the daily limit). The AI tests never reach the AI provider: each one
 * stops at a check before the call, so they need no API key. Run with `pnpm test:cloud`.
 */
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { addMember, anonClient, call, db, email, makeChild, signIn, std } from './local';

type Person = Awaited<ReturnType<typeof signIn>>;
let owner: Person, caregiver: Person, teacher: Person, clinician: Person, outsider: Person;
let childId: string;

before(async () => {
  [owner, caregiver, teacher, clinician, outsider] = await Promise.all(['owner', 'caregiver', 'teacher', 'clinician', 'outsider'].map((w) => signIn(email(w))));
  childId = await makeChild(owner);
});

describe('invites', () => {
  test('the owner invites; the code works once; roles are what the invite said', async () => {
    assert.equal(await addMember(owner, childId, caregiver, 'caregiver'), 'caregiver');
    assert.equal(await addMember(owner, childId, teacher, 'teacher'), 'teacher');
    assert.equal(await addMember(owner, childId, clinician, 'clinician'), 'clinician');
    const inv = await call(owner.sb, 'invite-create', { child_id: childId, role: 'caregiver' });
    assert.match(String(inv.body.code), /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/);
    const other = await signIn(email('other'));
    assert.equal((await call(other.sb, 'invite-accept', { code: String(inv.body.code).toLowerCase().replace(/(.{4})/, '$1-') })).status, 200);
    assert.deepEqual(await call(outsider.sb, 'invite-accept', { code: inv.body.code }), { status: 410, body: { error: 'expired' } });
    assert.equal((await call(owner.sb, 'invite-accept', { code: inv.body.code })).status, 410);
  });

  test('only the owner can invite, and nobody can be invited as owner', async () => {
    for (const p of [caregiver, teacher, clinician, outsider]) {
      assert.equal((await call(p.sb, 'invite-create', { child_id: childId, role: 'caregiver' })).status, 403);
    }
    assert.equal((await call(owner.sb, 'invite-create', { child_id: childId, role: 'owner' })).status, 400);
    assert.equal((await call(null, 'invite-create', { child_id: childId, role: 'caregiver' })).status, 401);
  });

  test('guessing codes: 10 wrong tries in an hour, then "too many tries" even with a right code', async () => {
    const guesser = await signIn(email('guesser'));
    for (let i = 0; i < 10; i++) assert.equal((await call(guesser.sb, 'invite-accept', { code: `ZZZZ${2000 + i}`.slice(0, 8) })).status, 404);
    const inv = await call(owner.sb, 'invite-create', { child_id: childId, role: 'teacher' });
    assert.deepEqual(await call(guesser.sb, 'invite-accept', { code: inv.body.code }), { status: 429, body: { error: 'too_many_tries' } });
  });
});

describe('row-level security through the API', () => {
  test('a teacher gets no medications; a clinician can\'t add hard moments; an outsider sees nothing', async () => {
    const med = { id: crypto.randomUUID(), child_id: childId, name: 'Medication A', active_from: '2026-09-01', ...std(owner.userId) };
    assert.equal((await owner.sb.from('medications').insert(med)).error, null);
    assert.equal((await caregiver.sb.from('medications').select('id')).data?.length, 1);
    assert.deepEqual((await teacher.sb.from('medications').select('id')).data, []);
    assert.deepEqual((await outsider.sb.from('medications').select('id')).data, []);
    assert.deepEqual((await outsider.sb.from('children').select('id')).data, []);
    const ep = { id: crypto.randomUUID(), child_id: childId, started_at: new Date().toISOString(), type: 'meltdown', source: 'manual', ...std(clinician.userId) };
    assert.equal((await clinician.sb.from('episodes').insert(ep)).error?.code, '42501');
    assert.equal((await anonClient().from('episodes').select('id')).data?.length ?? 0, 0);
  });
});

describe('removing a member', () => {
  test('only the owner can remove; access ends at once; the removed person sees only their own removed membership', async () => {
    const helper = await signIn(email('helper'));
    await addMember(owner, childId, helper, 'caregiver');
    assert.equal((await helper.sb.from('medications').select('id')).data?.length, 1);
    assert.equal((await call(caregiver.sb, 'member-remove', { child_id: childId, user_id: helper.userId })).status, 403);
    assert.equal((await call(owner.sb, 'member-remove', { child_id: childId, user_id: owner.userId })).status, 400);
    assert.equal((await call(owner.sb, 'member-remove', { child_id: childId, user_id: helper.userId })).status, 200);
    assert.deepEqual((await helper.sb.from('medications').select('id')).data, []);
    assert.deepEqual((await helper.sb.from('memberships').select('status')).data, [{ status: 'removed' }]);
  });
});

describe('share links', () => {
  const snapshot = (audience: string, extra: Record<string, unknown> = {}) =>
    ({ version: 1, audience, from: '2026-09-01', to: '2026-09-30', nickname: 'Sam', medications: null, sleep: null, episodes: [], ...extra });

  test('create -> anyone with the link can view -> revoke -> "unavailable"', async () => {
    const made = await call(owner.sb, 'share-create', { child_id: childId, audience: 'clinician', from: '2026-09-01', to: '2026-09-30', expires_in_days: 7,
      snapshot: snapshot('clinician', { medications: { list: [], changes: [] } }) });
    assert.equal(made.status, 200);
    assert.match(String(made.body.token), /^[A-Za-z0-9_-]{43}$/);
    const view = await call(null, 'share-view', { token: made.body.token });
    assert.equal(view.status, 200);
    assert.equal((view.body.snapshot as { nickname: string }).nickname, 'Sam');
    // only the owner sees the list of links, and never the token
    assert.equal((await owner.sb.from('share_links').select('*')).data?.length, 1);
    assert.ok(!JSON.stringify((await owner.sb.from('share_links').select('*')).data).includes(String(made.body.token)));
    for (const p of [caregiver, teacher, clinician, outsider]) assert.deepEqual((await p.sb.from('share_links').select('id')).data, []);
    assert.equal((await call(caregiver.sb, 'share-revoke', { id: made.body.id })).status, 403);
    assert.equal((await call(owner.sb, 'share-revoke', { id: made.body.id })).status, 200);
    assert.deepEqual(await call(null, 'share-view', { token: made.body.token }), { status: 404, body: { error: 'unavailable' } });
  });

  test('an expired link, a made-up token and a malformed one all look the same: unavailable', async () => {
    const made = await call(owner.sb, 'share-create', { child_id: childId, audience: 'family', from: '2026-09-01', to: '2026-09-30', expires_in_days: 30,
      snapshot: snapshot('family') });
    await db((c) => c.query("update public.share_links set expires_at = now() - interval '1 minute' where id = $1", [made.body.id]));
    for (const token of [made.body.token, 'A'.repeat(43), 'short', 42]) {
      assert.deepEqual(await call(null, 'share-view', { token }), { status: 404, body: { error: 'unavailable' } });
    }
  });

  test('only the owner can share; a School snapshot can\'t carry medications, sleep or places; 7 or 30 days only', async () => {
    const ok = { child_id: childId, audience: 'school', from: '2026-09-01', to: '2026-09-30', expires_in_days: 7, snapshot: snapshot('school') };
    assert.equal((await call(caregiver.sb, 'share-create', ok)).status, 403);
    assert.equal((await call(owner.sb, 'share-create', { ...ok, snapshot: snapshot('school', { medications: { list: [] } }) })).status, 400);
    assert.equal((await call(owner.sb, 'share-create', { ...ok, snapshot: snapshot('school', { sleep: { avgHours: 9 } }) })).status, 400);
    assert.equal((await call(owner.sb, 'share-create', { ...ok, snapshot: snapshot('school', { episodes: [{ placeLabel: 'Home', placeType: 'home' }] }) })).status, 400);
    assert.equal((await call(owner.sb, 'share-create', { ...ok, expires_in_days: 365 })).status, 400);
    assert.equal((await call(owner.sb, 'share-create', ok)).status, 200);
  });
});

describe('AI functions (Phase 8)', () => {
  const ask = { messages: [{ role: 'user', content: [{ type: 'text', text: 'How many hard moments last week?' }] }], language: 'en', tz: 'America/Chicago' };
  const fill = (userId: string, count: number) => db((c) => c.query(
    `insert into public.ai_usage (user_id, day, count) values ($1, (now() at time zone 'utc')::date, $2)
     on conflict (user_id, day) do update set count = excluded.count`, [userId, count]));
  const used = (userId: string) => db(async (c) => (await c.query(
    `select coalesce(sum(count), 0)::int as n from public.ai_usage where user_id = $1`, [userId])).rows[0].n as number);

  test('signed-out callers are refused by every AI function', async () => {
    for (const fn of ['ai-ask', 'ai-structure', 'ai-digest', 'ai-session-prep']) assert.equal((await call(null, fn, ask)).status, 401, fn);
  });

  test('a malformed request is refused before anything is counted or sent', async () => {
    const p = await signIn(email('ai-shape'));
    assert.deepEqual(await call(p.sb, 'ai-ask', { ...ask, language: 'fr' }), { status: 400, body: { error: 'bad_request' } });
    assert.equal((await call(p.sb, 'ai-ask', { ...ask, messages: [{ role: 'system', content: [{ type: 'text', text: 'x' }] }] })).status, 400);
    assert.equal((await call(p.sb, 'ai-structure', { text: '', context: {}, language: 'en' })).status, 400);
    assert.equal((await call(p.sb, 'ai-digest', { stats: 'lots', language: 'en' })).status, 400);
    assert.equal(await used(p.userId), 0);
  });

  test('session prep is for the child\'s clinicians only', async () => {
    const body = { child_id: childId, summary: { episodes: 0 }, language: 'en' };
    for (const p of [owner, caregiver, teacher, outsider]) {
      assert.deepEqual(await call(p.sb, 'ai-session-prep', body), { status: 403, body: { error: 'not_clinician' } });
    }
    // the clinician gets past the role check (and is stopped here by the limit, so no AI call happens)
    await fill(clinician.userId, 60);
    assert.deepEqual(await call(clinician.sb, 'ai-session-prep', body), { status: 429, body: { error: 'daily_limit' } });
  });

  test('over the daily limit (60 requests): "daily_limit" from every AI function', async () => {
    const p = await signIn(email('ai-limit'));
    await fill(p.userId, 60);
    assert.deepEqual(await call(p.sb, 'ai-ask', ask), { status: 429, body: { error: 'daily_limit' } });
    assert.equal((await call(p.sb, 'ai-digest', { stats: { episodes: 2 }, language: 'en' })).status, 429);
    assert.equal(await used(p.userId), 62);
    // signed-in users can't reset their own counter through the API
    const reset = await p.sb.from('ai_usage').update({ count: 0 }).eq('user_id', p.userId).select();
    assert.ok(reset.error || (reset.data ?? []).length === 0);
    assert.equal((await p.sb.rpc('ai_usage_increment', { p_user: p.userId })).error?.code, '42501');
  });
});

describe('deleting an account', () => {
  test('removes the children the person owns with every row about them, their memberships and the account', async () => {
    const parent = await signIn(email('deleting'));
    const kid = await makeChild(parent, 'Temp');
    await parent.sb.from('episodes').insert({ id: crypto.randomUUID(), child_id: kid, started_at: new Date().toISOString(), type: 'meltdown', source: 'manual', ...std(parent.userId) });
    // also on someone else's team
    await addMember(owner, childId, parent, 'caregiver');
    assert.equal((await call(parent.sb, 'account-delete', {})).status, 200);
    const left = await db(async (c) => ({
      children: (await c.query('select count(*)::int as n from public.children where id = $1', [kid])).rows[0].n,
      episodes: (await c.query('select count(*)::int as n from public.episodes where child_id = $1', [kid])).rows[0].n,
      memberships: (await c.query('select count(*)::int as n from public.memberships where user_id = $1', [parent.userId])).rows[0].n,
      user: (await c.query('select count(*)::int as n from auth.users where id = $1', [parent.userId])).rows[0].n,
    }));
    assert.deepEqual(left, { children: 0, episodes: 0, memberships: 0, user: 0 });
    // the other family's child is untouched
    assert.equal((await owner.sb.from('children').select('id').eq('id', childId)).data?.length, 1);
  });
});
