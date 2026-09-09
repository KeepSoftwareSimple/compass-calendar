import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import {
  type BookingPageStatusReason,
  type BookingPageStatusResponse,
} from "@core/types/booking.contracts";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import {
  createMockCalendar,
  createMockConnection,
} from "@web/__tests__/utils/factories/calendar.factory";
import { RECONNECT_CALENDAR_LABEL } from "@web/auth/providers/provider-copy.util";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import { BookingStatusHeader } from "@web/booking/BookingStatusHeader";
import {
  BOOKING_BILLING_STATUS_COPY,
  BOOKING_DELAYED_STATUS_COPY,
  BOOKING_IMPORTING_STATUS_COPY,
  BOOKING_NOT_BOOKABLE_PREFIX,
} from "@web/booking/booking-bookability.copy";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import { describe, expect, it } from "bun:test";

const calendarId = CalendarIdSchema.parse(createObjectIdString());
const workCalendar = createMockCalendar({ id: calendarId, name: "Work" });
const bookingUrl = "https://compasscalendar.com/meet/hostuser";
const connection = createMockConnection("host@example.com", {
  connectionState: "RECONNECT_REQUIRED",
  state: "actionRequired",
});

const renderHeader = (
  status: BookingPageStatusResponse | undefined,
  reasonOverrides: {
    connections?: (typeof connection)[];
  } = {},
) => {
  userMetadataActions.set({
    google: {
      connectionState: "HEALTHY",
      connections: reasonOverrides.connections ?? [connection],
    },
  });
  const { wrapper } = createStoreWrapper();
  return render(
    <BookingStatusHeader
      addressPreview={null}
      bookingUrl={bookingUrl}
      calendars={[workCalendar]}
      connections={reasonOverrides.connections ?? [connection]}
      isLive
      isPending={false}
      onToggle={() => undefined}
      status={status}
    />,
    { wrapper },
  );
};

const unbookable = (
  reasons: BookingPageStatusReason[],
): BookingPageStatusResponse => ({
  bookable: false,
  reasons,
});

describe("BookingStatusHeader", () => {
  it("renders no bookability line when status is bookable", () => {
    renderHeader({ bookable: true, reasons: [] });

    expect(screen.getByLabelText("Meeting link")).toHaveValue(bookingUrl);
    expect(
      screen.queryByText(new RegExp(BOOKING_NOT_BOOKABLE_PREFIX)),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: RECONNECT_CALENDAR_LABEL.google }),
    ).not.toBeInTheDocument();
  });

  it("renders reconnect only for actionRequired connections", () => {
    renderHeader(
      unbookable([
        {
          kind: "connection",
          reason: "actionRequired",
          connectionState: "actionRequired",
        },
      ]),
    );

    expect(
      screen.getByText(
        /Guests can't book right now: Google Calendar needs reconnecting/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: RECONNECT_CALENDAR_LABEL.google }),
    ).toBeInTheDocument();
  });

  it("renders reconnect for a disconnected connection", () => {
    const disconnected = createMockConnection("host@example.com", {
      connectionState: "RECONNECT_REQUIRED",
      state: "disconnected",
    });
    renderHeader(
      unbookable([
        {
          kind: "connection",
          reason: "disconnected",
          connectionState: "disconnected",
        },
      ]),
      { connections: [disconnected] },
    );

    expect(
      screen.getByRole("button", { name: RECONNECT_CALENDAR_LABEL.google }),
    ).toBeInTheDocument();
  });

  it("renders importing copy without a reconnect button", () => {
    renderHeader(
      unbookable([
        {
          kind: "connection",
          reason: "importing",
          connectionState: "importing",
        },
      ]),
      { connections: [] },
    );

    expect(
      screen.getByText(
        `${BOOKING_NOT_BOOKABLE_PREFIX}: ${BOOKING_IMPORTING_STATUS_COPY}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: RECONNECT_CALENDAR_LABEL.google }),
    ).not.toBeInTheDocument();
  });

  it("renders delayed copy without a reconnect button", () => {
    renderHeader(
      unbookable([
        {
          kind: "connection",
          reason: "delayed",
          connectionState: "delayed",
        },
      ]),
      { connections: [] },
    );

    expect(
      screen.getByText(
        `${BOOKING_NOT_BOOKABLE_PREFIX}: ${BOOKING_DELAYED_STATUS_COPY}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: RECONNECT_CALENDAR_LABEL.google }),
    ).not.toBeInTheDocument();
  });

  it("names a stale blocking calendar", () => {
    renderHeader(
      unbookable([{ kind: "calendar", reason: "stale", calendarId }]),
      { connections: [] },
    );

    expect(
      screen.getByText(
        `${BOOKING_NOT_BOOKABLE_PREFIX}: Work hasn't synced recently. Guests can book once it catches up.`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: RECONNECT_CALENDAR_LABEL.google }),
    ).not.toBeInTheDocument();
  });

  it("falls back when a notImported calendar is unnamed", () => {
    renderHeader(unbookable([{ kind: "calendar", reason: "notImported" }]), {
      connections: [],
    });

    expect(
      screen.getByText(
        `${BOOKING_NOT_BOOKABLE_PREFIX}: A blocking calendar is no longer synced. Remove it from Blocking calendars or reconnect the account.`,
      ),
    ).toBeInTheDocument();
  });

  it("renders billing copy", () => {
    renderHeader(
      unbookable([{ kind: "billing", reason: "BILLING_REQUIRED" }]),
      { connections: [] },
    );

    expect(
      screen.getByText(
        `${BOOKING_NOT_BOOKABLE_PREFIX}: ${BOOKING_BILLING_STATUS_COPY}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: RECONNECT_CALENDAR_LABEL.google }),
    ).not.toBeInTheDocument();
  });
});
