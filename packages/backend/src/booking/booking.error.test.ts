import { type ZodError, z } from "zod/v4";
import { Status } from "@core/errors/status.codes";
import {
  bookingError,
  toBookingErrorResponse,
} from "@backend/booking/booking.error";
import { EventMutationException } from "@backend/event/event.error";
import { describe, expect, it } from "bun:test";

describe("toBookingErrorResponse", () => {
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

  it("maps both calendar-not-connected codes to forbidden", () => {
    const next = toBookingErrorResponse(
      bookingError(
        "CALENDAR_NOT_CONNECTED",
        "Connect a healthy calendar account before enabling your meeting page",
      ),
    );
    const alias = toBookingErrorResponse(
      bookingError(
        "GOOGLE_NOT_CONNECTED",
        "Connect a healthy Google account before enabling booking",
      ),
    );
    expect(next.status).toBe(Status.FORBIDDEN);
    expect(next.body.code).toBe("CALENDAR_NOT_CONNECTED");
    expect(alias.status).toBe(Status.FORBIDDEN);
    expect(alias.body.code).toBe("GOOGLE_NOT_CONNECTED");
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
