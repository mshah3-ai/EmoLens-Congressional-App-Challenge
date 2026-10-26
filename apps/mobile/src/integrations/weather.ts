/**
 * Weather, air quality and pollen from Open-Meteo (free, no key; SPEC 11.5), for the home location rounded to
 * 2 decimals (about 1 km), so the exact home address is never sent. Refreshed every 3 hours; 120 days are kept.
 */
import type { Executor } from '../db/types';
import { getJson } from './http';
import type { Integration, SyncContext } from './types';

const HOUR = 3_600_000;
export const WEATHER_REFRESH_MS = 3 * HOUR;
export const WEATHER_KEEP_DAYS = 120;
const POLLEN_KEYS = ['alder_pollen', 'birch_pollen', 'grass_pollen', 'mugwort_pollen', 'olive_pollen', 'ragweed_pollen'] as const;

export function forecastUrl(lat: number, lon: number): string {
  return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&hourly=temperature_2m,surface_pressure,relative_humidity_2m,precipitation&past_days=3&forecast_days=3&timezone=UTC';
}
export function airQualityUrl(lat: number, lon: number): string {
  return `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
    `&hourly=us_aqi,pm2_5,${POLLEN_KEYS.join(',')}&past_days=3&forecast_days=3&timezone=UTC`;
}

type Series = (number | null)[];
export interface ForecastResponse { hourly: { time: string[]; temperature_2m?: Series; surface_pressure?: Series; relative_humidity_2m?: Series; precipitation?: Series } }
export interface AirResponse { hourly: { time: string[]; us_aqi?: Series; pm2_5?: Series } & Partial<Record<(typeof POLLEN_KEYS)[number], Series>> }

/**
 * SPEC 11.5: the highest available pollen count (grains/m³) as a level: 0 none, 1 low (< 20), 2 moderate (20-100),
 * 3 high (> 100). `null` when no pollen values exist (pollen data only covers some regions, e.g. Europe).
 */
export function pollenIndex(values: (number | null | undefined)[]): number | null {
  const present = values.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
  if (!present.length) return null;
  const max = Math.max(...present);
  if (max <= 0) return 0;
  if (max < 20) return 1;
  if (max <= 100) return 2;
  return 3;
}

export interface WeatherRow {
  time: string; temperature_c: number | null; pressure_hpa: number | null; humidity: number | null; precipitation_mm: number | null;
  us_aqi: number | null; pm2_5: number | null; pollen_index: number | null; is_forecast: number; fetched_at: string;
}

/** Open-Meteo returns UTC hours as "2026-09-29T14:00"; store them as full ISO strings like the rest of the database. */
const toIso = (t: string) => new Date(`${t}:00Z`).toISOString();

/** Joins the two responses hour by hour. Hours after `now` are marked as forecasts. */
export function mergeWeather(fc: ForecastResponse, air: AirResponse | null, now: number, fetchedAt: string): WeatherRow[] {
  const airIdx = new Map<string, number>((air?.hourly.time ?? []).map((t, i) => [t, i]));
  return fc.hourly.time.map((t, i) => {
    const a = airIdx.get(t);
    const at = <K extends keyof AirResponse['hourly']>(k: K) => (a == null ? null : ((air?.hourly[k] as Series | undefined)?.[a] ?? null));
    const iso = toIso(t);
    return {
      time: iso,
      temperature_c: fc.hourly.temperature_2m?.[i] ?? null,
      pressure_hpa: fc.hourly.surface_pressure?.[i] ?? null,
      humidity: fc.hourly.relative_humidity_2m?.[i] ?? null,
      precipitation_mm: fc.hourly.precipitation?.[i] ?? null,
      us_aqi: at('us_aqi'),
      pm2_5: at('pm2_5'),
      pollen_index: a == null ? null : pollenIndex(POLLEN_KEYS.map((k) => air?.hourly[k]?.[a])),
      is_forecast: Date.parse(iso) > now ? 1 : 0,
      fetched_at: fetchedAt,
    };
  });
}

/** Saves (upserts) the hours; returns how many hours were new. */
export async function saveWeather(ex: Executor, rows: WeatherRow[], now: number): Promise<number> {
  let added = 0;
  for (const r of rows) {
    if (!(await ex.execute('SELECT 1 AS x FROM weather_hourly WHERE time = ?', [r.time])).rows.length) added++;
    await ex.execute(
      `INSERT INTO weather_hourly (time, temperature_c, pressure_hpa, humidity, precipitation_mm, us_aqi, pm2_5, pollen_index, is_forecast, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(time) DO UPDATE SET temperature_c = excluded.temperature_c, pressure_hpa = excluded.pressure_hpa,
         humidity = excluded.humidity, precipitation_mm = excluded.precipitation_mm, us_aqi = excluded.us_aqi, pm2_5 = excluded.pm2_5,
         pollen_index = excluded.pollen_index, is_forecast = excluded.is_forecast, fetched_at = excluded.fetched_at`,
      [r.time, r.temperature_c, r.pressure_hpa, r.humidity, r.precipitation_mm, r.us_aqi, r.pm2_5, r.pollen_index, r.is_forecast, r.fetched_at]);
  }
  await ex.execute('DELETE FROM weather_hourly WHERE time < ?', [new Date(now - WEATHER_KEEP_DAYS * 24 * HOUR).toISOString()]);
  if (rows.length) {
    // SPEC 12.6: weather features of blocks near these hours must be recomputed (weather is the same for every child).
    const times = rows.map((r) => Date.parse(r.time));
    await ex.execute('UPDATE blocks SET dirty = 1 WHERE block_start >= ? AND block_start <= ?',
      [new Date(Math.min(...times) - 24 * HOUR).toISOString(), new Date(Math.max(...times) + 24 * HOUR).toISOString()]);
  }
  return added;
}

/** Home coordinates rounded to 2 decimals (SPEC 11.4), used as the weather location. */
export const roundCoord = (v: number) => Math.round(v * 100) / 100;

export const weatherIntegration: Integration = {
  id: 'weather',
  isAvailable: async () => true,
  hasPermission: async () => true,
  requestPermission: async () => true,
  isDue: (ctx, lastSuccessAt) => !lastSuccessAt || ctx.now - Date.parse(lastSuccessAt) >= WEATHER_REFRESH_MS,
  async setupDetail(ctx) {
    const ready = ctx.settings.weather_lat != null && ctx.settings.weather_lon != null;
    return ready ? { ready } : { ready, detailKey: 'sources.weatherNeedsHome' };
  },
  async sync(ctx: SyncContext) {
    const { weather_lat: lat, weather_lon: lon } = ctx.settings;
    if (lat == null || lon == null) return { changed: 0, note: 'no home location' };
    const fc = await getJson<ForecastResponse>(forecastUrl(lat, lon));
    // Air quality is a separate service; if it fails, keep the weather and try air again next time.
    const air = await getJson<AirResponse>(airQualityUrl(lat, lon)).catch(() => null);
    const rows = mergeWeather(fc, air, ctx.now, new Date(ctx.now).toISOString());
    const added = await saveWeather(ctx.repo.db, rows, ctx.now);
    return { changed: rows.length, summary: { weather_hours: added } };
  },
};
