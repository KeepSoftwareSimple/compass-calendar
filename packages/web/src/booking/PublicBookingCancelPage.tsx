import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { PublicBookingApi } from "@web/api/public-booking.api";
import { getErrorStatus } from "@web/api/util/api.util";
import { PublicBookingLayout } from "@web/booking/PublicBookingLayout";
import { PublicBookingSlotSummary } from "@web/booking/PublicBookingSlotSummary";
import {
  PUBLIC_BOOKING_HEADING_CLASS,
  PublicBookingStatusMessage,
} from "@web/booking/PublicBookingStatusMessage";
import { usePublicBookingReservationQuery } from "@web/booking/public-booking.query";
import {
  type PublicBookingReservationView,
  resolvePublicBookingReservationView,
} from "@web/booking/public-booking.view";
import { useBookingDocumentTitle } from "@web/booking/use-booking-document-title";
import { useBookingHeadingFocus } from "@web/booking/use-booking-heading-focus";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import { isHigherEscapeOwner } from "@web/shortcuts/escape-ownership";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

type CancelActionState =
  | "idle"
  | "cancelling"
  | "cancelled"
  | "not-found"
  | "error";

const BOOKING_NOT_FOUND = {
  title: "Meeting not found",
  description: "This cancel link may be invalid or already used.",
} as const;

const BOOKING_CANCELED = {
  title: "Meeting canceled",
  description: "Your appointment has been canceled. You can close this page.",
} as const;

const BOOKING_CANCELLING = {
  title: "Canceling this meeting",
  description:
    "We are still removing this appointment from the host calendar. You can close this page or retry if it takes too long.",
} as const;

const BOOKING_CANCEL_FAILED = {
  title: "Could not cancel meeting",
  description: "Please try again or use the link from your calendar invite.",
} as const;

const BOOKING_LOADING = {
  title: "Loading meeting",
  description: "One moment while we load this meeting.",
} as const;

const resolveCancelPageView = (
  canLoad: boolean,
  action: CancelActionState,
  reservationQuery: ReturnType<typeof usePublicBookingReservationQuery>,
): PublicBookingReservationView => {
  if (!canLoad || action === "not-found") {
    return { kind: "status", ...BOOKING_NOT_FOUND };
  }
  if (action === "cancelled") return { kind: "status", ...BOOKING_CANCELED };
  if (action === "error") return { kind: "status", ...BOOKING_CANCEL_FAILED };
  return resolvePublicBookingReservationView(reservationQuery, {
    loading: BOOKING_LOADING,
    notFound: BOOKING_NOT_FOUND,
    loadFailed: BOOKING_CANCEL_FAILED,
    cancelled: BOOKING_CANCELED,
    cancelling: BOOKING_CANCELLING,
  });
};

export function PublicBookingCancelPage() {
  const { reservationId } = useParams({ from: ROOT_ROUTES.BOOK_CANCEL });
  const search = useSearch({ from: ROOT_ROUTES.BOOK_CANCEL });
  const navigate = useNavigate();
  const token = search.token ?? "";
  const canLoad = Boolean(reservationId && token);
  const reservationQuery = usePublicBookingReservationQuery(
    canLoad ? reservationId : "",
  );
  const [action, setAction] = useState<CancelActionState>("idle");
  const headingRef = useBookingHeadingFocus(
    `${action}:${reservationQuery.status}:${reservationQuery.data?.status ?? ""}`,
  );
  const inFlightRef = useRef(false);
  useBookingDocumentTitle("Cancel meeting");

  const handleConfirm = useCallback(async () => {
    if (!reservationId || !token || inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    setAction("cancelling");

    try {
      await PublicBookingApi.cancelReservation(reservationId, { token });
      setAction("cancelled");
    } catch (error) {
      if (getErrorStatus(error) === 404) {
        setAction("not-found");
        return;
      }
      inFlightRef.current = false;
      setAction("error");
    }
  }, [reservationId, token]);

  useEffect(() => {
    if (!canLoad || action !== "idle") {
      return;
    }
    if (reservationQuery.data?.status !== "cancelling") {
      return;
    }
    void handleConfirm();
  }, [action, canLoad, handleConfirm, reservationQuery.data?.status]);

  const handleRetry = () => {
    inFlightRef.current = false;
    setAction("idle");
  };

  const view = resolveCancelPageView(canLoad, action, reservationQuery);
  const busy = action === "cancelling";
  const isConfirmView = view.kind === "reservation";

  // Escape on the confirm view returns to the confirmation page. OverlayPanel
  // (if any) peels first. In-flight cancel must not navigate or abort.
  useAppShortcut(
    "Escape",
    (event) => {
      if (isHigherEscapeOwner()) {
        return;
      }
      if (!isConfirmView || inFlightRef.current || !reservationId) {
        return;
      }
      event.preventDefault();
      void navigate({
        to: ROOT_ROUTES.BOOK_CONFIRMED,
        params: { reservationId },
        search: token ? { token } : undefined,
      });
    },
    { enabled: isConfirmView && !busy, ignoreInputs: false },
  );

  if (view.kind === "status") {
    const bookingSlug = reservationQuery.data?.bookingSlug;
    const showRetry = action === "error";
    const showRebook =
      (action === "cancelled" ||
        reservationQuery.data?.status === "cancelled") &&
      action !== "error" &&
      action !== "not-found" &&
      Boolean(bookingSlug);
    return (
      <PublicBookingStatusMessage {...view}>
        {showRetry ? (
          <button
            type="button"
            className="c-button c-button-primary mt-6"
            onClick={handleRetry}
          >
            Retry
          </button>
        ) : null}
        {showRebook && bookingSlug ? (
          <a
            href={`/meet/${bookingSlug}`}
            className="c-focus-ring mt-4 inline-block text-accent text-sm underline"
          >
            Meet another time
          </a>
        ) : null}
      </PublicBookingStatusMessage>
    );
  }

  const { reservation } = view;
  return (
    <PublicBookingLayout>
      <section aria-busy={busy} aria-labelledby="booking-cancel-heading">
        <h1
          ref={headingRef}
          id="booking-cancel-heading"
          tabIndex={-1}
          className={PUBLIC_BOOKING_HEADING_CLASS}
        >
          Cancel this meeting?
        </h1>
        <p className="mt-2 text-sm text-text">
          You are canceling a meeting with {reservation.hostDisplayName}.
        </p>
        <p className="mt-2 text-sm text-text-muted">
          This will remove the appointment from the host calendar.
        </p>
        <div className="mt-4">
          <PublicBookingSlotSummary
            durationMinutes={reservation.durationMinutes}
            slotStart={reservation.slotStart}
            timeZone={reservation.guestTimeZone}
          />
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void handleConfirm();
          }}
          className="c-button c-button-primary mt-6"
        >
          {busy ? "Canceling..." : "Cancel this meeting"}
        </button>
      </section>
    </PublicBookingLayout>
  );
}
