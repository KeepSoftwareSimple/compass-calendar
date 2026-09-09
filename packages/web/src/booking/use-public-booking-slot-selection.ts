import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { type BookingSlotsResponse } from "@core/types/booking.contracts";
import dayjs from "@core/util/date/dayjs";
import {
  formatBookingDateKey,
  formatBookingMonthKey,
  listBookingAvailableDateKeysInMonth,
} from "@web/booking/public-booking.format";
import { type PublicBookingSearch } from "@web/booking/public-booking-search";
import { getBrowserTimeZone } from "@web/timezone/browser-timezone";

/**
 * The month, day, slot, and timezone the guest is looking at, derived from the
 * URL. Call this before the slots query: the query key is built from `monthKey`
 * and `guestTimeZone`.
 */
export function usePublicBookingSelectionKeys(search: PublicBookingSearch) {
  const browserTimeZone = useMemo(getBrowserTimeZone, []);
  const guestTimeZone = search.tz ?? browserTimeZone;
  const selectedSlotStart = search.slot ?? null;
  const slotDateKey = selectedSlotStart
    ? formatBookingDateKey(selectedSlotStart, guestTimeZone)
    : null;
  const monthKey =
    search.month ??
    slotDateKey?.slice(0, 7) ??
    formatBookingMonthKey(dayjs(), guestTimeZone);

  return { guestTimeZone, selectedSlotStart, slotDateKey, monthKey };
}

export type PublicBookingSelectionKeys = ReturnType<
  typeof usePublicBookingSelectionKeys
>;

/** The parts of a slots query this hook reads, so it stays query-library agnostic. */
interface PublicBookingSlotsQueryState {
  data: BookingSlotsResponse | undefined;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
}

interface PublicBookingSlotSelectionParams {
  search: PublicBookingSearch;
  keys: PublicBookingSelectionKeys;
  slotsQuery: PublicBookingSlotsQueryState;
  /**
   * Booking horizon in days, or null until everything a month walk needs has
   * loaded (page meta, plus the guest token when rescheduling).
   */
  horizonDays: number | null;
  /** True while another step owns focus, so the picker heading must not take it. */
  pickerFocusSuspended?: boolean;
  prefetchMonth: (monthKey: string, maxHorizonDays: number) => void;
  resolveNextAvailableDate: (
    afterDateKey: string | null,
    todayKey: string,
    maxHorizonDays: number,
  ) => Promise<{ monthKey: string; dateKey: string } | null>;
}

/**
 * Everything the guest slot picker needs, shared by the booking and reschedule
 * flows. The URL is the source of truth for the selection (month, day, slot,
 * timezone): Back returns to the previous step instead of leaving the site,
 * refresh keeps the selection, and the link is shareable.
 *
 * Each flow keeps only what is genuinely its own: the details step and its
 * conflict handling for booking, the reservation lookup for reschedule.
 */
