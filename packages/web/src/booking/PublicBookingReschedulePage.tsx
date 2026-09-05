import { PublicBookingNotFoundError } from "@web/api/public-booking.api";
import { PublicBookingAlert } from "@web/booking/PublicBookingAlert";
import {
  PUBLIC_BOOKING_STICKY_STEP_CLASS,
  PublicBookingLayout,
} from "@web/booking/PublicBookingLayout";
import { PublicBookingPicker } from "@web/booking/PublicBookingPicker";
import { PublicBookingSkipLink } from "@web/booking/PublicBookingSkipLink";
import { PublicBookingSlotSummary } from "@web/booking/PublicBookingSlotSummary";
import {
  PUBLIC_BOOKING_HEADING_CLASS,
  PublicBookingStatusMessage,
} from "@web/booking/PublicBookingStatusMessage";
import { PublicBookingTimezoneControl } from "@web/booking/PublicBookingTimezoneControl";
import { type usePublicBookingReservationQuery } from "@web/booking/public-booking.query";
import {
  type PublicBookingReservationView,
  resolvePublicBookingReservationView,
} from "@web/booking/public-booking.view";
import { useBookingDocumentTitle } from "@web/booking/use-booking-document-title";
import { useBookingHeadingFocus } from "@web/booking/use-booking-heading-focus";
import { usePublicBookingRescheduleFlow } from "@web/booking/use-public-booking-reschedule-flow";

const BOOKING_LOADING = {
  title: "Loading booking",
  description: "One moment while we load this booking.",
} as const;

const BOOKING_NOT_FOUND = {
  title: "Booking not found",
  description: "This reschedule link may be invalid or already used.",
} as const;

const BOOKING_LOAD_FAILED = {
  title: "Could not load booking",
  description: "Please refresh and try again.",
} as const;

const BOOKING_CANCELED = {
  title: "This booking was canceled",
  description:
    "The appointment is no longer on the host calendar. You can close this page.",
} as const;

export function PublicBookingReschedulePage() {
  const flow = usePublicBookingRescheduleFlow();
  const { reservationQuery, pageQuery, slotsQuery } = flow;
  const reservationView = resolveReschedulePageView(
    flow.canLoad,
    reservationQuery,
  );
  const hostDisplayName =
    reservationView.kind === "reservation"
      ? reservationView.reservation.hostDisplayName
      : "";
  const headingRef = useBookingHeadingFocus(
    reservationView.kind === "reservation" && pageQuery.isSuccess
      ? hostDisplayName
      : null,
  );
  useBookingDocumentTitle("Reschedule booking");

  if (reservationView.kind === "status") {
    return <PublicBookingStatusMessage {...reservationView} />;
  }

  const { reservation } = reservationView;

  if (pageQuery.isLoading) {
    return (
      <PublicBookingStatusMessage
        title="Loading booking page"
        description="One moment while we load available times."
      />
    );
  }

  if (
    pageQuery.error instanceof PublicBookingNotFoundError ||
    (pageQuery.isSuccess && !pageQuery.data.enabled)
  ) {
    return <PublicBookingStatusMessage {...BOOKING_NOT_FOUND} />;
  }

  if (pageQuery.isError || !pageQuery.isSuccess || !pageQuery.data) {
    return <PublicBookingStatusMessage {...BOOKING_LOAD_FAILED} />;
  }

  const page = pageQuery.data;
  const busy = flow.rescheduleReservation.isPending;

  if (slotsQuery.data && !slotsQuery.data.bookable) {
    return (
      <PublicBookingStatusMessage
        title="Booking temporarily unavailable"
        description="The host calendar is not ready for new bookings. Please try again later."
      />
    );
  }

  return (
    <PublicBookingLayout wide>
      <PublicBookingSkipLink
        href="#booking-slots-heading"
        label="Skip to open times"
      />
      <header className="flex flex-col gap-1">
        <h1
          className={PUBLIC_BOOKING_HEADING_CLASS}
          id="booking-reschedule-heading"
          ref={headingRef}
          tabIndex={-1}
        >
          Reschedule your booking with {reservation.hostDisplayName}
        </h1>
        <p className="text-sm text-text-muted">Current time</p>
        <PublicBookingSlotSummary
          durationMinutes={reservation.durationMinutes}
          slotStart={reservation.slotStart}
          timeZone={reservation.guestTimeZone}
        />
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-text-muted">
          <p>Times shown in your timezone</p>
          <PublicBookingTimezoneControl
            timeZone={flow.guestTimeZone}
            onChange={flow.handleTimeZoneChange}
          />
        </div>
      </header>

      {flow.alertMessage ? (
        <PublicBookingAlert
          alertRef={flow.alertRef}
          message={flow.alertMessage}
        />
      ) : null}

      <PublicBookingPicker
        monthKey={flow.monthKey}
        timeZone={flow.guestTimeZone}
        maxHorizonDays={page.maxHorizonDays}
        slots={slotsQuery.data?.slots ?? []}
        slotsPending={flow.slotsPending}
        slotsError={flow.slotsError}
        slotsFetching={flow.slotsFetching}
        selectedDateKey={flow.selectedDateKey}
        selectedSlotStart={flow.selectedSlotStart}
        slotsHeadingRef={flow.pickerHeadingRef}
        onMonthChange={flow.handleMonthChange}
        onPrefetchMonth={flow.handlePrefetchMonth}
        onSelectDate={flow.handleSelectDay}
        onSelectSlot={flow.handleSelectSlot}
        onJumpToNextAvailable={() => {
          void flow.handleJumpToNextAvailable();
        }}
        onRetrySlots={() => {
          void slotsQuery.refetch();
        }}
      />

      {flow.selectedSlotStart ? (
        <div className={PUBLIC_BOOKING_STICKY_STEP_CLASS}>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void flow.handleConfirm();
            }}
            className="c-button c-button-primary"
          >
            {busy ? "Confirming..." : "Confirm"}
          </button>
        </div>
      ) : (
        <p className="text-sm text-text-muted">Select a time to continue.</p>
      )}
    </PublicBookingLayout>
  );
}

const resolveReschedulePageView = (
  canLoad: boolean,
  reservationQuery: ReturnType<typeof usePublicBookingReservationQuery>,
): PublicBookingReservationView => {
  if (!canLoad) {
    return { kind: "status", ...BOOKING_NOT_FOUND };
  }
  return resolvePublicBookingReservationView(reservationQuery, {
    loading: BOOKING_LOADING,
    notFound: BOOKING_NOT_FOUND,
    loadFailed: BOOKING_LOAD_FAILED,
    cancelled: BOOKING_CANCELED,
  });
};
