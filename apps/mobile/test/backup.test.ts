/**
 * @jest-environment node
 * Full data export and import (SPEC 22.5): the file round-trips, merging keeps the newer edit (ties keep this phone's),
 * bad files change nothing, device-only settings stay, and a different child is never merged.
 */
import { completeOnboarding } from '../src/db/repo/onboarding';
import { getAllSettings, setSetting } from '../src/db/repo/settings';
import { all, one } from '../src/db/types';
import type { Repo } from '../src/db/repo/writer';
import { freshDraft } from '../src/store/onboarding';
import { backupTables, exportAll } from '../src/backup/export';
import { ImportError, applyImport, previewImport } from '../src/backup/import';
import { testRepo } from './nodeDb';

async function childRepo(nickname = 'Sam'): Promise<{ repo: Repo; childId: string }> {
  const repo = await testRepo();
  await completeOnboarding(repo, { ...freshDraft(), child: { ...freshDraft().child, nickname, homeTz: 'America/Chicago' } });
  const c = await one<{ id: string }>(repo.db, 'SELECT id FROM children');
  return { repo, childId: c?.id ?? '' };
}

async function addEpisode(repo: Repo, childId: string, at: string): Promise<string> {
  return repo.write((w) => w.insert('episodes', { child_id: childId, started_at: at, duration_min: 10, type: 'meltdown', intensity: 3,
    place_id: null, place_type: null, antecedent_tags: '[]', antecedent_note: null, behavior_tags: '[]', safety_concern: 0, notes: 'first',
    details_complete: 1, source: 'manual' }));
}

async function snapshot(repo: Repo): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const t of await backupTables(repo.db)) out[t] = await all(repo.db, `SELECT * FROM "${t}" ORDER BY 1`);
  return out;
}

test('export -> import into an empty phone gives the same rows (device settings excepted)', async () => {
  const { repo, childId } = await childRepo();
  await addEpisode(repo, childId, '2026-09-20T15:00:00.000Z');
  await setSetting(repo.db, 'integration_state', { weather: { enabled: true, lastSyncAt: null, lastSuccessAt: null, lastError: null } });
  const file = await exportAll(repo.db);
  expect(file.format).toBe('emolens-backup');
  expect(file.schema_version).toBe(5);
  expect(Object.keys(file.tables)).not.toContain('outbox');
  // Care Team copies (Phase 7) are the cloud's, not the family's backup
  expect(Object.keys(file.tables)).not.toEqual(expect.arrayContaining(['team_members']));
  expect(Object.keys(file.tables)).not.toContain('school_forecasts');

  const fresh = await testRepo();
  const preview = await previewImport(fresh.db, JSON.stringify(file));
  expect(preview.match).toBe('fresh');
  expect(preview.nickname).toBe('Sam');
  expect(preview.counts.find((c) => c.table === 'episodes')?.rows).toBe(1);
  const res = await applyImport(fresh.db, preview);
  expect(res.added).toBeGreaterThan(0);

  const [a, b] = [await snapshot(repo), await snapshot(fresh)];
  for (const t of Object.keys(a)) if (t !== 'settings' && t !== 'blocks') expect({ t, rows: b[t] }).toEqual({ t, rows: a[t] });
  // the device-only setting stayed at its default on the new phone
  expect((await getAllSettings(fresh.db)).integration_state).toEqual({});
  expect((await getAllSettings(fresh.db)).onboarding_complete).toBe(true);
});

test('merge: the newer edit wins either way; a tie keeps this phone\'s copy; importing twice adds nothing', async () => {
  const { repo, childId } = await childRepo();
  const id = await addEpisode(repo, childId, '2026-09-20T15:00:00.000Z');
  const file = await exportAll(repo.db);
  const row = (f: typeof file) => f.tables.episodes.find((e) => e.id === id) as Record<string, unknown>;

  // file newer -> file wins
  const newer = structuredClone(file);
  Object.assign(row(newer), { notes: 'from file', updated_at: '2099-01-01T00:00:00.000Z' });
  let res = await applyImport(repo.db, await previewImport(repo.db, JSON.stringify(newer)));
  expect(res.updated).toBe(1);
  expect((await one<{ notes: string }>(repo.db, 'SELECT notes FROM episodes WHERE id = ?', [id]))?.notes).toBe('from file');

  // file older -> phone keeps its copy
  const older = structuredClone(file);
  Object.assign(row(older), { notes: 'old', updated_at: '2000-01-01T00:00:00.000Z' });
  await applyImport(repo.db, await previewImport(repo.db, JSON.stringify(older)));
  expect((await one<{ notes: string }>(repo.db, 'SELECT notes FROM episodes WHERE id = ?', [id]))?.notes).toBe('from file');

  // same updated_at, different text -> tie keeps the phone's copy
  const tie = structuredClone(newer);
  Object.assign(row(tie), { notes: 'tie' });
  await applyImport(repo.db, await previewImport(repo.db, JSON.stringify(tie)));
  expect((await one<{ notes: string }>(repo.db, 'SELECT notes FROM episodes WHERE id = ?', [id]))?.notes).toBe('from file');

  // importing the same file again adds and changes nothing
  res = await applyImport(repo.db, await previewImport(repo.db, JSON.stringify(newer)));
  expect(res.added).toBe(0);
  expect(res.updated).toBe(0);
  expect((await all(repo.db, 'SELECT id FROM episodes')).length).toBe(1);
});

