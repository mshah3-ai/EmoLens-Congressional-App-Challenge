/**
 * Worker thread for the tuning search (`src/tune.ts`, Node only). Before simulating, it applies one candidate setting
 * of the parameters SPEC 26.6 allows tuning (status thresholds, TAU_GRID, trigger prior sds) to this thread's copy of
 * the shared constants. The generator, the scoring and every other number are untouched. The app never runs this.
 */
import { parentPort } from 'node:worker_threads';
import { FEATURE_REGISTRY, STATUS_THRESHOLDS, TAU_GRID } from '@emolens/shared';
import { generateWorld } from './generate';
import { simulateWorld, type DailyRow } from './simulate';
import type { Scenario } from './scenario';

type Thresholds = typeof STATUS_THRESHOLDS;
export interface TuneSetting {
  name: string;
  /** Merged into STATUS_THRESHOLDS one level deep (e.g. { likely: { pHarm: 0.85 } }). */
  status?: { [K in keyof Thresholds]?: Thresholds[K] extends object ? Partial<Thresholds[K]> : Thresholds[K] };
  tauGrid?: number[];
  /** Multiplies every trigger's registry prior sd. */
  triggerSdScale?: number;
  /**
   * EXPERIMENT ONLY, outside SPEC 26.6 (a model change to 13.3, would need DECISIONS): multiplies every trigger's prior
   * mean (0 = every trigger starts at "no effect").
   */
  triggerMeanScale?: number;
  /** EXPERIMENT ONLY, outside SPEC 26.6 (RECENCY_HALF_LIFE_DAYS, spec 5): the simulated app's recency half-life. */
  halfLifeDays?: number;
}
export interface TuneTask { taskId: number; scenario: Scenario; family: number; setting: TuneSetting; }
/** What the planted triggers looked like on the diagnostic day (why a trigger was missed). */
export interface PlantedDiag { key: string; status: string; pHarm: number; or: number; exposed: number; exposedPos: number; }
export interface TuneResult { family: number; daily: Pick<DailyRow, 'day' | 'detection' | 'nullPossible' | 'nullLikelyStrong' | 'statuses'>[]; diag: PlantedDiag[]; }

export const DIAG_DAY = 90;

// pristine copies, so each task starts from the shipped values
const BASE_STATUS = JSON.parse(JSON.stringify(STATUS_THRESHOLDS)) as Thresholds;
const BASE_TAU = [...TAU_GRID];
const BASE_SD = FEATURE_REGISTRY.map((d) => d.priorSd);
const BASE_MEAN = FEATURE_REGISTRY.map((d) => d.priorMean);

function apply(s: TuneSetting): void {
  const T = STATUS_THRESHOLDS as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(JSON.parse(JSON.stringify(BASE_STATUS)) as Record<string, unknown>)) T[k] = v;
  for (const [k, v] of Object.entries(s.status ?? {})) {
    T[k] = typeof v === 'object' ? { ...(T[k] as object), ...v } : v;
  }
  TAU_GRID.splice(0, TAU_GRID.length, ...(s.tauGrid ?? BASE_TAU));
  FEATURE_REGISTRY.forEach((d, i) => {
    d.priorSd = d.isTrigger ? BASE_SD[i] * (s.triggerSdScale ?? 1) : BASE_SD[i];
    d.priorMean = d.isTrigger ? BASE_MEAN[i] * (s.triggerMeanScale ?? 1) : BASE_MEAN[i];
  });
}

parentPort?.on('message', (task: TuneTask) => {
  try {
    apply(task.setting);
    const planted = Object.keys(task.scenario.trueEffects);
    const diag: PlantedDiag[] = [];
    const world = generateWorld(task.scenario, task.family);
    if (task.setting.halfLifeDays != null) world.settings.recencyHalfLifeDays = task.setting.halfLifeDays;
    const r = simulateWorld(world, {
      onDay: (day, res) => {
        if (day !== DIAG_DAY) return;
        for (const i of res.insights) if (planted.includes(i.key)) {
          diag.push({ key: i.key, status: i.status, pHarm: i.pHarm, or: i.or, exposed: i.exposed, exposedPos: i.exposedPos });
        }
      },
    });
    const daily = r.daily.map(({ day, detection, nullPossible, nullLikelyStrong, statuses }) => ({ day, detection, nullPossible, nullLikelyStrong, statuses }));
    parentPort?.postMessage({ taskId: task.taskId, result: { family: r.family, daily, diag } satisfies TuneResult });
  } catch (err) {
    parentPort?.postMessage({ taskId: task.taskId, error: err instanceof Error ? `${err.message}\n${err.stack}` : String(err) });
  }
});
