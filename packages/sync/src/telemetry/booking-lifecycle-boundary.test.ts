import {
  BOOKING_OPERATION_EVENT,
  BOOKING_OPERATION_HEARTBEAT_EVENT,
} from "@core/types/booking-lifecycle.contracts";
import { SYNC_HEALTH_SNAPSHOT_EVENT } from "@core/types/sync/health.contracts";
import { describe, expect, it } from "bun:test";

describe("booking lifecycle vs sync health events", () => {
  it("keeps provider health on sync_health_snapshot", () => {
    expect(SYNC_HEALTH_SNAPSHOT_EVENT).toBe("sync_health_snapshot");
    expect(BOOKING_OPERATION_EVENT).toBe("booking_operation");
    expect(BOOKING_OPERATION_HEARTBEAT_EVENT).toBe(
      "booking_operation_heartbeat",
    );
    expect(BOOKING_OPERATION_EVENT).not.toBe(SYNC_HEALTH_SNAPSHOT_EVENT);
    expect(BOOKING_OPERATION_HEARTBEAT_EVENT).not.toBe(
      SYNC_HEALTH_SNAPSHOT_EVENT,
    );
  });
});
