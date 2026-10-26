/**
 * Medication name search with RxNorm, the U.S. National Library of Medicine's free drug vocabulary (no key; SPEC 10.3).
 * approximateTerm finds candidate concept ids (rxcui); properties gives each one's display name.
 * Results are cached in memory for the session; offline, the form falls back to a custom name.
 */
import { getJson } from './http';

export interface RxCandidate { rxcui: string; name: string }

interface ApproxResponse { approximateGroup?: { candidate?: { rxcui?: string; name?: string; score?: string; rank?: string }[] } }
interface PropertiesResponse { properties?: { rxcui?: string; name?: string; synonym?: string; tty?: string } }

export const approximateUrl = (q: string) => `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(q)}&maxEntries=10`;
export const propertiesUrl = (rxcui: string) => `https://rxnav.nlm.nih.gov/REST/rxcui/${encodeURIComponent(rxcui)}/properties.json`;

/** Unique rxcui values in rank order. */
export function candidateIds(res: ApproxResponse): string[] {
  const out: string[] = [];
  for (const c of res.approximateGroup?.candidate ?? []) if (c.rxcui && !out.includes(c.rxcui)) out.push(c.rxcui);
  return out;
}

export function propertiesName(res: PropertiesResponse): string | null {
  const p = res.properties;
  return p?.synonym?.trim() || p?.name?.trim() || null;
}

const cache = new Map<string, RxCandidate[]>();

export async function searchMedications(query: string): Promise<RxCandidate[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];
  const hit = cache.get(q);
  if (hit) return hit;
  const ids = candidateIds(await getJson<ApproxResponse>(approximateUrl(q))).slice(0, 8);
  const named = await Promise.all(ids.map(async (rxcui) => {
    const name = propertiesName(await getJson<PropertiesResponse>(propertiesUrl(rxcui)).catch(() => ({})));
    return name ? { rxcui, name } : null;
  }));
  const seen = new Set<string>();
  const out = named.filter((x): x is RxCandidate => !!x && !seen.has(x.name.toLowerCase()) && !!seen.add(x.name.toLowerCase()));
  cache.set(q, out);
  return out;
}
