/**
 * An in-memory stand-in for Supabase with the same rules that matter to sync, so the sync logic is tested without a
 * network: row-level security by role (SPEC 7.3, simplified to tables), the server's last-writer-wins guard, server
 * receive times (with Postgres's 6 decimal places, to test the phone's parsing), and the edge functions that manage
 * the team and share links. The real database rules are tested separately (supabase/tests/database/rls.test.sql).
 */
import type { CloudApi, CloudError, CloudResult, Membership, Profile, ShareLinkRow } from '../src/cloud/api';

type Row = Record<string, unknown>;
type Role = Membership['role'];

const READ: Record<Role, 'all' | Set<string>> = {
  owner: 'all', caregiver: 'all', clinician: 'all',
  teacher: new Set(['children', 'strategies', 'episodes', 'strategy_uses', 'notes', 'meals', 'school_forecasts']),
};
const WRITE: Record<Role, Set<string> | 'all'> = {
  owner: 'all',
  caregiver: 'all',
  teacher: new Set(['episodes', 'strategy_uses', 'notes', 'meals']),
  clinician: new Set(),
};

const forbidden: CloudError = { code: '42501', status: 403, message: 'new row violates row-level security policy' };

export class FakeCloud {
  tables = new Map<string, Map<string, Row>>();
  memberships: Membership[] = [];
  profiles = new Map<string, Profile>();
  invites: { code: string; child_id: string; role: Role; used: boolean }[] = [];
  shares: (ShareLinkRow & { child_id: string; token: string; snapshot: unknown })[] = [];
  /** Every upsert call: table and row count (to check batching and order). */
  calls: { table: string; rows: number }[] = [];
  /** AI functions (Phase 8): every request body the app sent (to check redaction), and the stand-in for the AI. */
  aiRequests: { fn: string; body: Record<string, unknown> }[] = [];
  aiHandler: ((fn: string, body: Record<string, unknown>) => { data: unknown } | { error: string; status: number }) | null = null;
  /** The next `failures` upserts fail like a dropped connection. */
  failures = 0;
  private tick = 0;

  /** "2026-09-30T12:00:00.000123+00:00": increasing server times in Postgres's format. */
  private stamp(): string {
    this.tick++;
    const base = new Date(Date.UTC(2026, 8, 30, 12, 0, 0) + Math.floor(this.tick / 1000)).toISOString().slice(0, 19);
    return `${base}.${String(this.tick % 1000).padStart(3, '0')}${String(this.tick % 997).padStart(3, '0')}+00:00`;
  }

  private table(name: string): Map<string, Row> {
    let t = this.tables.get(name);
    if (!t) { t = new Map(); this.tables.set(name, t); }
    return t;
  }

  rows(name: string): Row[] { return [...this.table(name).values()]; }

  roleOf(userId: string, childId: string): Role | null {
    const m = this.memberships.find((x) => x.child_id === childId && x.user_id === userId && x.status === 'active');
    return m?.role ?? null;
  }

  private childOfRow(table: string, row: Row): string {
    return String(table === 'children' ? row.id : row.child_id);
  }

  /** The API as seen by one signed-in user. */
  as(userId: string): CloudApi {
    const ok = <T>(data: T): CloudResult<T> => ({ data, error: null });
    const err = <T>(e: CloudError): CloudResult<T> => ({ data: null, error: e });
    return {
      upsert: async (table, rows, onConflict) => {
        this.calls.push({ table, rows: rows.length });
        if (this.failures > 0) { this.failures--; return err({ code: 'network', status: null, message: 'network' }); }
        // like Postgres: the whole statement fails if any row is refused
        for (const row of rows) {
          const childId = this.childOfRow(table, row);
          if (table === 'children' && !this.table('children').has(String(row.id))) {
            if (row.owner_id !== userId || row.created_by !== userId) return err(forbidden);
            continue;
          }
          const role = this.roleOf(userId, childId);
          const allowed = role && (table === 'children' ? role === 'owner' : WRITE[role] === 'all' || (WRITE[role] as Set<string>).has(table));
          if (!allowed) return err(forbidden);
          if (role === 'teacher' && row.created_by !== userId) return err(forbidden);
        }
        const keyCols = onConflict.split(',');
        const t = this.table(table);
        for (const row of rows) {
          const key = keyCols.map((k) => String(row[k])).join('|');
          const existing = t.get(key);
          if (existing && 'updated_at' in row) {
            const a = Date.parse(String(row.updated_at)), b = Date.parse(String(existing.updated_at));
            if (a < b || (a === b && String(row.device_id ?? '') <= String(existing.device_id ?? ''))) continue; // lww_guard
          }
          if (!existing && table === 'children') {
            this.memberships.push({ child_id: String(row.id), user_id: userId, role: 'owner', status: 'active' });
          }
          t.set(key, { ...row, server_received_at: this.stamp() });
        }
        return ok(null);
      },
      pullPage: async (table, column, childId, since, limit) => {
        const role = this.roleOf(userId, childId);
        if (!role) return ok([]); // RLS: no rows, no error
        const read = READ[role];
        if (read !== 'all' && !read.has(table)) return ok([]);
        let rows = this.rows(table).filter((r) => String(r[column]) === childId && Date.parse(String(r.server_received_at)) > Date.parse(since));
        if (role === 'teacher') {
          if (table === 'episodes') rows = rows.filter((r) => r.place_type === 'school' || r.created_by === userId);
          if (table === 'notes' || table === 'meals' || table === 'strategy_uses') rows = rows.filter((r) => r.created_by === userId);
        }
        rows.sort((a, b) => Date.parse(String(a.server_received_at)) - Date.parse(String(b.server_received_at))
          || String(a.server_received_at).localeCompare(String(b.server_received_at)));
        return ok(rows.slice(0, limit).map((r) => ({ ...r })));
      },
      memberships: async (childId) => {
        const mine = this.roleOf(userId, childId);
        return ok(this.memberships.filter((m) => m.child_id === childId && (mine || m.user_id === userId)));
      },
      profiles: async (ids) => { return ok(ids.map((id) => this.profiles.get(id)).filter((p): p is Profile => !!p)); },
      setDisplayName: async (id, name) => { this.profiles.set(id, { user_id: id, display_name: name }); return ok(null); },
      schoolForecasts: async (childId, fromDate) => {
        if (!this.roleOf(userId, childId)) return ok([]);
        return ok(this.rows('school_forecasts').filter((r) => r.child_id === childId && String(r.local_date) >= fromDate)
          .map((r) => ({ local_date: String(r.local_date), blocks: r.blocks, computed_at: String(r.computed_at) })));
      },
      shareLinks: async (childId) => {
        if (this.roleOf(userId, childId) !== 'owner') return ok([]);
        return ok(this.shares.filter((s) => s.child_id === childId).map(({ child_id: _c, token: _t, snapshot: _s, ...rest }) => rest));
      },
      call: async <T>(fn: string, body: Record<string, unknown>): Promise<CloudResult<T>> => {
        const r = this.fn(userId, fn, body);
        return ('error' in r ? { data: null, error: { code: r.error, status: r.status, message: r.error } } : { data: r.data as T, error: null });
      },
    };
  }

