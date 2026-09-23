import { getErrorStatus } from "@booking-web/api/public-booking-http";
import { PublicBookingConfirmationView } from "@booking-web/booking/PublicBookingConfirmationView";
import { PublicBookingEditDetailsForm } from "@booking-web/booking/PublicBookingEditDetailsForm";
import { PublicBookingStatusMessage } from "@booking-web/booking/PublicBookingStatusMessage";
import {
  usePatchPublicBookingReservationMutation,
  usePublicBookingReservationQuery,
} from "@booking-web/booking/public-booking.query";
import {
  type PublicBookingReservationView,
  resolvePublicBookingReservationView,
} from "@booking-web/booking/public-booking.view";
import {
  guestActionUrlFromHistory,
  publicCancelUrlForReservation,
  publicRescheduleUrlForReservation,
  tokenFromGuestActionUrl,
} from "@booking-web/booking/public-booking-search";
import { useBookingDocumentTitle } from "@booking-web/booking/use-booking-document-title";
import { requestPublicBookingPageHeadingFocus } from "@booking-web/booking/use-booking-heading-focus";
import { ROOT_ROUTES } from "@booking-web/common/constants/routes";
import { useBookingShortcut } from "@booking-web/shortcuts/useBookingShortcut";
import {
  useNavigate,
  useParams,
  useRouterState,
  useSearch,
} from "@tanstack/react-router";
import { useState } from "react";

const BOOKING_LOADING = {
  title: "Loading meeting",
  description: "One moment while we load this confirmation.",
} as const;

const BOOKING_NOT_FOUND = {
  title: "Meeting not found",
  description:
    "This confirmation link may be incorrect or no longer available.",
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

const BOOKING_CANCELLING = {
  title: "This meeting is being canceled",
  description:
    "We are still removing this appointment from the host calendar. You can close this page.",
} as const;

const resolveConfirmedPageView = (
  reservationQuery: ReturnType<typeof usePublicBookingReservationQuery>,
): PublicBookingReservationView =>
  resolvePublicBookingReservationView(reservationQuery, {
    loading: BOOKING_LOADING,
    notFound: BOOKING_NOT_FOUND,
    loadFailed: BOOKING_LOAD_FAILED,
    cancelled: BOOKING_CANCELED,
    cancelling: BOOKING_CANCELLING,
  });

function cancelUrlFromHistory(state: unknown): string | undefined {
  return guestActionUrlFromHistory(state, "cancelUrl");
}

function rescheduleUrlFromHistory(state: unknown): string | undefined {
  return guestActionUrlFromHistory(state, "rescheduleUrl");
}

export function PublicBookingConfirmedPage() {
  const { reservationId } = useParams({
    from: ROOT_ROUTES.BOOK_CONFIRMED,
  });
  const { token: searchToken } = useSearch({
    from: ROOT_ROUTES.BOOK_CONFIRMED,
  });
  const historyCancelUrl = useRouterState({
    select: (routerState) => cancelUrlFromHistory(routerState.location.state),
  });
  const historyRescheduleUrl = useRouterState({
    select: (routerState) =>
      rescheduleUrlFromHistory(routerState.location.state),
  });
  const token =
    searchToken ||
    (historyCancelUrl ? tokenFromGuestActionUrl(historyCancelUrl) : "") ||
    (historyRescheduleUrl ? tokenFromGuestActionUrl(historyRescheduleUrl) : "");
  const cancelUrl =
    historyCancelUrl ??
    (token
      ? publicCancelUrlForReservation(
          reservationId,
          token,
          window.location.origin,
        )
      : undefined);
  const rescheduleUrl =
    historyRescheduleUrl ??
    (token
      ? publicRescheduleUrlForReservation(
          reservationId,
          token,
          window.location.origin,
        )
      : undefined);
  const reservationQuery = usePublicBookingReservationQuery(reservationId);
  const patchReservation =
    usePatchPublicBookingReservationMutation(reservationId);
  const [isEditing, setIsEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  useBookingDocumentTitle("Meeting confirmed");
  const navigate = useNavigate();

  const view = resolveConfirmedPageView(reservationQuery);
  const bookingSlug =
    view.kind === "reservation" ? (view.reservation.bookingSlug ?? "") : "";
  const canEdit = view.kind === "reservation" && token.length > 0;

  // Escape returns to the host's public page. OverlayPanel peels first.
  // An open edit form backs out one step. Unknown and cancelled views have
  // no slug path, so they stay put.
  useBookingShortcut(
    "Escape",
    (event) => {
      event.preventDefault();
      if (isEditing) {
        setIsEditing(false);
        setSaveError(null);
        return;
      }
      requestPublicBookingPageHeadingFocus();
      void navigate({
        to: ROOT_ROUTES.BOOK,
        params: { username: bookingSlug },
      });
    },
    { enabled: bookingSlug.length > 0, ignoreInputs: false },
  );

  if (view.kind === "status") {
    return <PublicBookingStatusMessage {...view} />;
  }

  const { reservation } = view;

  if (isEditing && canEdit) {
    return (
      <PublicBookingEditDetailsForm
        guestName={reservation.guestName}
        notes={reservation.notes ?? ""}
        disabled={patchReservation.isPending}
        error={saveError}
        onCancel={() => {
          setIsEditing(false);
          setSaveError(null);
        }}
        onSubmit={(values) => {
          setSaveError(null);
          patchReservation.mutate(
            { token, name: values.name, notes: values.notes },
            {
              onSuccess: () => {
                setIsEditing(false);
              },
              onError: (error) => {
                setSaveError(
                  getErrorStatus(error) === 404
                    ? "This meeting could not be updated. Use the link in your invite."
                    : "Could not save your details. Please try again.",
                );
              },
            },
          );
        }}
      />
    );
  }

  return (
    <PublicBookingConfirmationView
      hostDisplayName={reservation.hostDisplayName}
      guestName={reservation.guestName}
      notes={reservation.notes}
      durationMinutes={reservation.durationMinutes}
      slotStart={reservation.slotStart}
      timeZone={reservation.guestTimeZone}
      conference={reservation.conference}
      createsGoogleMeet={reservation.createsGoogleMeet}
      cancelUrl={cancelUrl}
      rescheduleUrl={rescheduleUrl}
      onEditDetails={
        canEdit
          ? () => {
              setSaveError(null);
              setIsEditing(true);
            }
          : undefined
      }
    />
  );
}
