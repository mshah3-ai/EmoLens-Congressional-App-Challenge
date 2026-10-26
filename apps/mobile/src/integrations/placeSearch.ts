/**
 * Place search as you type (DECISIONS #147): addresses, schools, clinics, parks and shops from OpenStreetMap through
 * Photon (photon.komoot.io), a free search service built for search-as-you-type. No key.
 * Sent: only the typed text and, if Home is set, its rounded location (about 1 km, the same one the weather service gets)
 * so nearby matches come first. The chosen place's coordinates are saved only on this phone.
 */
import type { PlaceType } from '@emolens/shared';
import { getJson, type GetOptions } from './http';

export const PHOTON_URL = 'https://photon.komoot.io/api/';
/** Shorter text matches too much to be useful. */
export const MIN_QUERY = 3;
export const MAX_RESULTS = 6;

export interface PlaceSuggestion {
  id: string;
  /** "Lincoln Elementary School" or "615 West Kemper Place". */
  title: string;
  /** The rest of the address: "615 West Kemper Place, Chicago, Illinois". */
  subtitle: string;
  latitude: number;
  longitude: number;
  /** A guess at the EmoLens place kind, from the map's own tag (school, clinic, park, shop...). */
  type: PlaceType | null;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number; osm_type?: string; osm_key?: string; osm_value?: string;
    name?: string; housenumber?: string; street?: string; city?: string; district?: string; locality?: string;
    state?: string; postcode?: string; country?: string;
  };
}
interface PhotonResponse { features?: PhotonFeature[] }

const round1km = (x: number) => Math.round(x * 100) / 100;

/** Photon has English, German and French names; for other languages it uses each place's local name. */
export function searchUrl(query: string, near?: { latitude: number; longitude: number } | null, lang = 'en'): string {
  const params = [`q=${encodeURIComponent(query.trim())}`, `limit=${MAX_RESULTS + 4}`];
  if (['en', 'de', 'fr'].includes(lang)) params.push(`lang=${lang}`);
  if (near) params.push(`lat=${round1km(near.latitude)}`, `lon=${round1km(near.longitude)}`);
  return `${PHOTON_URL}?${params.join('&')}`;
}

const SCHOOL = new Set(['school', 'kindergarten', 'college', 'university', 'childcare']);
const MEDICAL = new Set(['hospital', 'clinic', 'doctors', 'dentist', 'pharmacy', 'healthcare']);
const OUTDOOR = new Set(['park', 'playground', 'garden', 'nature_reserve', 'pitch', 'sports_centre', 'beach', 'zoo']);
const PUBLIC = new Set(['supermarket', 'mall', 'library', 'restaurant', 'cafe', 'fast_food', 'cinema', 'place_of_worship', 'community_centre', 'museum']);

export function guessType(key?: string, value?: string): PlaceType | null {
  if (!value) return null;
  if (SCHOOL.has(value)) return 'school';
  if (MEDICAL.has(value)) return 'medical';
  if (OUTDOOR.has(value)) return 'park_outdoor';
  if (key === 'shop' || PUBLIC.has(value)) return 'store_public';
  return null;
}

export function parsePhoton(res: PhotonResponse): PlaceSuggestion[] {
  const out: PlaceSuggestion[] = [];
  const seen = new Set<string>();
  for (const f of res.features ?? []) {
    const p = f.properties ?? {};
    const c = f.geometry?.coordinates;
    if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const town = p.city ?? p.locality ?? p.district;
    const title = p.name ?? (street || town);
    if (!title) continue;
    const subtitle = [p.name ? street : '', p.name || street ? town : '', p.state, p.country === 'United States' ? '' : p.country]
      .filter((x): x is string => !!x && x !== title).join(', ');
    const key = `${title}|${subtitle}`.toLowerCase();
    if (seen.has(key)) continue; // the same school as a building and as grounds
    seen.add(key);
    out.push({ id: `${p.osm_type ?? ''}${p.osm_id ?? out.length}`, title, subtitle, latitude: c[1], longitude: c[0], type: guessType(p.osm_key, p.osm_value) });
    if (out.length === MAX_RESULTS) break;
  }
  return out;
}

export async function searchPlaces(query: string, near?: { latitude: number; longitude: number } | null, lang = 'en',
  opts: GetOptions = {}): Promise<PlaceSuggestion[]> {
  if (query.trim().length < MIN_QUERY) return [];
  // one quick try: the next keystroke asks again anyway
  return parsePhoton(await getJson<PhotonResponse>(searchUrl(query, near, lang), { timeoutMs: 8000, retries: 0, ...opts }));
}