  private fn(userId: string, name: string, body: Record<string, unknown>): { data: unknown } | { error: string; status: number } {
    const owner = (childId: unknown) => this.roleOf(userId, String(childId)) === 'owner';
    if (name.startsWith('ai-')) {
      this.aiRequests.push({ fn: name, body: JSON.parse(JSON.stringify(body)) as Record<string, unknown> });
      return this.aiHandler ? this.aiHandler(name, body) : { error: 'ai_unavailable', status: 502 };
    }
    switch (name) {
      case 'invite-create': {
        if (!owner(body.child_id)) return { error: 'not_owner', status: 403 };
        const code = `CODE${String(this.invites.length).padStart(4, '2')}`.slice(0, 8).toUpperCase();
        this.invites.push({ code, child_id: String(body.child_id), role: body.role as Role, used: false });
        return { data: { code, role: body.role, expires_at: '2026-10-07T12:00:00.000Z' } };
      }
      case 'invite-accept': {
        const code = String(body.code ?? '').toUpperCase().replace(/[\s-]/g, '');
        const inv = this.invites.find((i) => i.code === code);
        if (!inv) return { error: 'not_found', status: 404 };
        if (inv.used) return { error: 'expired', status: 410 };
        if (this.roleOf(userId, inv.child_id)) return { error: 'already_member', status: 409 };
        inv.used = true;
        this.memberships = this.memberships.filter((m) => !(m.child_id === inv.child_id && m.user_id === userId));
        this.memberships.push({ child_id: inv.child_id, user_id: userId, role: inv.role, status: 'active' });
        const nickname = this.table('children').get(inv.child_id)?.nickname ?? null;
        return { data: { child_id: inv.child_id, role: inv.role, nickname } };
      }
      case 'member-remove': {
        if (!owner(body.child_id)) return { error: 'not_owner', status: 403 };
        const m = this.memberships.find((x) => x.child_id === body.child_id && x.user_id === body.user_id && x.role !== 'owner');
        if (!m) return { error: 'not_found', status: 404 };
        m.status = 'removed';
        return { data: { removed: true } };
      }
      case 'share-create': {
        if (!owner(body.child_id)) return { error: 'not_owner', status: 403 };
        const id = `00000000-0000-4000-8000-${String(this.shares.length).padStart(12, '0')}`;
        const token = `tok${this.shares.length}`.padEnd(43, 'x');
        this.shares.push({ id, child_id: String(body.child_id), token, snapshot: body.snapshot, audience: body.audience as ShareLinkRow['audience'],
          range_from: String(body.from), range_to: String(body.to), expires_at: '2026-10-07T12:00:00.000Z', revoked_at: null, created_at: '2026-09-30T12:00:00.000Z' });
        return { data: { id, token, expires_at: '2026-10-07T12:00:00.000Z' } };
      }
      case 'share-revoke': {
        const s = this.shares.find((x) => x.id === body.id);
        if (!s) return { error: 'not_found', status: 404 };
        if (!owner(s.child_id)) return { error: 'not_owner', status: 403 };
        s.revoked_at = '2026-09-30T13:00:00.000Z';
        return { data: { revoked: true } };
      }
      default:
        return { error: 'not_found', status: 404 };
    }
  }
}
