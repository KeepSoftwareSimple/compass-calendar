import { ObjectId } from "mongodb";
import {
  BOOKING_LIFECYCLE_DISTINCT_ID,
  BOOKING_OPERATION_EVENT,
} from "@core/types/booking-lifecycle.contracts";
import { type TimeZone } from "@core/types/domain-primitives";
import { mockEnv } from "@backend/__tests__/helpers/mock.setup";
import { bookingLifecycleAnalytics } from "@backend/booking/booking-lifecycle.analytics";
import { afterEach, describe, expect, it } from "bun:test";

const createRecord = (status: "pending" | "confirmed" = "pending") => ({
  _id: new ObjectId(),
  kind: "create" as const,
  status,
  reservationId: new ObjectId(),
  pageId: new ObjectId(),
  userId: new ObjectId(),
  calendarId: new ObjectId().toHexString(),
  eventId: new ObjectId().toHexString(),
  attemptCount: 0,
  nextAttemptAt: new Date("2026-09-14T10:00:00.000Z"),
  lastError: null,
  createdAt: new Date("2026-09-14T10:00:00.000Z"),
  updatedAt: new Date("2026-09-14T10:00:00.000Z"),
  slotStart: new Date("2026-09-14T10:00:00.000Z"),
  slotEnd: new Date("2026-09-14T10:30:00.000Z"),
  guestName: "Ada Lovelace",
  guestEmail: "ada@example.com",
  notes: "bring tea",
  guestTimeZone: "UTC" as TimeZone,
  cancelToken: "cancel-token",
});

describe("bookingLifecycleAnalytics", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("is a no-op without POSTHOG_KEY", () => {
    using _env = mockEnv({ POSTHOG_KEY: undefined });
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;

    bookingLifecycleAnalytics.emitTransition(null, createRecord());
    expect(calls).toBe(0);
  });

  it("posts an accepted operation without reservation, guest, or token fields", async () => {
    using _env = mockEnv({
      POSTHOG_KEY: "phc_test",
      POSTHOG_HOST: "https://ph.example.test",
    });
    const bodies: unknown[] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      bodies.push({ url: String(input), body: JSON.parse(String(init?.body)) });
      await gate;
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;

    const order: string[] = [];
    bookingLifecycleAnalytics.emitTransition(null, createRecord());
    order.push("returned");
    await Promise.resolve();
    expect(order).toEqual(["returned"]);
    release?.();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(bodies).toHaveLength(1);
    const payload = bodies[0] as {
      url: string;
      body: { distinct_id: string; event: string; properties: object };
    };
    expect(payload.url).toBe("https://ph.example.test/i/v0/e/");
    expect(payload.body.event).toBe(BOOKING_OPERATION_EVENT);
    expect(payload.body.distinct_id).toBe(BOOKING_LIFECYCLE_DISTINCT_ID);
    const serialized = JSON.stringify(payload.body);
    expect(serialized).not.toContain("Ada Lovelace");
    expect(serialized).not.toContain("ada@example.com");
    expect(serialized).not.toContain("bring tea");
    expect(serialized).not.toContain("cancel-token");
    expect(serialized).not.toContain("reservationId");
    expect(payload.body.properties).toMatchObject({
      environment: "test",
      source: "operation",
      operation: "create",
      phase: "accepted",
      outcome: "success",
      duration_minutes: 30,
      $lib: "compass-backend",
    });
  });

  it("does not emit a second accepted event for the same row", () => {
    using _env = mockEnv({ POSTHOG_KEY: "phc_test" });
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;
    const record = createRecord();
    bookingLifecycleAnalytics.emitTransition(null, record);
    bookingLifecycleAnalytics.emitTransition(record, record);
    expect(calls).toBe(1);
  });

  it("never throws when PostHog capture hangs or rejects", async () => {
    using _env = mockEnv({ POSTHOG_KEY: "phc_test" });
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    expect(() =>
      bookingLifecycleAnalytics.emitRequestFailure({
        operation: "create",
        code: "INVALID_INPUT",
      }),
    ).not.toThrow();
    await Promise.resolve();
  });

  it("emits request-level rate limits for mutation prefixes only", async () => {
    using _env = mockEnv({
      POSTHOG_KEY: "phc_test",
      POSTHOG_HOST: "https://ph.example.test",
    });
    const bodies: unknown[] = [];
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      bodies.push(JSON.parse(String(init?.body)));
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;

    bookingLifecycleAnalytics.emitRateLimited("booking:confirm");
    bookingLifecycleAnalytics.emitRateLimited("booking:page");
    await Promise.resolve();
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({
      event: BOOKING_OPERATION_EVENT,
      properties: {
        source: "request",
        operation: "create",
        phase: "failed",
        outcome: "rate_limited",
        reason: "rate_limited",
      },
    });
  });
});
