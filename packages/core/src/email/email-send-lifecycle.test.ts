import { emailSendHeartbeatProperties } from "@core/email/email-send-lifecycle";
import { describe, expect, it } from "bun:test";

describe("emailSendHeartbeatProperties", () => {
  it("computes oldest queued age from sendAt", () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const sendAt = new Date("2026-09-14T11:50:00.000Z");
    const properties = emailSendHeartbeatProperties({
      environment: "staging",
      version: "0.5.0",
      queuedCount: 2,
      oldestQueuedSendAt: sendAt,
      failedCount24h: 1,
      now,
    });
    expect(properties).toMatchObject({
      queued_count: 2,
      oldest_queued_age_ms: 10 * 60 * 1000,
      failed_count_24h: 1,
      service: "compass-backend",
    });
  });

  it("returns null oldest age when the queue is empty", () => {
    const properties = emailSendHeartbeatProperties({
      environment: "staging",
      version: "0.5.0",
      queuedCount: 0,
      oldestQueuedSendAt: null,
      failedCount24h: 0,
    });
    expect(properties.oldest_queued_age_ms).toBeNull();
  });
});
