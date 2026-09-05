import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import {
  type BookingSlotsQuery,
  type BookingSlotsResponse,
  type CreateBookingReservationInput,
  type PatchBookingReservationInput,
  type RescheduleBookingReservationInput,
} from "@core/types/booking.contracts";
import {
  PublicBookingApi,
  PublicBookingNotFoundError,
} from "@web/api/public-booking.api";
import { getErrorStatus } from "@web/api/util/api.util";
import {
  BOOKING_MONTH_SEARCH_LIMIT,
  findNextAvailableBookingDate,
  getPublicBookingMonthWindow,
  shiftBookingMonthKey,
} from "@web/booking/public-booking.format";

const PUBLIC_BOOKING_PAGE_STALE_TIME_MS = 5 * 60 * 1000;
const PUBLIC_BOOKING_SLOTS_STALE_TIME_MS = 60_000;

export const publicBookingQueryKeys = {
  page: (slug: string) => ["public-booking", "page", slug] as const,
  /** Prefix covering every month and timezone of one host's slots. */
  slotsAll: (slug: string) => ["public-booking", "slots", slug] as const,
  slots: (slug: string, monthKey: string, timeZone: string) =>
    [...publicBookingQueryKeys.slotsAll(slug), monthKey, timeZone] as const,
  reservation: (reservationId: string) =>
    ["public-booking", "reservation", reservationId] as const,
  reservationSlotsAll: (reservationId: string) =>
    ["public-booking", "reservation-slots", reservationId] as const,
  reservationSlots: (
    reservationId: string,
    monthKey: string,
    timeZone: string,
  ) =>
    [
      ...publicBookingQueryKeys.reservationSlotsAll(reservationId),
      monthKey,
      timeZone,
    ] as const,
};

/** A page or reservation that is gone stays gone; retry once for anything else. */
const retryUnlessNotFound = (failureCount: number, error: Error): boolean =>
  !(error instanceof PublicBookingNotFoundError) && failureCount < 1;

function publicBookingPageQueryOptions(slug: string) {
  return queryOptions({
    queryKey: publicBookingQueryKeys.page(slug),
    queryFn: () => PublicBookingApi.getPage(slug),
    staleTime: PUBLIC_BOOKING_PAGE_STALE_TIME_MS,
    retry: retryUnlessNotFound,
  });
}

export function usePublicBookingPageQuery(slug: string) {
  return useQuery({
    ...publicBookingPageQueryOptions(slug),
    enabled: Boolean(slug),
  });
}

function publicBookingReservationQueryOptions(reservationId: string) {
  return queryOptions({
    queryKey: publicBookingQueryKeys.reservation(reservationId),
    queryFn: () => PublicBookingApi.getReservation(reservationId),
    staleTime: PUBLIC_BOOKING_PAGE_STALE_TIME_MS,
    retry: retryUnlessNotFound,
    enabled: Boolean(reservationId),
  });
}

export function usePublicBookingReservationQuery(reservationId: string) {
  return useQuery(publicBookingReservationQueryOptions(reservationId));
}

export function publicBookingReservationSlotsQueryOptions(
  reservationId: string,
  token: string,
  monthKey: string,
  timeZone: string,
  maxHorizonDays: number,
) {
  return publicBookingMonthSlotsQueryOptions(
    publicBookingQueryKeys.reservationSlots(reservationId, monthKey, timeZone),
    monthKey,
    timeZone,
    maxHorizonDays,
    (window, signal) =>
      PublicBookingApi.getReservationSlots(
        reservationId,
        { ...window, token },
        signal,
      ),
  );
}

export function usePublicBookingReservationSlotsQuery(
  reservationId: string,
  token: string,
  monthKey: string,
  maxHorizonDays: number | undefined,
  timeZone: string,
) {
  const horizon = maxHorizonDays ?? 60;
  const window = useMemo(
    () => getPublicBookingMonthWindow(monthKey, timeZone, horizon),
    [monthKey, timeZone, horizon],
  );

  return useQuery({
    ...publicBookingReservationSlotsQueryOptions(
      reservationId,
      token,
      monthKey,
      timeZone,
      horizon,
    ),
    enabled: Boolean(reservationId && token) && window != null,
  });
}

export function publicBookingSlotsQueryOptions(
  slug: string,
  monthKey: string,
  timeZone: string,
  maxHorizonDays: number,
) {
  return publicBookingMonthSlotsQueryOptions(
    publicBookingQueryKeys.slots(slug, monthKey, timeZone),
    monthKey,
    timeZone,
    maxHorizonDays,
    (window, signal) => PublicBookingApi.getSlots(slug, window, signal),
  );
}

