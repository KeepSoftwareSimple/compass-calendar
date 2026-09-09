import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CreateBookingReservationInputSchema } from "@core/types/booking.contracts";
import { getErrorStatus } from "@web/api/util/api.util";
import { track } from "@web/auth/posthog/track";
import {
  type PublicBookingGuestDetails,
  type PublicBookingGuestFormValues,
} from "@web/booking/PublicBookingGuestForm";
import {
  isPublicBookingConflictError,
  prefetchPublicBookingMonth,
  resolveNextAvailableBookingDate,
  useCreatePublicBookingReservationMutation,
  usePrefetchAdjacentBookingMonths,
  usePublicBookingPageQuery,
  usePublicBookingSlotsQuery,
} from "@web/booking/public-booking.query";
import { PUBLIC_BOOKING_SLOT_CONFLICT } from "@web/booking/public-booking.view";
import {
  type PublicBookingSearch,
  tokenFromGuestActionUrl,
} from "@web/booking/public-booking-search";
import {
  usePublicBookingSelectionKeys,
  usePublicBookingSlotSelection,
} from "@web/booking/use-public-booking-slot-selection";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import { isHigherEscapeOwner } from "@web/shortcuts/escape-ownership";
import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

const EMPTY_GUEST_DETAILS: PublicBookingGuestDetails = {
  guestName: "",
  guestEmail: "",
  notes: "",
};

/**
 * All state and behavior of the guest booking flow. The shared slot picker
 * lives in `usePublicBookingSlotSelection`; what stays here is the details
 * step, the 409 conflict handling, and confirming the reservation.
 */
