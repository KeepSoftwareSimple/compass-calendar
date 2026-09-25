import { PublicBookingAlert } from "@booking-web/booking/PublicBookingAlert";
import {
  PUBLIC_BOOKING_STICKY_STEP_CLASS,
  PublicBookingLayout,
} from "@booking-web/booking/PublicBookingLayout";
import { PublicBookingPicker } from "@booking-web/booking/PublicBookingPicker";
import { PublicBookingSkipLink } from "@booking-web/booking/PublicBookingSkipLink";
import { PublicBookingSlotSummary } from "@booking-web/booking/PublicBookingSlotSummary";
import {
  PUBLIC_BOOKING_HEADING_CLASS,
  PublicBookingStatusMessage,
} from "@booking-web/booking/PublicBookingStatusMessage";
import { PublicBookingTimezoneControl } from "@booking-web/booking/PublicBookingTimezoneControl";
import { type usePublicBookingReservationQuery } from "@booking-web/booking/public-booking.query";
import {
  PUBLIC_BOOKING_CANCELLED,
  PUBLIC_BOOKING_LOAD_FAILED,
  PUBLIC_BOOKING_RESERVATION_LOADING,
  type PublicBookingReservationView,
  resolvePublicBookingPageView,
  resolvePublicBookingReservationView,
} from "@booking-web/booking/public-booking.view";
import { useBookingDocumentTitle } from "@booking-web/booking/use-booking-document-title";
import { useBookingHeadingFocus } from "@booking-web/booking/use-booking-heading-focus";
import { usePublicBookingRescheduleFlow } from "@booking-web/booking/use-public-booking-reschedule-flow";

const BOOKING_NOT_FOUND = {
  title: "Meeting not found",
  description: "This reschedule link may be invalid or already used.",
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
  useBookingDocumentTitle("Reschedule meeting");

  if (reservationView.kind === "status") {
    return <PublicBookingStatusMessage {...reservationView} />;
  }

  const { reservation } = reservationView;
  const pageView = resolvePublicBookingPageView(
    pageQuery,
    slotsQuery.data,
    BOOKING_NOT_FOUND,
  );

  if (pageView.kind === "status") {
    return <PublicBookingStatusMessage {...pageView} />;
  }

  const { page } = pageView;
  const busy = flow.rescheduleReservation.isPending;

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
          Reschedule your meeting with {reservation.hostDisplayName}
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
          message={flow.alertMessage}
          alertRef={flow.alertRef}
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
    loading: PUBLIC_BOOKING_RESERVATION_LOADING,
    notFound: BOOKING_NOT_FOUND,
    loadFailed: PUBLIC_BOOKING_LOAD_FAILED,
    cancelled: PUBLIC_BOOKING_CANCELLED,
  });
};
