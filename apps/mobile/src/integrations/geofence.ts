/**
 * What a geofence event means for place visits (SPEC 11.4). Pure, so it is unit-tested.
 *  - Entering a place closes whatever visit is open and opens a visit to that place (unless already there).
 *  - Leaving the place of the open visit closes it and opens an "away_untagged" visit (somewhere untagged).
 *  - Leaving a place that isn't the open visit (e.g. two overlapping places) changes nothing.
 */
export interface OpenVisit { id: string; placeId: string | null }
export interface GeofencePlace { id: string; type: string }
export type GeofenceEvent = { kind: 'enter' | 'exit'; placeId: string };
export interface VisitChange { close: string[]; open: { placeId: string | null; placeType: string } | null }

export function visitChangeForEvent(open: OpenVisit[], places: GeofencePlace[], ev: GeofenceEvent): VisitChange {
  const place = places.find((p) => p.id === ev.placeId);
  if (!place) return { close: [], open: null }; // a place deleted since the geofence was set up
  if (ev.kind === 'enter') {
    if (open.length === 1 && open[0].placeId === place.id) return { close: [], open: null };
    return { close: open.map((v) => v.id), open: { placeId: place.id, placeType: place.type } };
  }
  const current = open.find((v) => v.placeId === place.id);
  if (!current) return { close: [], open: null };
  return { close: open.map((v) => v.id), open: { placeId: null, placeType: 'away_untagged' } };
}

/** iOS and Android allow at most 20 geofences per app; home first, then the rest by name. */
export const MAX_REGIONS = 20;
export function pickRegions<T extends { type: string; label: string }>(places: T[]): T[] {
  return [...places].sort((a, b) => (a.type === 'home' ? -1 : b.type === 'home' ? 1 : a.label.localeCompare(b.label))).slice(0, MAX_REGIONS);
}