export function usePublicBookingFlow() {
  const { username } = useParams({ from: ROOT_ROUTES.BOOK });
  const slug = username ?? "";
  const navigate = useNavigate();
  const search: PublicBookingSearch = useSearch({ from: ROOT_ROUTES.BOOK });
  const queryClient = useQueryClient();

  const keys = usePublicBookingSelectionKeys(search);
  const { guestTimeZone, monthKey, selectedSlotStart } = keys;

  const pageQuery = usePublicBookingPageQuery(slug);
  const slotsQuery = usePublicBookingSlotsQuery(
    slug,
    monthKey,
    pageQuery.data?.maxHorizonDays,
    guestTimeZone,
  );
  const createReservation = useCreatePublicBookingReservationMutation(slug);

  const [guestDetails, setGuestDetails] =
    useState<PublicBookingGuestDetails>(EMPTY_GUEST_DETAILS);
  // "Change time" shows the picker with the chosen slot still highlighted, so
  // the slot stays in the URL and only this local flag flips the view.
  const [changingTime, setChangingTime] = useState(false);
  const detailsHeadingRef = useRef<HTMLHeadingElement>(null);
  const submitInFlightRef = useRef(false);

  const showDetailsStep = selectedSlotStart !== null && !changingTime;

  const selection = usePublicBookingSlotSelection({
    search,
    keys,
    slotsQuery,
    horizonDays: pageQuery.data?.maxHorizonDays ?? null,
    pickerFocusSuspended: showDetailsStep,
    prefetchMonth: (nextMonthKey, maxHorizonDays) => {
      void prefetchPublicBookingMonth(
        queryClient,
        slug,
        nextMonthKey,
        guestTimeZone,
        maxHorizonDays,
      );
    },
    resolveNextAvailableDate: (afterDateKey, todayKey, maxHorizonDays) =>
      resolveNextAvailableBookingDate(
        queryClient,
        slug,
        monthKey,
        afterDateKey,
        guestTimeZone,
        todayKey,
        maxHorizonDays,
      ),
  });
  const { alertMessage, setAlertMessage, updateSearch } = selection;

  // biome-ignore lint/correctness/useExhaustiveDependencies: jump remounts the details heading
  useEffect(() => {
    if (showDetailsStep) {
      detailsHeadingRef.current?.focus();
    }
  }, [monthKey, search.date, showDetailsStep]);

  usePrefetchAdjacentBookingMonths(
    slug,
    monthKey,
    guestTimeZone,
    pageQuery.data?.maxHorizonDays,
    pageQuery.isSuccess && pageQuery.data.enabled && slotsQuery.isSuccess,
  );

  // 409 only: keep typed details while they pick another slot. Other alerts
  // (empty horizon, confirm failure) must not open the guest form.
  const showConflictForm =
    !showDetailsStep && alertMessage === PUBLIC_BOOKING_SLOT_CONFLICT;

  const handleSelectSlot = (slotStart: string) => {
    setChangingTime(false);
    selection.handleSelectSlot(slotStart);
  };

  const handleMonthChange = (nextMonthKey: string) => {
    setChangingTime(false);
    selection.handleMonthChange(nextMonthKey);
  };

  const handleChangeTime = () => {
    selection.requestPickerFocus();
    setChangingTime(true);
  };

  // Escape on Your details is the keyboard equivalent of Change time.
  // OverlayPanel (timezone) holds the app lock, so ignoreAppLock stays false.
  // Slot-list Escape is owned by PublicBookingSlotPicker, not this shortcut.
  useAppShortcut(
    "Escape",
    (event) => {
      if (isHigherEscapeOwner()) {
        return;
      }
      event.preventDefault();
      handleChangeTime();
    },
    { enabled: showDetailsStep, ignoreInputs: false },
  );

  const handleSubmit = async (values: PublicBookingGuestFormValues) => {
    if (!selectedSlotStart || !pageQuery.data || submitInFlightRef.current) {
      return;
    }

    submitInFlightRef.current = true;
    setAlertMessage(null);

    try {
      const result = await createReservation.mutateAsync(
        CreateBookingReservationInputSchema.parse({
          slotStart: selectedSlotStart,
          guestName: values.guestName,
          guestEmail: values.guestEmail,
          notes: values.notes || undefined,
          guestTimeZone: values.guestTimeZone,
          durationMinutes: pageQuery.data.durationMinutes,
        }),
      );
      track("booking_reservation_created", {
        duration_minutes: pageQuery.data.durationMinutes,
      });
      const token = tokenFromGuestActionUrl(result.cancelUrl);
      await navigate({
        to: ROOT_ROUTES.BOOK_CONFIRMED,
        params: { reservationId: result.reservationId },
        search: token ? { token } : undefined,
        // History state still carries the absolute cancel and reschedule URLs
        // from confirm. The permalink also writes `?token=` so a reload or
        // bookmark keeps guest actions and edit without publishing the token
        // on the public GET.
        state: {
          cancelUrl: result.cancelUrl,
          rescheduleUrl: result.rescheduleUrl,
        } as never,
      });
    } catch (error) {
      if (isPublicBookingConflictError(error)) {
        setAlertMessage(PUBLIC_BOOKING_SLOT_CONFLICT);
        setChangingTime(false);
        updateSearch({ slot: undefined });
        await slotsQuery.refetch();
        return;
      }
      if (getErrorStatus(error) === 404) {
        // The host disabled the page mid-flow; the refetch flips the whole
        // page to its not-found state.
        setAlertMessage("This meeting page is no longer available.");
        await pageQuery.refetch();
        return;
      }
      setAlertMessage("Could not confirm this meeting. Please try again.");
    } finally {
      submitInFlightRef.current = false;
    }
  };

  return {
    pageQuery,
    slotsQuery,
    createReservation,
    guestTimeZone,
    monthKey,
    selectedSlotStart,
    selectedDateKey: selection.selectedDateKey,
    guestDetails,
    setGuestDetails,
    alertMessage,
    showDetailsStep,
    showConflictForm,
    slotsPending: selection.slotsPending,
    slotsError: selection.slotsError,
    slotsFetching: selection.slotsFetching,
    alertRef: selection.alertRef,
    detailsHeadingRef,
    pickerHeadingRef: selection.pickerHeadingRef,
    handleSelectSlot,
    handleSelectDay: selection.handleSelectDay,
    handleMonthChange,
    handleTimeZoneChange: selection.handleTimeZoneChange,
    handleChangeTime,
    handlePrefetchMonth: selection.handlePrefetchMonth,
    handleJumpToNextAvailable: selection.handleJumpToNextAvailable,
    handleSubmit,
  };
}
