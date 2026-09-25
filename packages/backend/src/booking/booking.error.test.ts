import { type ZodError, z } from "zod/v4";
import { Status } from "@core/errors/status.codes";
import {
  bookingError,
  toBookingErrorResponse,
} from "@backend/booking/booking.error";
import {
  errorHandler,
  logLevelForError,
} from "@backend/common/errors/handlers/error.handler";
import { throwSyncProxyFailure } from "@backend/common/services/sync-service/sync-proxy-error";
import { type SyncClientErrorKind } from "@backend/common/services/sync-service/sync-service.client";
import { EventMutationException } from "@backend/event/event.error";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

const syncProxyFailure = (kind: SyncClientErrorKind): unknown => {
  try {
    throwSyncProxyFailure(kind, `Failed to list calendars from sync (${kind})`);
  } catch (e) {
    return e;
  }
};

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

  // A Sync restart during a deploy is operational: 503 at warn, so it opens
  // no error-tracking issue and the host can retry. A defect stays at error.
  it.each([
    ["timeout", Status.SERVICE_UNAVAILABLE, "CALENDAR_UNAVAILABLE", "warn"],
    ["unavailable", Status.SERVICE_UNAVAILABLE, "CALENDAR_UNAVAILABLE", "warn"],
    ["unexpectedStatus", Status.BAD_GATEWAY, "CALENDAR_SYNC_FAILED", "error"],
  ] as const)("maps a Sync %s to %d %s at %s", (kind, status, code, level) => {
    const log = spyOn(errorHandler, "log").mockImplementation(() => {});
    const error = syncProxyFailure(kind);

    const response = toBookingErrorResponse(error);

    expect(response.status).toBe(status);
    expect(response.body.code).toBe(code);
    expect(log).toHaveBeenCalledWith(error);
    expect(logLevelForError(error as Error)).toBe(level);
  });
});
