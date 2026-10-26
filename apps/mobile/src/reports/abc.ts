/**
 * ABC data export (SPEC 22.3): one row per hard moment in the standard Antecedent–Behavior–Consequence layout that
 * behavior analysts and therapists use, as a CSV file that opens in Excel or Numbers.
 *  - UTF-8 with a byte-order mark (so Excel reads accents correctly), comma-separated, fields quoted when needed.
 *  - The column names are the fixed clinical ones (in English, like the SPEC; "Consequence" is the standard ABC column
 *    name and is allowed here, SPEC Section 1). Cell text is in the app's language.
 *  - antecedent_auto: the factors EmoLens saw in that time block that raised the chance by at least 0.1 (logit), using
 *    the ENGINE's `contributions` + `antecedentFactors` on the block's saved features and the latest fit. If the block's
 *    features or a fit aren't available, the reasons saved with that block's evening-before forecast are used instead.
 */
import type { ChildProfile, EpisodeType } from '@emolens/shared';
import {
  antecedentFactors, blockContaining, contributions, localDateOf, localMinuteOf, formatHHMM, rangeBounds, toVector,
  type Fit, type InsightStatus,
} from '@emolens/engine';
import { all, one, type Executor } from '../db/types';
import { iso, ms } from '../db/time';
import { parseJson } from '../db/rows';
import { readSnapshot, type SnapReason } from '../forecast/snapshot';
import type { TFn } from '@emolens/reports';

export const ABC_COLUMNS = ['date', 'start_time', 'duration_min', 'setting', 'antecedent_auto', 'antecedent_caregiver', 'behavior',
  'intensity', 'consequence_and_support', 'outcome', 'logged_by_role'] as const;
export type AbcRow = Record<(typeof ABC_COLUMNS)[number], string | number | null>;

/** One CSV field: quoted when it holds a comma, quote, or line break; quotes doubled (RFC 4180). */
export function csvField(v: string | number | null): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The whole file: BOM + header + one line per row, CRLF line endings (what Excel expects). */
export function buildAbcCsv(rows: AbcRow[]): string {
  const lines = [ABC_COLUMNS.join(','), ...rows.map((r) => ABC_COLUMNS.map((c) => csvField(r[c])).join(','))];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

interface FitRow { feature_keys: string; beta: string; feature_means: string; }

/** Reads the hard moments in from..to (local dates) and turns each into an ABC row. */
export async function loadAbcRows(ex: Executor, profile: ChildProfile, from: string, to: string, t: TFn, lang: 'en' | 'es'): Promise<AbcRow[]> {
  const tz = profile.homeTz;
  const [a, b] = rangeBounds(from, to, tz);
  const episodes = await all<{ id: string; started_at: string; duration_min: number | null; type: EpisodeType; intensity: number | null;
    place_id: string | null; place_type: string | null; antecedent_tags: string; antecedent_note: string | null; behavior_tags: string; created_by: string }>(ex,
    `SELECT id, started_at, duration_min, type, intensity, place_id, place_type, antecedent_tags, antecedent_note, behavior_tags, created_by
     FROM episodes WHERE child_id = ? AND deleted_at IS NULL AND started_at >= ? AND started_at < ? ORDER BY started_at`, [profile.id, iso(a), iso(b)]);
  if (!episodes.length) return [];

  const [places, uses, fitRow, snap] = await Promise.all([
    all<{ id: string; label: string }>(ex, 'SELECT id, label FROM places WHERE child_id = ?', [profile.id]),
    all<{ episode_id: string; name: string; outcome: string }>(ex,
      `SELECT u.episode_id, s.name, u.outcome FROM strategy_uses u JOIN strategies s ON s.id = u.strategy_id
       WHERE u.child_id = ? AND u.deleted_at IS NULL AND u.context = 'during' AND u.episode_id IS NOT NULL AND u.used_at >= ? AND u.used_at < ?
       ORDER BY u.used_at`, [profile.id, iso(a - 86_400_000), iso(b + 86_400_000)]),
    one<FitRow>(ex, 'SELECT feature_keys, beta, feature_means FROM model_fits WHERE child_id = ? ORDER BY fitted_at DESC LIMIT 1', [profile.id]),
    readSnapshot(ex, profile.id),
  ]);
  const placeLabel = new Map(places.map((p) => [p.id, p.label]));
  const statuses: Record<string, InsightStatus> = {};
  for (const i of snap?.insights ?? []) statuses[i.key] = i.status;
  const keys = fitRow ? parseJson<string[]>(fitRow.feature_keys, []) : [];
  const fit: Pick<Fit, 'beta' | 'featureMeans'> | null = fitRow
    ? { beta: parseJson<number[]>(fitRow.beta, []), featureMeans: parseJson<number[]>(fitRow.feature_means, []) } : null;
  const usable = fit && fit.beta.length === keys.length && fit.featureMeans.length === keys.length;

  const rows: AbcRow[] = [];
  for (const e of episodes) {
    const start = ms(e.started_at);
    const block = blockContaining(start, profile);
    let auto: string[] = [];
    if (block) {
      const bs = iso(block.start);
      const feats = usable ? await one<{ values_json: string; estimated_json: string }>(ex,
        "SELECT values_json, estimated_json FROM block_features WHERE child_id = ? AND block_start = ? AND mode = 'actual'", [profile.id, bs]) : null;
      if (feats && fit) {
        const values = parseJson<Record<string, number>>(feats.values_json, {});
        const c = contributions(fit as Fit, toVector(values, keys));
        auto = antecedentFactors({ keys, contributions: c, statuses, estimated: parseJson<string[]>(feats.estimated_json, []), lang,
          params: { sleepDeficitHours: values.sleep_deficit ?? 0, transitions: values.planned_transitions ?? 0 } }).map((r) => r.text);
      } else {
        const pred = await one<{ reasons_json: string }>(ex,
          "SELECT reasons_json FROM predictions WHERE child_id = ? AND block_start = ? AND kind = 'day_ahead'", [profile.id, bs]);
        auto = parseJson<{ raising: SnapReason[] }>(pred?.reasons_json, { raising: [] }).raising
          .filter((r) => !r.key.startsWith('tod_')).map((r) => r.text);
      }
    }
    const mine = uses.filter((u) => u.episode_id === e.id);
    const helped = mine.some((u) => u.outcome === 'helped'), tried = mine.length > 0;
    const antecedentTags = parseJson<string[]>(e.antecedent_tags, []).map((x) => t(`tags.antecedent.${x}`));
    const behaviorTags = parseJson<string[]>(e.behavior_tags, []).map((x) => t(`tags.behavior.${x}`));
    rows.push({
      date: localDateOf(start, tz),
      start_time: formatHHMM(localMinuteOf(start, tz)),
      duration_min: e.duration_min,
      setting: (e.place_id ? placeLabel.get(e.place_id) : null) ?? (e.place_type ? t(`places.types.${e.place_type}`) : ''),
      antecedent_auto: auto.join('; '),
      antecedent_caregiver: [...antecedentTags, e.antecedent_note ?? ''].filter(Boolean).join('; '),
      behavior: [t(`episode.types.${e.type}`), ...behaviorTags].join('; '),
      intensity: e.intensity,
      consequence_and_support: mine.map((u) => `${u.name} (${t(`episode.outcome.${u.outcome}`)})`).join('; '),
      outcome: tried ? t(helped ? 'report.abcOutcomeHelped' : 'report.abcOutcomeNotHelped') : t('report.abcOutcomeNone'),
      logged_by_role: e.created_by === 'local' ? 'caregiver' : 'care_team',
    });
  }
  return rows;
}
