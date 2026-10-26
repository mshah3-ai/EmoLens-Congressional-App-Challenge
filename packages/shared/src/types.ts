/**
 * Plain-data types shared by the engine, the mobile app, the portal and the simulator.
 *
 * Inside the engine every instant is a number: Unix epoch MILLISECONDS (UTC).
 * The mobile app stores ISO strings in SQLite and converts to numbers when it builds a
 * ChildDataset. Local calendar dates are 'YYYY-MM-DD' strings in the child's home time zone.
 */

export type EpisodeType = 'meltdown' | 'shutdown' | 'other';
export type PlaceType =
  | 'home' | 'school' | 'therapy' | 'medical' | 'relative' | 'store_public' | 'park_outdoor' | 'other';
export type VisitPlaceType = PlaceType | 'away_untagged';
export type VisitSource = 'geofence_child_device' | 'geofence_parent' | 'manual' | 'episode' | 'schedule_default';
export type LabelStatus = 'positive' | 'negative_confirmed' | 'intervened' | 'unknown';
export type RiskLevel = 'learning' | 'low' | 'moderate' | 'high';
export type Sensitivity = 'fewer' | 'balanced' | 'more';
export type DoseStatus = 'pending' | 'taken' | 'late' | 'missed' | 'skipped';
export type AlertResponseKind = 'happened' | 'stepped_in' | 'calm';
export type CalendarTag = 'transition' | 'unusual' | 'appointment' | 'school_event' | 'travel' | 'social' | 'no_school';
export type StrategyContext = 'proactive' | 'during';
export type StrategyOutcome = 'helped' | 'not_helped' | 'unsure' | 'averted' | 'not_averted' | 'pending';

export interface ChildProfile {
  id: string;
  nickname: string;
  homeTz: string;               // IANA zone
  wakeStart: string;            // 'HH:MM'
  wakeEnd: string;              // 'HH:MM'
  typicalSleepHours: number;
  episodesPerWeekEstimate: number;
  modeledEpisodeTypes: EpisodeType[];
  minModeledIntensity: number;
  schoolDays: number[];         // ISO weekdays 1 = Mon ... 7 = Sun
  suspectedFeatures: string[];  // feature keys nudged by onboarding step 7
}

export interface Episode {
  id: string; startedAt: number; durationMin: number | null; type: EpisodeType;
  intensity: number | null; placeType?: string | null; antecedentTags?: string[];
  behaviorTags?: string[]; safetyConcern?: boolean; notes?: string | null; deleted?: boolean;
}
export interface Medication {
  id: string; name: string; scheduleTimes: string[]; scheduleDays: number[];
  asNeeded: boolean; activeFrom: string; activeTo: string | null;
}
export interface MedicationChange { medicationId: string; changedAt: number; changeType: 'start' | 'stop' | 'dose_change' | 'time_change'; }
export interface MedDose { id: string; medicationId: string; scheduledFor: number | null; takenAt: number | null; status: DoseStatus; }
export interface MealItem { name: string; tags: string[]; }
export interface Meal { id: string; eatenAt: number; mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink'; items: MealItem[]; }
export interface SleepEntry { id: string; sleepStart: number; sleepEnd: number; durationMin: number; nightWakings: number | null; quality?: number | null; }
export interface Place { id: string; label: string; type: PlaceType; }
export interface PlaceVisit { id: string; placeId: string | null; placeType: VisitPlaceType; arrivedAt: number; departedAt: number | null; source: VisitSource; }
export interface CalendarEvent { id: string; startAt: number; endAt: number; allDay: boolean; tags: CalendarTag[]; ignored: boolean; }
export interface RoutineChange { id: string; localDate: string; startAt: number | null; severity: number; }
export interface IllnessLog { id: string; startedAt: number; endedAt: number | null; severity: number; kind: string; }
export interface WeatherHour { time: number; temperatureC: number | null; pressureHpa: number | null; usAqi: number | null; pollenIndex: number | null; isForecast: boolean; }
/** A stretch of sound/temperature readings (sensor minute = 1 min; phone sound check ~0.5-1 min). */
export interface SoundInterval { start: number; minutes: number; db: number | null; tempC: number | null; placeId: string | null; source: 'sensor' | 'phone'; }
export interface HeartSample { time: number; bpm: number; }
export interface DailyHealth { localDate: string; restingHr: number | null; hrv: number | null; steps: number | null; }
export interface Alert { id: string; blockStart: number; scheduledFor: number; status: 'scheduled' | 'delivered' | 'cancelled' | 'suppressed'; }
export interface AlertResponse { alertId: string; response: AlertResponseKind; respondedAt: number; }
/** closedAt = time the "that's everything" answer covered up to (created/updated time). */
export interface DayClosure { localDate: string; allLogged: boolean; closedAt: number; }
export interface Strategy { id: string; name: string; category: string; active: boolean; onboardingFavorite: boolean; }
export interface StrategyUse { id: string; strategyId: string; context: StrategyContext; outcome: StrategyOutcome; usedAt: number; episodeId?: string | null; alertId?: string | null; }

export interface DatasetSettings {
  noiseThresholdDb: number;
  recencyHalfLifeDays: number;
  sensitivity: Sensitivity;
  maxAlertsPerDay: number;
  quietHours: { start: string; end: string };
  earlyAlertsEnabled: boolean;
  hasHomeCoordinates: boolean;
  calendarConnected: boolean;
}

/** Everything the engine needs about one child. Arrays SHOULD be sorted by time. */
export interface ChildDataset {
  child: ChildProfile;
  settings: DatasetSettings;
  episodes: Episode[];
  medications: Medication[];
  medicationChanges: MedicationChange[];
  doses: MedDose[];
  meals: Meal[];
  sleep: SleepEntry[];
  places: Place[];
  visits: PlaceVisit[];
  calendar: CalendarEvent[];
  routineChanges: RoutineChange[];
  illness: IllnessLog[];
  weather: WeatherHour[];
  sound: SoundInterval[];
  heart: HeartSample[];
  dailyHealth: DailyHealth[];
  alerts: Alert[];
  alertResponses: AlertResponse[];
  dayClosures: DayClosure[];
  strategies: Strategy[];
  strategyUses: StrategyUse[];
}

export interface Block {
  start: number; end: number; localDate: string; index: number; minutes: number; awake: boolean;
}
