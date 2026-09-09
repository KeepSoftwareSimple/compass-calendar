import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useRef } from "react";
import { RescheduleBookingReservationInputSchema } from "@core/types/booking.contracts";
import { PublicBookingNotFoundError } from "@web/api/public-booking.api";
import { getErrorStatus } from "@web/api/util/api.util";
import {
  isPublicBookingConflictError,
  prefetchPublicBookingReservationMonth,
  resolveNextAvailableReservationDate,
  usePrefetchAdjacentReservationMonths,
  usePublicBookingPageQuery,
  usePublicBookingReservationQuery,
  usePublicBookingReservationSlotsQuery,
  useReschedulePublicBookingReservationMutation,
} from "@web/booking/public-booking.query";
import { PUBLIC_BOOKING_SLOT_CONFLICT } from "@web/booking/public-booking.view";
import {
  type PublicBookingRescheduleSearch,
  publicCancelUrlForReservation,
  publicRescheduleUrlForReservation,
} from "@web/booking/public-booking-search";
import {
  usePublicBookingSelectionKeys,
  usePublicBookingSlotSelection,
} from "@web/booking/use-public-booking-slot-selection";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import { isHigherEscapeOwner } from "@web/shortcuts/escape-ownership";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

/**
 * The guest reschedule flow. The shared slot picker lives in
 * `usePublicBookingSlotSelection`; what stays here is the token-guarded
 * reservation lookup and confirming the new time.
 */
export function usePublicBookingRescheduleFlow() {
  const { reservationId } = useParams({
    from: ROOT_ROUTES.BOOK_RESCHEDULE,
  });
  const search: PublicBookingRescheduleSearch = useSearch({
    from: ROOT_ROUTES.BOOK_RESCHEDULE,
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = search.token ?? "";
  const canLoad = Boolean(reservationId && token);

  const reservationQuery = usePublicBookingReservationQuery(
    canLoad ? reservationId : "",
  );
  const bookingSlug =
    reservationQuery.data?.status === "confirmed"
      ? (reservationQuery.data.bookingSlug ?? "")
      : "";
  const pageQuery = usePublicBookingPageQuery(bookingSlug);

  const keys = usePublicBookingSelectionKeys(search);
  const { guestTimeZone, monthKey, selectedSlotStart } = keys;

  const slotsQuery = usePublicBookingReservationSlotsQuery(
    canLoad && reservationQuery.data?.status === "confirmed"
      ? reservationId
      : "",
    token,
    monthKey,
    pageQuery.data?.maxHorizonDays,
    guestTimeZone,
  );
  const rescheduleReservation =
    useReschedulePublicBookingReservationMutation(reservationId);

  const submitInFlightRef = useRef(false);

  const selection = usePublicBookingSlotSelection({
    search,
    keys,
    slotsQuery,
    // Every month walk here is token-authenticated, so no token means no walk.
    horizonDays: token ? (pageQuery.data?.maxHorizonDays ?? null) : null,
    prefetchMonth: (nextMonthKey, maxHorizonDays) => {
      void prefetchPublicBookingReservationMonth(
        queryClient,
        reservationId,
        token,
        nextMonthKey,
        guestTimeZone,
        maxHorizonDays,
      );
    },
    resolveNextAvailableDate: (afterDateKey, todayKey, maxHorizonDays) =>
      resolveNextAvailableReservationDate(
        queryClient,
        reservationId,
        token,
        monthKey,
        afterDateKey,
        guestTimeZone,
        todayKey,
        maxHorizonDays,
      ),
  });
  const { setAlertMessage, updateSearch } = selection;

  usePrefetchAdjacentReservationMonths(
    reservationId,
    token,
    monthKey,
    guestTimeZone,
    pageQuery.data?.maxHorizonDays,
    canLoad &&
      pageQuery.isSuccess &&
      pageQuery.data.enabled &&
      slotsQuery.isSuccess,
  );

  useAppShortcut(
    "Escape",
    (event) => {
      if (isHigherEscapeOwner()) {
        return;
      }
      if (submitInFlightRef.current || !reservationId) {
        return;
      }
      event.preventDefault();
      void navigate({
        to: ROOT_ROUTES.BOOK_CONFIRMED,
        params: { reservationId },
        search: token ? { token } : undefined,
      });
    },
    {
      enabled: canLoad && !rescheduleReservation.isPending,
      ignoreInputs: false,
    },
  );

  const handleConfirm = async () => {
    if (
      !selectedSlotStart ||
      !token ||
      !pageQuery.data ||
      submitInFlightRef.current
    ) {
      return;
    }

    submitInFlightRef.current = true;
    setAlertMessage(null);

    try {
      await rescheduleReservation.mutateAsync(
        RescheduleBookingReservationInputSchema.parse({
          token,
          slotStart: selectedSlotStart,
          guestTimeZone,
          durationMinutes: pageQuery.data.durationMinutes,
        }),
      );
      await navigate({
        to: ROOT_ROUTES.BOOK_CONFIRMED,
        params: { reservationId },
        search: { token },
        state: {
          cancelUrl: publicCancelUrlForReservation(
            reservationId,
            token,
            window.location.origin,
          ),
          rescheduleUrl: publicRescheduleUrlForReservation(
            reservationId,
            token,
            window.location.origin,
          ),
        } as never,
      });
    } catch (error) {
      if (isPublicBookingConflictError(error)) {
        setAlertMessage(PUBLIC_BOOKING_SLOT_CONFLICT);
        updateSearch({ slot: undefined });
        await slotsQuery.refetch();
        return;
      }
      if (
        error instanceof PublicBookingNotFoundError ||
        getErrorStatus(error) === 404
      ) {
        setAlertMessage("This meeting is no longer available.");
        await reservationQuery.refetch();
        return;
      }
      setAlertMessage("Could not reschedule this meeting. Please try again.");
    } finally {
      submitInFlightRef.current = false;
    }
  };

  return {
    canLoad,
    token,
    reservationQuery,
    pageQuery,
    slotsQuery,
    rescheduleReservation,
    guestTimeZone,
    monthKey,
    selectedSlotStart,
    selectedDateKey: selection.selectedDateKey,
    alertMessage: selection.alertMessage,
    slotsPending: selection.slotsPending,
    slotsError: selection.slotsError,
    slotsFetching: selection.slotsFetching,
    alertRef: selection.alertRef,
    pickerHeadingRef: selection.pickerHeadingRef,
    handleSelectSlot: selection.handleSelectSlot,
    handleSelectDay: selection.handleSelectDay,
    handleMonthChange: selection.handleMonthChange,
    handleTimeZoneChange: selection.handleTimeZoneChange,
    handlePrefetchMonth: selection.handlePrefetchMonth,
    handleJumpToNextAvailable: selection.handleJumpToNextAvailable,
    handleConfirm,
  };
}
