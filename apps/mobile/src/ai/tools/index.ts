/**
 * The Ask EmoLens tool executors (SPEC 19.2 step 4): when the AI asks for a tool, the phone runs the matching function
 * on its own database and sends back the JSON result. The tool list itself (names, descriptions, inputs) is defined
 * on the server (supabase/functions/_shared/prompts.ts); this map must have one executor per tool name there.
 */
import { ToolInputError, type ToolEnv, type ToolOutput } from './common';
import { getForecast, getModelHealth, getPatterns, getStrategyStats, getWorthWatching } from './insights';
import { comparePeriods, getDaySummary, getDoseHistory, getEpisodes, getMeals, getMedications, getSleep, searchNotes } from './logs';

export type { ToolEnv, ToolOutput } from './common';

type Executor = (input: Record<string, unknown>, env: ToolEnv) => Promise<ToolOutput>;

export const TOOL_EXECUTORS: Record<string, Executor> = {
  get_episodes: getEpisodes,
  get_day_summary: getDaySummary,
  get_patterns: getPatterns,
  get_worth_watching: getWorthWatching,
  get_forecast: getForecast,
  get_strategy_stats: getStrategyStats,
  get_medications: getMedications,
  get_dose_history: getDoseHistory,
  get_meals: getMeals,
  get_sleep: getSleep,
  compare_periods: comparePeriods,
  get_model_health: getModelHealth,
  search_notes: searchNotes,
};

export interface ToolRun { content: string; isError: boolean; refs: string[]; }

/** Runs one tool call. Bad input or an unknown tool becomes an error result the AI can read and correct. */
export async function runTool(name: string, input: unknown, env: ToolEnv): Promise<ToolRun> {
  const exec = TOOL_EXECUTORS[name];
  if (!exec) return { content: JSON.stringify({ error: `Unknown tool "${name}".` }), isError: true, refs: [] };
  const args = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  try {
    const out = await exec(args, env);
    return { content: JSON.stringify(out.result), isError: false, refs: out.refs };
  } catch (e) {
    const message = e instanceof ToolInputError ? e.message : 'The data could not be read.';
    return { content: JSON.stringify({ error: message }), isError: true, refs: [] };
  }
}
