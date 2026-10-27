import {
  exhaustedFailedJobLogLevel,
  resetExhaustedFailedJobLogDedupeForTests,
} from "@sync/domain/failed-job-requeue-log.util";
import { describe, expect, it } from "bun:test";

describe("exhaustedFailedJobLogLevel", () => {
  it("errors once per exhausted job id then drops to debug", () => {
    resetExhaustedFailedJobLogDedupeForTests();
    const jobs = [
      {
        id: "job-1",
        coalescingKey: "k1",
        connectionId: "c1",
        tenantId: "t1",
        principalId: "p1",
        failureClass: "transient",
        requeuedCount: 3,
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
    ];

    expect(exhaustedFailedJobLogLevel(jobs)).toBe("error");
    expect(exhaustedFailedJobLogLevel(jobs)).toBe("debug");
  });

  it("errors again when a new exhausted job appears", () => {
    resetExhaustedFailedJobLogDedupeForTests();
    const first = [
      {
        id: "job-1",
        coalescingKey: "k1",
        connectionId: "c1",
        tenantId: "t1",
        principalId: "p1",
        failureClass: "transient",
        requeuedCount: 3,
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
    ];
    expect(exhaustedFailedJobLogLevel(first)).toBe("error");

    const second = [
      ...first,
      {
        id: "job-2",
        coalescingKey: "k2",
        connectionId: "c1",
        tenantId: "t1",
        principalId: "p1",
        failureClass: "transient",
        requeuedCount: 3,
        updatedAt: new Date("2026-01-02T00:00:00Z"),
      },
    ];
    expect(exhaustedFailedJobLogLevel(second)).toBe("error");
    expect(exhaustedFailedJobLogLevel(second)).toBe("debug");
  });
});