export function usePublicBookingSlotsQuery(
  slug: string,
  monthKey: string,
  maxHorizonDays: number | undefined,
  timeZone: string,
) {
  // Start the first month in parallel with page meta. 60 is the schema max
  // and only used until `maxHorizonDays` is known; the query key is the month
  // so landing page meta does not refetch. The backend still clamps to the
  // host horizon. Adjacent prefetch waits for the real horizon.
  const horizon = maxHorizonDays ?? 60;
  const window = useMemo(
    () => getPublicBookingMonthWindow(monthKey, timeZone, horizon),
    [monthKey, timeZone, horizon],
  );

  return useQuery({
    ...publicBookingSlotsQueryOptions(slug, monthKey, timeZone, horizon),
    enabled: Boolean(slug) && window != null,
  });
}

export function prefetchPublicBookingMonth(
  queryClient: ReturnType<typeof useQueryClient>,
  slug: string,
  monthKey: string,
  timeZone: string,
  maxHorizonDays: number,
) {
  if (!slug) return;
  return prefetchPublicBookingMonthIfInWindow(
    queryClient,
    monthKey,
    timeZone,
    maxHorizonDays,
    publicBookingSlotsQueryOptions(slug, monthKey, timeZone, maxHorizonDays),
  );
}

export function prefetchPublicBookingReservationMonth(
  queryClient: ReturnType<typeof useQueryClient>,
  reservationId: string,
  token: string,
  monthKey: string,
  timeZone: string,
  maxHorizonDays: number,
) {
  if (!reservationId || !token) return;
  return prefetchPublicBookingMonthIfInWindow(
    queryClient,
    monthKey,
    timeZone,
    maxHorizonDays,
    publicBookingReservationSlotsQueryOptions(
      reservationId,
      token,
      monthKey,
      timeZone,
      maxHorizonDays,
    ),
  );
}

export function usePrefetchAdjacentBookingMonths(
  slug: string,
  monthKey: string,
  timeZone: string,
  maxHorizonDays: number | undefined,
  enabled: boolean,
) {
  const queryClient = useQueryClient();
  const previousMonthKey = shiftBookingMonthKey(monthKey, -1, timeZone);
  const nextMonthKey = shiftBookingMonthKey(monthKey, 1, timeZone);

  useEffect(() => {
    if (!enabled || maxHorizonDays == null || !slug) {
      return;
    }
    void prefetchPublicBookingMonth(
      queryClient,
      slug,
      previousMonthKey,
      timeZone,
      maxHorizonDays,
    );
    void prefetchPublicBookingMonth(
      queryClient,
      slug,
      nextMonthKey,
      timeZone,
      maxHorizonDays,
    );
  }, [
    enabled,
    maxHorizonDays,
    nextMonthKey,
    previousMonthKey,
    queryClient,
    slug,
    timeZone,
  ]);
}

export function usePrefetchAdjacentReservationMonths(
  reservationId: string,
  token: string,
  monthKey: string,
  timeZone: string,
  maxHorizonDays: number | undefined,
  enabled: boolean,
) {
  const queryClient = useQueryClient();
  const previousMonthKey = shiftBookingMonthKey(monthKey, -1, timeZone);
  const nextMonthKey = shiftBookingMonthKey(monthKey, 1, timeZone);

  useEffect(() => {
    if (!enabled || maxHorizonDays == null || !reservationId || !token) {
      return;
    }
    void prefetchPublicBookingReservationMonth(
      queryClient,
      reservationId,
      token,
      previousMonthKey,
      timeZone,
      maxHorizonDays,
    );
    void prefetchPublicBookingReservationMonth(
      queryClient,
      reservationId,
      token,
      nextMonthKey,
      timeZone,
      maxHorizonDays,
    );
  }, [
    enabled,
    maxHorizonDays,
    nextMonthKey,
    previousMonthKey,
    queryClient,
    reservationId,
    timeZone,
    token,
  ]);
}

/**
 * Walk forward from `monthKey` looking for the next day with open times,
 * reading cached months and prefetching uncached ones as it goes. Null means
 * the whole horizon is empty - the caller owes the guest a message, not
 * silence.
 */
export async function resolveNextAvailableBookingDate(
  queryClient: ReturnType<typeof useQueryClient>,
  slug: string,
  monthKey: string,
  afterDateKey: string | null,
  timeZone: string,
  todayKey: string,
  maxHorizonDays: number,
): Promise<{ monthKey: string; dateKey: string } | null> {
  return resolveNextAvailableMonth({
    queryClient,
    monthKey,
    afterDateKey,
    timeZone,
    todayKey,
    maxHorizonDays,
    slotsQueryKey: (cursor) =>
      publicBookingQueryKeys.slots(slug, cursor, timeZone),
    prefetchMonth: (cursor) =>
      prefetchPublicBookingMonth(
        queryClient,
        slug,
        cursor,
        timeZone,
        maxHorizonDays,
      ),
  });
}

