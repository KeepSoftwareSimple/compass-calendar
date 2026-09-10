import { type DateTime } from "@core/types/domain-primitives";
import {
  SYNC_HEALTH_SNAPSHOT_EVENT,
  type SyncHealthSnapshot,
  SyncHealthSnapshotSchema,
} from "@core/types/sync/health.contracts";
import { describe, expect, it } from "bun:test";

const sample = (): SyncHealthSnapshot => ({
  environment: "test",
  execution: "passive",
  provider: "google",
  service: "compass-sync",
  connections: {
    connecting: 0,
    importing: 1,
    catchingUp: 0,
    healthy: 10,
    delayed: 2,
    actionRequired: 1,
    disconnected: 3,
  },
  jobs: {
    pending: 4,
    claimed: 1,
    failed: 0,
    oldestDueAgeMs: 12_000,
  },
  subscriptions: {
    healthy: 8,
    renewSoon: 1,
    expired: 0,
    missing: 2,
    neverNotified: 3,
  },
  freshness: {
    sampleSize: 9,
    p50Ms: 5_000,
    p95Ms: 20_000,
    p99Ms: 40_000,
    percentOver30s: 11.1,
  },
  computedAt: "2026-07-25T02:00:00.000Z" as DateTime,
  computeMs: 42,
});

describe("SyncHealthSnapshotSchema", () => {
  it("accepts a bounded aggregate snapshot", () => {
    expect(SyncHealthSnapshotSchema.safeParse(sample()).success).toBe(true);
  });

  it("rejects unknown fields (cardinality / leakage guard)", () => {
    expect(
      SyncHealthSnapshotSchema.safeParse({
        ...sample(),
        tenantId: "should-not-appear",
      }).success,
    ).toBe(false);
  });

  it("rejects a negative count", () => {
    expect(
      SyncHealthSnapshotSchema.safeParse({
        ...sample(),
        jobs: { ...sample().jobs, pending: -1 },
      }).success,
    ).toBe(false);
  });

  it("exports the stable event name for capture + alerts", () => {
    expect(SYNC_HEALTH_SNAPSHOT_EVENT).toBe("sync_health_snapshot");
  });
});