export function usePublicBookingSlotSelection({
  search,
  keys,
  slotsQuery,
  horizonDays,
  pickerFocusSuspended = false,
  prefetchMonth,
  resolveNextAvailableDate,
}: PublicBookingSlotSelectionParams) {
  const navigate = useNavigate();
  const { guestTimeZone, monthKey, selectedSlotStart, slotDateKey } = keys;

  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const pickerHeadingRef = useRef<HTMLHeadingElement>(null);
  const pendingPickerFocusRef = useRef(false);

  useEffect(() => {
    if (alertMessage) {
      alertRef.current?.focus();
    }
  }, [alertMessage]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: jump remounts the picker heading
  useEffect(() => {
    if (pickerFocusSuspended) {
      return;
    }
    if (pendingPickerFocusRef.current) {
      pendingPickerFocusRef.current = false;
      pickerHeadingRef.current?.focus();
    }
  }, [monthKey, search.date, pickerFocusSuspended]);

  const todayKey = formatBookingDateKey(dayjs(), guestTimeZone);
  const availableDateKeys = useMemo(
    () =>
      slotsQuery.data?.bookable
        ? listBookingAvailableDateKeysInMonth(
            slotsQuery.data.slots,
            monthKey,
            guestTimeZone,
            todayKey,
          )
        : [],
    [guestTimeZone, monthKey, slotsQuery.data, todayKey],
  );

  // The guest's explicit day pick wins while it is in the month in view (even
  // when it has no open times); otherwise the picked slot's day, otherwise the
  // first day with open times.
  const selectedDateKey =
    (search.date?.startsWith(monthKey) ? search.date : null) ??
    (slotDateKey?.startsWith(monthKey) ? slotDateKey : null) ??
    availableDateKeys[0] ??
    null;

  const slotsHasData = Boolean(slotsQuery.data);
  const slotsFetching =
    !slotsHasData && (slotsQuery.isPending || slotsQuery.isFetching);
  const slotsError = Boolean(slotsQuery.isError && !slotsHasData);
  const slotsPending = slotsFetching && !slotsError;

  const updateSearch = (
    patch: Partial<PublicBookingSearch>,
    { push = false }: { push?: boolean } = {},
  ) => {
    void navigate({
      to: ".",
      // The spread keeps params this hook does not own, such as the guest
      // `?token=` on the reschedule route.
      search: (previous: PublicBookingSearch) => ({ ...previous, ...patch }),
      replace: !push,
    });
  };

  /** Move focus to the picker heading once the picker next renders. */
  const requestPickerFocus = () => {
    pendingPickerFocusRef.current = true;
  };

  const handleSelectSlot = (slotStart: string) => {
    setAlertMessage(null);
    // Push, not replace: Back from the next step returns to the picker.
    updateSearch(
      {
        slot: slotStart,
        date: formatBookingDateKey(slotStart, guestTimeZone),
      },
      { push: true },
    );
  };

  const handleSelectDay = (dateKey: string) => {
    updateSearch({
      date: dateKey,
      slot: slotDateKey !== dateKey ? undefined : search.slot,
    });
  };

  const handleMonthChange = (nextMonthKey: string) => {
    setAlertMessage(null);
    updateSearch({
      month: nextMonthKey,
      date: undefined,
      slot: undefined,
    });
  };

  const handleTimeZoneChange = (nextTimeZone: string) => {
    if (nextTimeZone === guestTimeZone) {
      return;
    }
    if (selectedSlotStart) {
      // Keep the slot; its day and month re-derive in the new zone.
      updateSearch({
        tz: nextTimeZone,
        month: undefined,
        date: undefined,
      });
      return;
    }
    const currentMonthInOldZone = formatBookingMonthKey(dayjs(), guestTimeZone);
    updateSearch({
      tz: nextTimeZone,
      date: undefined,
      // Re-snap to "this month" in the new zone; keep an explicitly browsed
      // month as-is.
      month: monthKey === currentMonthInOldZone ? undefined : search.month,
    });
  };

  const handlePrefetchMonth = (nextMonthKey: string) => {
    if (horizonDays == null) {
      return;
    }
    prefetchMonth(nextMonthKey, horizonDays);
  };

  const handleJumpToNextAvailable = async () => {
    if (horizonDays == null) {
      return;
    }
    const next = await resolveNextAvailableDate(
      selectedDateKey,
      todayKey,
      horizonDays,
    );
    if (next) {
      requestPickerFocus();
      setAlertMessage(null);
      updateSearch({
        month: next.monthKey,
        date: next.dateKey,
        slot: undefined,
      });
      return;
    }
    // Every month up to the horizon came back empty - say so instead of
    // silently doing nothing.
    setAlertMessage(
      `No open times in the next ${horizonDays} days. Check back later.`,
    );
  };

  return {
    guestTimeZone,
    monthKey,
    selectedSlotStart,
    selectedDateKey,
    todayKey,
    alertMessage,
    setAlertMessage,
    alertRef,
    pickerHeadingRef,
    slotsPending,
    slotsError,
    slotsFetching,
    updateSearch,
    requestPickerFocus,
    handleSelectSlot,
    handleSelectDay,
    handleMonthChange,
    handleTimeZoneChange,
    handlePrefetchMonth,
    handleJumpToNextAvailable,
  };
}