export async function resolveNextAvailableReservationDate(
  queryClient: ReturnType<typeof useQueryClient>,
  reservationId: string,
  token: string,
  monthKey: string,
  afterDateKey: string | null,
  timeZone: string,
  todayKey: string,
  maxHorizonDays: number,
): Promise<{ monthKey: string; dateKey: string } | null> {
  return resolveNextAvailableMonth({
    queryClient,
    monthKey,
    afterDateKey,
    timeZone,
    todayKey,
    maxHorizonDays,
    slotsQueryKey: (cursor) =>
      publicBookingQueryKeys.reservationSlots(reservationId, cursor, timeZone),
    prefetchMonth: (cursor) =>
      prefetchPublicBookingReservationMonth(
        queryClient,
        reservationId,
        token,
        cursor,
        timeZone,
        maxHorizonDays,
      ),
  });
}

export function useCreatePublicBookingReservationMutation(slug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBookingReservationInput) =>
      PublicBookingApi.createReservation(slug, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: publicBookingQueryKeys.slotsAll(slug),
      });
    },
  });
}

export function usePatchPublicBookingReservationMutation(
  reservationId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PatchBookingReservationInput) =>
      PublicBookingApi.patchReservation(reservationId, input),
    onSuccess: (data) => {
      queryClient.setQueryData(
        publicBookingQueryKeys.reservation(reservationId),
        data,
      );
    },
  });
}

export function useReschedulePublicBookingReservationMutation(
  reservationId: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RescheduleBookingReservationInput) =>
      PublicBookingApi.rescheduleReservation(reservationId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: publicBookingQueryKeys.reservation(reservationId),
      });
      void queryClient.invalidateQueries({
        queryKey: publicBookingQueryKeys.reservationSlotsAll(reservationId),
      });
    },
  });
}

export function isPublicBookingConflictError(error: unknown): boolean {
  return getErrorStatus(error) === 409;
}

type BookingQueryClient = ReturnType<typeof useQueryClient>;

function publicBookingMonthSlotsQueryOptions(
  queryKey: readonly unknown[],
  monthKey: string,
  timeZone: string,
  maxHorizonDays: number,
  fetchSlots: (
    window: BookingSlotsQuery,
    signal: AbortSignal,
  ) => Promise<BookingSlotsResponse> | BookingSlotsResponse,
) {
  return queryOptions({
    queryKey,
    queryFn: ({ signal }) => {
      const window = getPublicBookingMonthWindow(
        monthKey,
        timeZone,
        maxHorizonDays,
      );
      if (!window) {
        return { slots: [], bookable: true as const };
      }
      return fetchSlots(window, signal);
    },
    staleTime: PUBLIC_BOOKING_SLOTS_STALE_TIME_MS,
    retry: false,
  });
}

function prefetchPublicBookingMonthIfInWindow(
  queryClient: BookingQueryClient,
  monthKey: string,
  timeZone: string,
  maxHorizonDays: number,
  options: ReturnType<typeof publicBookingMonthSlotsQueryOptions>,
) {
  const window = getPublicBookingMonthWindow(
    monthKey,
    timeZone,
    maxHorizonDays,
  );
  if (!window) return;
  return queryClient.prefetchQuery(options);
}

async function resolveNextAvailableMonth(params: {
  queryClient: BookingQueryClient;
  monthKey: string;
  afterDateKey: string | null;
  timeZone: string;
  todayKey: string;
  maxHorizonDays: number;
  slotsQueryKey: (monthKey: string) => readonly unknown[];
  prefetchMonth: (monthKey: string) => unknown;
}): Promise<{ monthKey: string; dateKey: string } | null> {
  const slotsByMonth = new Map<
    string,
    BookingSlotsResponse["slots"] | undefined
  >();
  let cursor = params.monthKey;
  for (let offset = 0; offset < BOOKING_MONTH_SEARCH_LIMIT; offset += 1) {
    const cached = params.queryClient.getQueryData<BookingSlotsResponse>(
      params.slotsQueryKey(cursor),
    );
    if (cached) {
      slotsByMonth.set(cursor, cached.slots);
    }
    cursor = shiftBookingMonthKey(cursor, 1, params.timeZone);
  }

  for (let attempt = 0; attempt < BOOKING_MONTH_SEARCH_LIMIT; attempt += 1) {
    const next = findNextAvailableBookingDate(
      params.monthKey,
      params.afterDateKey,
      slotsByMonth,
      params.timeZone,
      params.todayKey,
      params.maxHorizonDays,
    );
    if (!next) {
      return null;
    }
    if (next.dateKey) {
      return { monthKey: next.monthKey, dateKey: next.dateKey };
    }
    await params.prefetchMonth(next.monthKey);
    const fetched = params.queryClient.getQueryData<BookingSlotsResponse>(
      params.slotsQueryKey(next.monthKey),
    );
    slotsByMonth.set(next.monthKey, fetched?.slots ?? []);
  }
  return null;
}
