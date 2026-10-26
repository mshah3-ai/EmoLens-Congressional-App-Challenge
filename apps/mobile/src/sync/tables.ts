/**
 * What Care Team sync copies, table by table (SPEC 7.2, 23.3). One entry per synced table says:
 *  - `cloud`: the table's name in Supabase (only `places` differs: `places_public`, which has no coordinates);
 *  - `booleans` / `json`: columns whose type differs (SQLite 0/1 and JSON text vs Postgres boolean and jsonb);
 *  - `times`: instants, which Postgres returns as "2026-09-30T14:05:00+00:00" and the phone stores as
 *    "2026-09-30T14:05:00.000Z" (dates like "2026-09-30" are text in both and are not listed);
 *  - `localOnly`: columns that never leave the phone (place coordinates, notification ids, audio file paths);
 *  - `childFrom`: tables without child_id on the phone get it from their parent row in the cloud (see the migration);
 *  - `key`: what identifies a row when two phones may create "the same" row (a day's end-of-day check);
 *  - `dirty`: which forecast blocks to recompute when a pulled row changes (SPEC 12.6).
 * `SYNC_ORDER` lists parents before children, so the cloud's foreign keys are always satisfied.
 */
/**
 * `date`: a local date column (YYYY-MM-DD); its blocks are covered by ±24 h around noon UTC of that date.
 * `alert`: the column holds an alert id; the blocks around that alert's block (an answer changes its label).
 */
export type DirtyRule = { column: string; range: 'around' | 'medChange' | 'date' | 'alert' } | 'everything' | 'none';

export interface SyncSpec {
  local: string;
  cloud: string;
  booleans: string[];
  json: string[];
  times: string[];
  localOnly: string[];
  childFrom?: { parent: string; column: string };
  /** Columns that identify a row besides `id` (the cloud has a unique key on them). */
  naturalKey?: string[];
  /** false for places (no created_by / device_id columns). */
  standard: boolean;
  dirty: DirtyRule;
}

const STD_TIMES = ['created_at', 'updated_at', 'deleted_at'];

const spec = (s: Partial<SyncSpec> & Pick<SyncSpec, 'local'>): SyncSpec => ({
  cloud: s.local, booleans: [], json: [], localOnly: [], standard: true, dirty: 'none', ...s,
  times: [...STD_TIMES, ...(s.times ?? [])],
});

export const SYNC_SPECS: SyncSpec[] = [
  spec({ local: 'children', json: ['modeled_episode_types', 'school_days'], dirty: 'everything' }),
  spec({ local: 'strategies', booleans: ['is_default', 'active', 'onboarding_favorite'] }),
  spec({ local: 'places', cloud: 'places_public', localOnly: ['latitude', 'longitude', 'radius_m', 'geofence_enabled'], standard: false }),
  // a medication's own row doesn't move blocks; its medication_changes rows do (+21 days, like on the phone)
  spec({ local: 'medications', booleans: ['as_needed', 'reminders_enabled'], json: ['schedule'] }),
  spec({ local: 'alerts', times: ['block_start', 'scheduled_for'], localOnly: ['notification_id', 'confirm_notification_id'] }),
  spec({ local: 'episodes', booleans: ['safety_concern', 'details_complete'], json: ['antecedent_tags', 'behavior_tags'], times: ['started_at'],
    dirty: { column: 'started_at', range: 'around' } }),
  spec({ local: 'medication_changes', times: ['changed_at'], childFrom: { parent: 'medications', column: 'medication_id' },
    dirty: { column: 'changed_at', range: 'medChange' } }),
  spec({ local: 'med_doses', times: ['scheduled_for', 'taken_at'], childFrom: { parent: 'medications', column: 'medication_id' },
    dirty: { column: 'scheduled_for', range: 'around' } }),
  spec({ local: 'alert_responses', booleans: ['followup_done'], times: ['responded_at'], childFrom: { parent: 'alerts', column: 'alert_id' },
    dirty: { column: 'alert_id', range: 'alert' } }),
  spec({ local: 'strategy_uses', times: ['used_at'], dirty: { column: 'used_at', range: 'around' } }),
  spec({ local: 'meals', json: ['items'], times: ['eaten_at'], dirty: { column: 'eaten_at', range: 'around' } }),
  spec({ local: 'sleep_entries', times: ['sleep_start', 'sleep_end'], dirty: { column: 'sleep_end', range: 'around' } }),
  spec({ local: 'illness_logs', times: ['started_at', 'ended_at'], dirty: { column: 'started_at', range: 'around' } }),
  spec({ local: 'routine_changes', times: ['start_at'], dirty: { column: 'local_date', range: 'date' } }),
  spec({ local: 'place_visits', times: ['arrived_at', 'departed_at'], dirty: { column: 'arrived_at', range: 'around' } }),
  spec({ local: 'notes', times: ['noted_at'], localOnly: ['audio_path'] }),
  spec({ local: 'day_closures', booleans: ['all_logged'], times: ['closed_at'], naturalKey: ['child_id', 'local_date'],
    dirty: { column: 'local_date', range: 'date' } }),
];

export const SPEC_BY_LOCAL: Record<string, SyncSpec> = Object.fromEntries(SYNC_SPECS.map((s) => [s.local, s]));
export const SPEC_BY_CLOUD: Record<string, SyncSpec> = Object.fromEntries(SYNC_SPECS.map((s) => [s.cloud, s]));
/** Parents first (children, medications, alerts before the rows that point at them). */
export const SYNC_ORDER = SYNC_SPECS.map((s) => s.cloud);

/** The pull query filters on this column: every table's child_id, except the children table's own id. */
export const childColumn = (cloud: string) => (cloud === 'children' ? 'id' : 'child_id');
