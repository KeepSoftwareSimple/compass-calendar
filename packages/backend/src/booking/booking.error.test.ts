import { type ZodError, z } from "zod/v4";
import { Status } from "@core/errors/status.codes";
import { PostHogExceptionTransport } from "@core/logger/posthog-exception.transport";
import {
  bookingError,
  toBookingErrorResponse,
} from "@backend/booking/booking.error";
import { throwSyncProxyFailure } from "@backend/common/services/sync-service/sync-proxy-error";
import { EventMutationException } from "@backend/event/event.error";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

describe("toBookingErrorResponse", () => {
  afterEach(() => {
    mock.restore();
  });

  it("maps BookingException to its code and status", () => {
    const { status, body } = toBookingErrorResponse(
      bookingError("SLOT_UNAVAILABLE", "Selected slot is no longer available"),
    );
    expect(status).toBe(Status.CONFLICT);
    expect(body).toEqual({
      code: "SLOT_UNAVAILABLE",
      message: "Selected slot is no longer available",
    });
  });

  it("maps AVAILABILITY_REQUIRED to bad request", () => {
    const { status, body } = toBookingErrorResponse(
      bookingError(
        "AVAILABILITY_REQUIRED",
        "Add weekly hours before turning on your meeting page",
      ),
    );
    expect(status).toBe(Status.BAD_REQUEST);
    expect(body.code).toBe("AVAILABILITY_REQUIRED");
  });

  it("maps calendar-not-connected to forbidden", () => {
    const next = toBookingErrorResponse(
      bookingError(
        "CALENDAR_NOT_CONNECTED",
        "Connect a healthy calendar account before enabling your meeting page",
      ),
    );
    expect(next.status).toBe(Status.FORBIDDEN);
    expect(next.body.code).toBe("CALENDAR_NOT_CONNECTED");
  });

  it("returns a generic message for ZodError without leaking issue paths", () => {
    const result = z
      .strictObject({ cancelTokenHash: z.string() })
      .safeParse({});
    expect(result.success).toBe(false);
    const { status, body } = toBookingErrorResponse(result.error as ZodError);
    expect(status).toBe(Status.BAD_REQUEST);
    expect(body).toEqual({ code: "INVALID_INPUT", message: "Invalid input" });
    expect(JSON.stringify(body)).not.toContain("cancelTokenHash");
  });

  it("maps SLUG_TAKEN to conflict", () => {
    const { status, body } = toBookingErrorResponse(
      bookingError("SLUG_TAKEN", "That address is already taken"),
    );
    expect(status).toBe(Status.CONFLICT);
    expect(body).toEqual({
      code: "SLUG_TAKEN",
      message: "That address is already taken",
    });
  });

  it("maps EventMutationException version conflicts to RESERVATION_CONFLICT", () => {
    const { status, body } = toBookingErrorResponse(
      new EventMutationException(
        "RECURRENCE_CONFLICT",
        "Event was modified elsewhere",
      ),
    );
    expect(status).toBe(Status.CONFLICT);
    expect(body).toEqual({
      code: "RESERVATION_CONFLICT",
      message: "This meeting was changed. Try again.",
    });
  });

  it("maps a sync timeout to a retryable 503 kept out of error tracking", () => {
    const captured = spyOn(PostHogExceptionTransport.prototype, "log");
    let thrown: unknown;
    try {
      throwSyncProxyFailure(
        "timeout",
        "Failed to list calendars from sync (timeout)",
      );
    } catch (e) {
      thrown = e;
    }

    const { status, body } = toBookingErrorResponse(thrown);

    expect(status).toBe(Status.SERVICE_UNAVAILABLE);
    expect(body).toEqual({
      code: "TEMPORARILY_UNAVAILABLE",
      message: "Booking is temporarily unavailable. Try again shortly.",
    });
    expect(captured).not.toHaveBeenCalled();
  });

  it("still sends a non-operational failure to error tracking", () => {
    const captured = spyOn(PostHogExceptionTransport.prototype, "log");

    toBookingErrorResponse(new Error("unexpected"));

    expect(captured).toHaveBeenCalled();
  });

  it("returns INTERNAL_ERROR without echoing the internal message", () => {
    const { status, body } = toBookingErrorResponse(
      new Error("mongo connection string leaked"),
    );
    expect(status).toBe(Status.INTERNAL_SERVER);
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.message).not.toContain("mongo");
  });

  it("returns INTERNAL_ERROR for non-Error throwables", () => {
    const { status, body } = toBookingErrorResponse("boom");
    expect(status).toBe(Status.INTERNAL_SERVER);
    expect(body.code).toBe("INTERNAL_ERROR");
  });
});
