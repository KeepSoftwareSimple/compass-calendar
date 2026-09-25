import { ZodError, z } from "zod/v4";
import { BaseError } from "@core/errors/errors.base";
import { Status } from "@core/errors/status.codes";
import { Logger } from "@core/logger/winston.logger";
import { errorHandler } from "@backend/common/errors/handlers/error.handler";
import { SyncProxyFailure } from "@backend/common/services/sync-service/sync-proxy-error";
import { EventMutationException } from "@backend/event/event.error";

const logger = Logger("app:booking.error");

export const BookingErrorCodeSchema = z.enum([
  "CALENDAR_NOT_CONNECTED",
  "DESTINATION_NOT_WRITABLE",
  "TIMEZONE_REQUIRED",
  "AVAILABILITY_REQUIRED",
  "BLOCKING_CALENDAR_INVALID",
  "INVALID_INPUT",
  "BILLING_REQUIRED",
  "PAGE_NOT_FOUND",
  "SLUG_TAKEN",
  "SLOT_UNAVAILABLE",
  "RESERVATION_CONFLICT",
  "RESERVATION_NOT_FOUND",
  "CALENDAR_UNAVAILABLE",
  "CALENDAR_SYNC_FAILED",
  "INTERNAL_ERROR",
]);
export type BookingErrorCode = z.infer<typeof BookingErrorCodeSchema>;

const STATUS_BY_CODE: Record<BookingErrorCode, Status> = {
  CALENDAR_NOT_CONNECTED: Status.FORBIDDEN,
  DESTINATION_NOT_WRITABLE: Status.FORBIDDEN,
  TIMEZONE_REQUIRED: Status.BAD_REQUEST,
  AVAILABILITY_REQUIRED: Status.BAD_REQUEST,
  BLOCKING_CALENDAR_INVALID: Status.BAD_REQUEST,
  INVALID_INPUT: Status.BAD_REQUEST,
  BILLING_REQUIRED: Status.FORBIDDEN,
  PAGE_NOT_FOUND: Status.NOT_FOUND,
  SLUG_TAKEN: Status.CONFLICT,
  SLOT_UNAVAILABLE: Status.CONFLICT,
  RESERVATION_CONFLICT: Status.CONFLICT,
  RESERVATION_NOT_FOUND: Status.NOT_FOUND,
  CALENDAR_UNAVAILABLE: Status.SERVICE_UNAVAILABLE,
  CALENDAR_SYNC_FAILED: Status.BAD_GATEWAY,
  INTERNAL_ERROR: Status.INTERNAL_SERVER,
};

const SYNC_FAILURE_MESSAGE = {
  CALENDAR_UNAVAILABLE:
    "Calendar is not reachable right now. Try again shortly.",
  CALENDAR_SYNC_FAILED: "Could not check the calendar. Please try again.",
} as const;

export class BookingException extends BaseError {
  constructor(
    public readonly bookingCode: BookingErrorCode,
    message: string,
  ) {
    super(bookingCode, message, STATUS_BY_CODE[bookingCode], true, bookingCode);
  }
}

export const bookingError = (
  code: BookingErrorCode,
  message: string,
): BookingException => new BookingException(code, message);

export const toBookingErrorResponse = (
  e: unknown,
): { status: Status; body: { code: BookingErrorCode; message: string } } => {
  if (e instanceof BookingException) {
    return {
      status: e.statusCode,
      body: { code: e.bookingCode, message: e.message },
    };
  }

  if (e instanceof EventMutationException) {
    if (e.mutationCode === "RECURRENCE_CONFLICT") {
      return {
        status: STATUS_BY_CODE.RESERVATION_CONFLICT,
        body: {
          code: "RESERVATION_CONFLICT",
          message: "This meeting was changed. Try again.",
        },
      };
    }
  }

  if (e instanceof ZodError) {
    // Issue paths name internal schema fields; log them, don't return them.
    logger.warn(
      `Booking input rejected: ${e.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
    return {
      status: STATUS_BY_CODE.INVALID_INPUT,
      body: { code: "INVALID_INPUT", message: "Invalid input" },
    };
  }

  if (e instanceof SyncProxyFailure) {
    // Logs a Sync restart (503) at warn and a Sync defect (502) at error.
    errorHandler.log(e);
    const code =
      e.statusCode === Status.SERVICE_UNAVAILABLE
        ? "CALENDAR_UNAVAILABLE"
        : "CALENDAR_SYNC_FAILED";
    return {
      status: STATUS_BY_CODE[code],
      body: { code, message: SYNC_FAILURE_MESSAGE[code] },
    };
  }

  if (e instanceof BaseError && e.code) {
    const code = e.code as BookingErrorCode;
    if (code in STATUS_BY_CODE) {
      return {
        status: STATUS_BY_CODE[code],
        body: { code, message: e.description },
      };
    }
  }

  // Route through errorHandler.log rather than logger.error directly: it
  // applies logLevelForError, which downgrades an operational 503 (e.g. a
  // sync-service timeout surfacing here as a plain BaseError with no booking
  // code) to `warn` so it stops being captured by PostHogExceptionTransport
  // and auto-filed as a GitHub issue for what is really upstream downtime.
  if (e instanceof Error) {
    errorHandler.log(e);
  } else {
    logger.error(`Unexpected booking error: ${e}`);
  }
  return {
    status: STATUS_BY_CODE.INTERNAL_ERROR,
    body: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong. Please try again.",
    },
  };
};
