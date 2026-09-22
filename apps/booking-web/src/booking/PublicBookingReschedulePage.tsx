import { PublicBookingNotFoundError } from "@booking-web/api/public-booking.api";
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
  PUBLIC_BOOKING_UNBOOKABLE,
  type PublicBookingReservationView,
  resolvePublicBookingReservationView,
} from "@booking-web/booking/public-booking.view";
import { useBookingDocumentTitle } from "@booking-web/booking/use-booking-document-title";
import { useBookingHeadingFocus } from "@booking-web/booking/use-booking-heading-focus";
import { usePublicBookingRescheduleFlow } from "@booking-web/booking/use-public-booking-reschedule-flow";

const BOOKING_LOADING = {
  title: "Loading meeting",
  description: "One moment while we load this meeting.",
} as const;

const BOOKING_NOT_FOUND = {
  title: "Meeting not found",
  description: "This reschedule link may be invalid or already used.",
} as const;

const BOOKING_LOAD_FAILED = {
  title: "Could not load meeting",
  description: "Please refresh and try again.",
} as const;

const BOOKING_CANCELED = {
  title: "This meeting was canceled",
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
  useBookingDocumentTitle("Reschedule meeting");

  if (reservationView.kind === "status") {
    return <PublicBookingStatusMessage {...reservationView} />;
  }

  const { reservation } = reservationView;

  if (pageQuery.isLoading) {
    return (
      <PublicBookingStatusMessage
        title="Loading meeting page"
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
    return <PublicBookingStatusMessage {...PUBLIC_BOOKING_UNBOOKABLE} />;
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
    loading: BOOKING_LOADING,
    notFound: BOOKING_NOT_FOUND,
    loadFailed: BOOKING_LOAD_FAILED,
    cancelled: BOOKING_CANCELED,
  });
};
