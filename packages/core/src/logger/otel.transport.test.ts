import { buildOtelAttributes } from "./otel.transport";
import { describe, expect, it } from "bun:test";

function gaxiosError(message: string): Error {
  return Object.assign(new Error(message), {
    config: { headers: { Authorization: "Bearer super-secret-token" } },
    response: { status: 403 },
  });
}

describe("buildOtelAttributes", () => {
  it("formats an Error-valued cause into a safe chain string and root_cause", () => {
    const attrs = buildOtelAttributes({
      level: "error",
      message: "Sync job engine failed",
      cause: new Error("Sync job subscriptionMaintain (abc) attempt 1 failed", {
        cause: gaxiosError("Google refused to open the channel"),
      }),
    });

    expect(attrs["cause"]).toBe(
      "Error: Sync job subscriptionMaintain (abc) attempt 1 failed <- Error: Google refused to open the channel",
    );
    expect(attrs["root_cause"]).toBe("Google refused to open the channel");
  });

  it("drops a non-Error cause instead of stringifying it", () => {
    const attrs = buildOtelAttributes({
      level: "error",
      message: "odd",
      cause: { headers: { Authorization: "Bearer super-secret-token" } },
    });

    expect(attrs["cause"]).toBeUndefined();
    expect(attrs["root_cause"]).toBeUndefined();
    expect(JSON.stringify(attrs)).not.toContain("super-secret-token");
  });

  it("formats any other Error-valued field via the safe chain, not raw", () => {
    const attrs = buildOtelAttributes({
      level: "error",
      message: "x",
      err: gaxiosError("boom"),
    });

    expect(attrs["err"]).toBe("Error: boom");
    expect(JSON.stringify(attrs)).not.toContain("super-secret-token");
  });

  it("drops unsafe meta keys outright", () => {
    const attrs = buildOtelAttributes({
      level: "error",
      message: "x",
      config: { headers: { Authorization: "Bearer super-secret-token" } },
      refresh_token: "rt-123",
      resourceId: "res-1",
    });

    expect(attrs["config"]).toBeUndefined();
    expect(attrs["refresh_token"]).toBeUndefined();
    expect(attrs["resourceId"]).toBe("res-1");
  });

  it("keeps scalar values and JSON-stringifies plain objects", () => {
    const attrs = buildOtelAttributes({
      level: "error",
      message: "x",
      count: 3,
      active: true,
      tags: ["a", "b"],
    });

    expect(attrs["count"]).toBe(3);
    expect(attrs["active"]).toBe(true);
    expect(attrs["tags"]).toBe('["a","b"]');
  });

  it("redacts booking URLs and drops reservation identifiers", () => {
    const attrs = buildOtelAttributes({
      level: "info",
      message: "request",
      path: "/api/booking/reservations/507f1f77bcf86cd799439011?token=sentinel-capability-token-9f3c",
      reservationId: "507f1f77bcf86cd799439011",
      slug: "sentinel-host-slug",
    });

    expect(attrs["path"]).toBe("/api/booking/reservations/:reservationId");
    expect(attrs["reservationId"]).toBeUndefined();
    expect(attrs["slug"]).toBeUndefined();
    expect(JSON.stringify(attrs)).not.toContain(
      "sentinel-capability-token-9f3c",
    );
    expect(JSON.stringify(attrs)).not.toContain("507f1f77bcf86cd799439011");
    expect(JSON.stringify(attrs)).not.toContain("sentinel-host-slug");
  });
});
