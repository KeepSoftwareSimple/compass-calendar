import { type ObjectId } from "mongodb";
import { BaseError } from "@core/errors/errors.base";
import {
  type BookingPageStatusResponse,
  BookingPageStatusResponseSchema,
} from "@core/types/booking.contracts";
import {
  CalendarIdSchema,
  DateTimeSchema,
  type EventId,
} from "@core/types/domain-primitives";
import { type BusyAvailabilityResponse } from "@core/types/sync/availability.contracts";
import { assertBillingAllowsWrites } from "@backend/billing/billing.guard";
import { type BookingPageRecord } from "@backend/booking/booking-page.record";
import { type CalendarBookingPort } from "@backend/booking/services/calendar-booking.port";

const isBillingRequiredError = (error: unknown): boolean =>
  error instanceof BaseError && error.code === "BILLING_REQUIRED";

export const hostAllowsGuestWrites = async (
  userId: ObjectId,
): Promise<boolean> => {
  try {
    await assertBillingAllowsWrites(userId.toString());
    return true;
  } catch (error) {
    if (isBillingRequiredError(error)) {
      return false;
    }
    throw error;
  }
};

export type BookabilityProbe = {
  bookable: boolean;
  billingBlocked: boolean;
  availability: BusyAvailabilityResponse | null;
};

export async function probeBookability(
  page: BookingPageRecord,
  window: { start: Date; end: Date },
  calendarBooking: CalendarBookingPort,
  options: { excludeEventIds?: readonly EventId[] } = {},
): Promise<BookabilityProbe> {
  if (!(await hostAllowsGuestWrites(page.userId))) {
    return {
      bookable: false,
      billingBlocked: true,
      availability: null,
    };
  }

  if (window.end.getTime() <= window.start.getTime()) {
    return {
      bookable: true,
      billingBlocked: false,
      availability: null,
    };
  }

  const availability = await calendarBooking.getAvailability(
    page.userId.toString(),
    {
      calendarIds: page.blockingCalendarIds,
      start: DateTimeSchema.parse(window.start.toISOString()),
      end: DateTimeSchema.parse(window.end.toISOString()),
      ...(options.excludeEventIds
        ? { excludeEventIds: options.excludeEventIds }
        : {}),
    },
  );

  return {
    bookable: availability.bookable,
    billingBlocked: false,
    availability,
  };
}

export const emptyBookableStatus = (): BookingPageStatusResponse =>
  BookingPageStatusResponseSchema.parse({
    bookable: true,
    reasons: [],
  });

export function mapProbeToStatus(
  probe: BookabilityProbe,
): BookingPageStatusResponse {
  if (probe.billingBlocked) {
    return BookingPageStatusResponseSchema.parse({
      bookable: false,
      reasons: [{ kind: "billing", reason: "BILLING_REQUIRED" }],
    });
  }

  if (probe.bookable) {
    return emptyBookableStatus();
  }

  const reasons: BookingPageStatusResponse["reasons"] = [];
  for (const issue of probe.availability?.issues ?? []) {
    const calendarId = CalendarIdSchema.safeParse(issue.calendarId);
    reasons.push({
      kind: "calendar",
      reason: issue.reason,
      ...(calendarId.success ? { calendarId: calendarId.data } : {}),
    });
  }

  const seen = new Set<string>();
  for (const connection of probe.availability?.connections ?? []) {
    if (connection.state === "healthy") continue;
    if (seen.has(connection.connectionId)) continue;
    seen.add(connection.connectionId);
    reasons.push({
      kind: "connection",
      reason: connection.state,
      connectionState: connection.state,
    });
  }

  return BookingPageStatusResponseSchema.parse({
    bookable: false,
    reasons,
  });
}