test('bad files are rejected and change nothing', async () => {
  const { repo } = await childRepo();
  const file = await exportAll(repo.db);
  const problem = async (text: string) => {
    try { await previewImport(repo.db, text); return 'ok'; } catch (e) { return e instanceof ImportError ? e.problem : String(e); }
  };
  expect(await problem('not json')).toBe('not_json');
  expect(await problem(JSON.stringify({ hello: 1 }))).toBe('not_backup');
  expect(await problem(JSON.stringify({ ...file, schema_version: 99 }))).toBe('newer_version');
  expect(await problem(JSON.stringify({ ...file, tables: { ...file.tables, mystery: [] } }))).toBe('unknown_table');
  const extra = structuredClone(file);
  (extra.tables.children[0] as Record<string, unknown>).favorite_color = 'blue';
  expect(await problem(JSON.stringify(extra))).toBe('bad_rows');
  const wrongType = structuredClone(file);
  (wrongType.tables.children[0] as Record<string, unknown>).episodes_per_week_estimate = 'lots';
  expect(await problem(JSON.stringify(wrongType))).toBe('bad_rows');
  const noChild = structuredClone(file);
  noChild.tables.children = [];
  expect(await problem(JSON.stringify(noChild))).toBe('no_child');
});

test('an older backup without a column added by a later migration still imports', async () => {
  const { repo } = await childRepo();
  const file = await exportAll(repo.db);
  for (const r of file.tables.day_closures ?? []) delete (r as Record<string, unknown>).closed_at; // added by migration 003
  const fresh = await testRepo();
  await expect(previewImport(fresh.db, JSON.stringify({ ...file, schema_version: 2 }))).resolves.toBeTruthy();
});

test('a different child is never merged; "replace" swaps this phone\'s data for the backup', async () => {
  const a = await childRepo('Sam');
  await addEpisode(a.repo, a.childId, '2026-09-20T15:00:00.000Z');
  const b = await childRepo('Alex');
  const preview = await previewImport(b.repo.db, JSON.stringify(await exportAll(a.repo.db)));
  expect(preview.match).toBe('different');
  await expect(applyImport(b.repo.db, preview)).rejects.toBeInstanceOf(ImportError);
  expect((await all<{ nickname: string }>(b.repo.db, 'SELECT nickname FROM children')).map((c) => c.nickname)).toEqual(['Alex']);

  await applyImport(b.repo.db, preview, { replace: true });
  expect((await all<{ nickname: string }>(b.repo.db, 'SELECT nickname FROM children')).map((c) => c.nickname)).toEqual(['Sam']);
  expect((await all(b.repo.db, 'SELECT id FROM episodes')).length).toBe(1);
});

test('merging the same child skips what the phone computes itself; a fresh restore brings it', async () => {
  const { repo, childId } = await childRepo();
  await repo.db.execute(`INSERT INTO model_fits (id, child_id, fitted_at, feature_keys, prior_mean, prior_sd, beta, cov, feature_means, tau, log_marginal,
    n_blocks, n_positive, labeled_days, converged, iterations) VALUES ('fit-old', ?, '2026-09-20T22:00:00.000Z', '[]', '[]', '[]', '[]', '[]', '[]', 1, 0, 0, 0, 0, 1, 1)`, [childId]);
  const file = await exportAll(repo.db);
  await repo.db.execute("DELETE FROM model_fits WHERE id = 'fit-old'"); // the phone replaced that fit since the export
  await applyImport(repo.db, await previewImport(repo.db, JSON.stringify(file)));
  expect(await all(repo.db, 'SELECT id FROM model_fits')).toEqual([]);
  const fresh = await testRepo();
  await applyImport(fresh.db, await previewImport(fresh.db, JSON.stringify(file)));
  expect(await all(fresh.db, 'SELECT id FROM model_fits')).toEqual([{ id: 'fit-old' }]);
});
