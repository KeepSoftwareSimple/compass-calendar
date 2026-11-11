import { type SyncResourceRecord } from "@sync/storage/contracts/sync-resource.contracts";

// Incremental pulls that 410 immediately after a successful repair, without a
// cursor ever surviving, enter sync-token-unsupported mode at this streak. The
// first two laps stay free so an ordinary aged-out token still heals in place.
export const SYNC_TOKEN_UNSUPPORTED_ENTER_STREAK = 3;

// Full calendar-list passes clear verdicts older than this so each calendar gets
// at most one token re-probe per day (mirrors watchUnsupportedAt).
export const SYNC_TOKEN_UNSUPPORTED_RETRY_AFTER_MS = 24 * 60 * 60_000;

// Minimum spacing between authoritative full snapshots while sync tokens are
// known to be unusable (Google derived holiday calendars). Matches the widest
// cursor-expiry hold-off so a foreground tick cannot churn a rebuild every ~30s.
export const SYNC_TOKEN_UNSUPPORTED_FULL_SNAPSHOT_INTERVAL_MS = 6 * 60 * 60_000;

/** Whether a token-unsupported calendar is due for another full snapshot pull. */
export function isSyncTokenUnsupportedSnapshotDue(
  resource: Pick<
    SyncResourceRecord,
    "syncTokenUnsupportedAt" | "lastFullSnapshotAt"
  >,
  now: Date,
): boolean {
  if (resource.syncTokenUnsupportedAt === null) return true;
  if (resource.lastFullSnapshotAt === null) return true;
  return (
    now.getTime() - resource.lastFullSnapshotAt.getTime() >=
    SYNC_TOKEN_UNSUPPORTED_FULL_SNAPSHOT_INTERVAL_MS
  );
}
