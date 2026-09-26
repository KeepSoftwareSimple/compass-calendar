import { PublicBookingAlert } from "@booking-web/booking/PublicBookingAlert";
import { PublicBookingDetailsStep } from "@booking-web/booking/PublicBookingDetailsStep";
import { PublicBookingGuestForm } from "@booking-web/booking/PublicBookingGuestForm";
import {
  PUBLIC_BOOKING_STICKY_STEP_CLASS,
  PublicBookingLayout,
} from "@booking-web/booking/PublicBookingLayout";
import { PublicBookingPicker } from "@booking-web/booking/PublicBookingPicker";
import { PublicBookingSkipLink } from "@booking-web/booking/PublicBookingSkipLink";
import {
  PUBLIC_BOOKING_HEADING_CLASS,
  PublicBookingStatusMessage,
} from "@booking-web/booking/PublicBookingStatusMessage";
import { PublicBookingTimezoneControl } from "@booking-web/booking/PublicBookingTimezoneControl";
import { formatDurationMinutes } from "@booking-web/booking/public-booking.format";
import { resolvePublicBookingPageView } from "@booking-web/booking/public-booking.view";
import { useBookingDocumentTitle } from "@booking-web/booking/use-booking-document-title";
import {
  isPublicBookingPageHeadingFocusPending,
  releasePublicBookingPageHeadingFocus,
  useBookingHeadingFocus,
} from "@booking-web/booking/use-booking-heading-focus";
import { usePublicBookingFlow } from "@booking-web/booking/use-public-booking-flow";
import { ROOT_ROUTES } from "@booking-web/common/constants/routes";
import { useParams } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { track } from "@web/auth/posthog/track";
import {
  formatBookingDurationWithConference,
  resolveBookingConference,
} from "@web/booking/booking-conference.copy";

const BOOKING_PAGE_NOT_FOUND = {
  title: "Meeting page not found",
  description:
    "This link may be incorrect or the host stopped taking meetings.",
} as const;

export function PublicBookingPage() {
  const { username } = useParams({ from: ROOT_ROUTES.BOOK });
  const flow = usePublicBookingFlow();
  const { pageQuery, slotsQuery } = flow;
  const focusHostHeadingRef = useRef(isPublicBookingPageHeadingFocusPending());
  const viewedSlugRef = useRef<string | null>(null);
  const pageReady = pageQuery.isSuccess && Boolean(pageQuery.data?.enabled);
  const headingRef = useBookingHeadingFocus(
    focusHostHeadingRef.current && pageReady ? username : null,
  );

  useEffect(() => {
    if (!pageQuery.isSuccess || !pageQuery.data?.enabled) return;
    if (viewedSlugRef.current === username) return;
    viewedSlugRef.current = username;
    track("booking_page_viewed", {
      duration_minutes: pageQuery.data.durationMinutes,
    });
  }, [pageQuery.data, pageQuery.isSuccess, username]);

  useEffect(() => {
    if (!focusHostHeadingRef.current || pageQuery.isPending) {
      return;
    }
    const timer = window.setTimeout(() => {
      releasePublicBookingPageHeadingFocus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pageQuery.isPending]);

  useBookingDocumentTitle(
    pageQuery.data?.enabled
      ? `Meet with ${pageQuery.data.hostDisplayName}`
      : null,
  );

  const pageView = resolvePublicBookingPageView(
    pageQuery,
    slotsQuery.data,
    BOOKING_PAGE_NOT_FOUND,
  );

  if (pageView.kind === "status") {
    return <PublicBookingStatusMessage {...pageView} />;
  }

  const { page } = pageView;

  return (
    <PublicBookingLayout wide>
      <PublicBookingSkipLink
        href={
          flow.showDetailsStep
            ? "#booking-form-heading"
            : "#booking-slots-heading"
        }
        label={
          flow.showDetailsStep ? "Skip to your details" : "Skip to open times"
        }
      />
      <header className="flex flex-col gap-1">
        <h1
          className={PUBLIC_BOOKING_HEADING_CLASS}
          ref={headingRef}
          tabIndex={-1}
        >
          Meet with {page.hostDisplayName}
        </h1>
        <p className="text-sm text-text-muted">
          {formatBookingDurationWithConference(
            formatDurationMinutes(page.durationMinutes),
            resolveBookingConference(page.conference, page.createsGoogleMeet),
          )}
        </p>
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

      {flow.showDetailsStep && flow.selectedSlotStart ? (
        <div className={PUBLIC_BOOKING_STICKY_STEP_CLASS}>
          <PublicBookingDetailsStep
            headingRef={flow.detailsHeadingRef}
            slotStart={flow.selectedSlotStart}
            durationMinutes={page.durationMinutes}
            timeZone={flow.guestTimeZone}
            disabled={flow.createReservation.isPending}
            values={flow.guestDetails}
            onChange={flow.setGuestDetails}
            onSubmit={flow.handleSubmit}
            onChangeTime={flow.handleChangeTime}
          />
        </div>
      ) : (
        <>
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

          {flow.showConflictForm ? (
            <div className={PUBLIC_BOOKING_STICKY_STEP_CLASS}>
              <PublicBookingGuestForm
                disabled={flow.createReservation.isPending}
                submitDisabled={!flow.selectedSlotStart}
                durationMinutes={page.durationMinutes}
                guestTimeZone={flow.guestTimeZone}
                values={flow.guestDetails}
                onChange={flow.setGuestDetails}
                onSubmit={flow.handleSubmit}
              />
            </div>
          ) : flow.selectedSlotStart ? null : (
            <p className="text-sm text-text-muted">
              Select a time to continue.
            </p>
          )}
        </>
      )}
    </PublicBookingLayout>
  );
}
