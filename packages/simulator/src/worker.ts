/** Worker thread: simulates one family at a time for the runner (Node only). */
import { parentPort } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { simulateFamily } from './simulate';
import type { Scenario } from './scenario';

export interface WorkerTask { taskId: number; scenario: Scenario; family: number; }

parentPort?.on('message', (task: WorkerTask) => {
  try {
    const result = simulateFamily(task.scenario, task.family, { clock: () => performance.now() });
    parentPort?.postMessage({ taskId: task.taskId, result });
  } catch (err) {
    parentPort?.postMessage({ taskId: task.taskId, error: err instanceof Error ? `${err.message}\n${err.stack}` : String(err) });
  }
});
