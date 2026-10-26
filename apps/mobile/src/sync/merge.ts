/**
 * Last-writer-wins (SPEC 23.3): when two phones changed the same row, the edit with the later `updated_at` is kept
 * everywhere. If both edits have exactly the same time, the one from the phone whose device_id sorts later wins, so
 * every phone makes the same choice. The database has the same rule (the `lww_guard` trigger), so the cloud agrees.
 */
export interface Version { updated_at: string; device_id?: string | null; }

/** Should the incoming version replace the one on this phone? Times are in the phone's ISO format. */
export function incomingWins(local: Version | null, incoming: Version): boolean {
  if (!local) return true;
  if (incoming.updated_at !== local.updated_at) return incoming.updated_at > local.updated_at;
  // a tie: the greater device id wins; without device ids (places) the phone keeps what it has
  if (incoming.device_id == null || local.device_id == null) return false;
  return incoming.device_id > local.device_id;
}
