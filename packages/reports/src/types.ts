/**
 * The data one report shows (SPEC 22.2), shared by the phone's PDF, the portal's report page and share links.
 * Plain JSON-friendly data: times are epoch milliseconds, dates are 'YYYY-MM-DD' in the child's home time zone.
 */
import type { DataRequirement, EpisodeType, Lang } from '@emolens/shared';
import type {
  Adherence, AlertMetrics, EpisodeSummary, HealthMetrics, InsightStatus, SleepSummary, TimeOfDayRow, WatchItem,
} from '@emolens/engine';

export type Audience = 'clinician' | 'school' | 'family';
export const AUDIENCES: Audience[] = ['clinician', 'school', 'family'];

/** One pattern as the engine's last run describes it (sentences already in the family's language). */
export interface SnapInsight {
  key: string; status: InsightStatus; rawStatus: InsightStatus; requires: DataRequirement;
  sentence: string; range: string; unit: number;
  or: number; orLo: number; orHi: number; pHarm: number; confidence: number;
  exposed: number; exposedPos: number; unexposed: number; unexposedPos: number;
}

export interface ReportOptions {
  from: string;
  to: string;
  audience: Audience;
  /** Caregiver notes the parent ticked (SPEC 22.2 section 12). */
  noteIds: string[];
  lang: Lang;
  now: number;
  pageSize: 'letter' | 'a4';
  /**
   * School audience only: include only hard moments during school hours or at school (BUGS #23). Undefined means on;
   * the parent can turn it off. Ignored for other audiences.
   */
  schoolOnly?: boolean;
}

export interface ReportEpisode {
  id: string; startedAt: number; durationMin: number | null; type: EpisodeType; intensity: number | null;
  /** The place's own name (clinician and family) or null; placeType is the kind of place. */
  placeLabel: string | null; placeType: string | null;
  antecedentTags: string[]; antecedentNote: string | null; behaviorTags: string[];
  helped: { name: string; outcome: 'helped' | 'not_helped' | 'unsure' }[];
}

export interface ReportMedication {
  id: string; name: string; strength: string | null; form: string | null; rxcui: string | null; asNeeded: boolean;
  times: string[]; activeFrom: string; activeTo: string | null; adherence: Adherence;
}

export interface ReportData {
  nickname: string;
  tz: string;
  lang: Lang;
  audience: Audience;
  from: string;
  to: string;
  days: number;
  generatedAt: number;
  pageSize: 'letter' | 'a4';
  summary: EpisodeSummary;
  previous: EpisodeSummary;
  timeOfDay: TimeOfDayRow[];
  /** True when this School report shows only school-time hard moments (every number and chart uses that set). */
  schoolOnly?: boolean;
  episodes: ReportEpisode[];
  patterns: SnapInsight[];
  watch: WatchItem[];
  /** null (or absent, in a share link) for the School audience. */
  medications?: { list: ReportMedication[]; changes: { name: string; at: number; changeType: string; oldValue: string | null; newValue: string | null }[] } | null;
  /** null (or absent, in a share link) for the School audience. */
  sleep?: (SleepSummary & { minHours: number | null; maxHours: number | null }) | null;
  strategies: { name: string; context: 'proactive' | 'during'; successes: number; failures: number; unsure: number }[];
  forecast: { health: HealthMetrics; alerts: AlertMetrics };
  notes: { id: string; at: number; text: string }[];
}
