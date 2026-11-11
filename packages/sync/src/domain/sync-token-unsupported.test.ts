import {
  isSyncTokenUnsupportedSnapshotDue,
  SYNC_TOKEN_UNSUPPORTED_FULL_SNAPSHOT_INTERVAL_MS,
} from "@sync/domain/sync-token-unsupported";
import { describe, expect, it } from "bun:test";

const now = new Date("2026-08-10T12:00:00.000Z");

describe("isSyncTokenUnsupportedSnapshotDue", () => {
  it("treats null lastFullSnapshotAt as due", () => {
    expect(
      isSyncTokenUnsupportedSnapshotDue(
        {
          syncTokenUnsupportedAt: now,
          lastFullSnapshotAt: null,
        },
        now,
      ),
    ).toBe(true);
  });

  it("holds off until the interval after a completed snapshot", () => {
    expect(
      isSyncTokenUnsupportedSnapshotDue(
        {
          syncTokenUnsupportedAt: now,
          lastFullSnapshotAt: now,
        },
        now,
      ),
    ).toBe(false);
    expect(
      isSyncTokenUnsupportedSnapshotDue(
        {
          syncTokenUnsupportedAt: now,
          lastFullSnapshotAt: new Date(
            now.getTime() - SYNC_TOKEN_UNSUPPORTED_FULL_SNAPSHOT_INTERVAL_MS,
          ),
        },
        now,
      ),
    ).toBe(true);
  });
});
