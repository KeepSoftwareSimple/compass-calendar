import {
  type QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { ZodError } from "zod/v4";
import {
  type AdminPutBookingPageInput,
  AdminPutBookingPageInputSchema,
} from "@core/types/booking.contracts";
import { BookingApi } from "@web/api/booking.api";
import { getApiErrorCode, isApiError } from "@web/api/util/api.util";
import { useUserMetadataStore } from "@web/auth/state/user-metadata.store";
import { billingQueryKeys } from "@web/billing/billing.query";
import { billingPreviewActions } from "@web/billing/billing-preview.store";
import { BOOKING_AVAILABILITY_REQUIRED_MESSAGE } from "@web/booking/booking.util";
import { type BookingField } from "@web/booking/booking-sequence.fields";
import { showErrorToast } from "@web/common/utils/toast/error-toast.util";

export const bookingQueryKeys = {
  page: ["booking", "page"] as const,
  status: ["booking", "page", "status"] as const,
};

export function bookingPageQueryOptions() {
  return queryOptions({
    queryKey: bookingQueryKeys.page,
    queryFn: () => BookingApi.getPage(),
    staleTime: 30_000,
  });
}

export function bookingStatusQueryOptions() {
  return queryOptions({
    queryKey: bookingQueryKeys.status,
    queryFn: () => BookingApi.getPageStatus(),
    staleTime: 30_000,
    refetchOnWindowFocus: "always" as const,
  });
}

export function useBookingPageQuery(enabled: boolean) {
  return useQuery({
    ...bookingPageQueryOptions(),
    enabled,
  });
}

export function useBookingStatusQuery(enabled: boolean) {
  const queryClient = useQueryClient();
  const metadata = useUserMetadataStore((state) => state.current);
  useEffect(() => {
    if (!enabled) return;
    void metadata;
    void queryClient.invalidateQueries({ queryKey: bookingQueryKeys.status });
  }, [enabled, metadata, queryClient]);
  return useQuery({
    ...bookingStatusQueryOptions(),
    enabled,
  });
}

export const BOOKING_SAVE_ERROR_COPY: Record<string, string> = {
  BLOCKING_CALENDAR_INVALID:
    "One of your blocking calendars can't be checked for busy times. Uncheck it and save again.",
  DESTINATION_NOT_WRITABLE:
    "The destination calendar can't accept new events. Choose a different calendar and save again.",
  TIMEZONE_REQUIRED: "Choose a meeting timezone before enabling.",
  AVAILABILITY_REQUIRED: BOOKING_AVAILABILITY_REQUIRED_MESSAGE,
  SLUG_TAKEN: "That address is already taken. Try another.",
  INVALID_INPUT:
    "Some settings couldn't be saved. Check the highlighted fields and try again.",
};

const INLINE_SAVE_ERROR_FIELDS: Record<string, BookingField> = {
  TIMEZONE_REQUIRED: "timezone",
  DESTINATION_NOT_WRITABLE: "destination",
  BLOCKING_CALENDAR_INVALID: "blocking",
  AVAILABILITY_REQUIRED: "hours",
  SLUG_TAKEN: "address",
};

export function bookingSaveErrorInline(
  error: unknown,
): { message: string; field?: BookingField } | null {
  if (!isApiError(error)) return null;
  const code = getApiErrorCode(error);
  if (!code) return null;
  const field = INLINE_SAVE_ERROR_FIELDS[code];
  const message = BOOKING_SAVE_ERROR_COPY[code];
  if (!field || !message) return null;
  return { field, message };
}

function handleBookingSaveError(
  error: unknown,
  queryClient: QueryClient,
): void {
  if (error instanceof ZodError) {
    // A client-side schema rejection means a form field slipped past its
    // inline validation - point at the fields, not at the server.
    showErrorToast("Check the meeting fields and try again.");
    return;
  }
  if (isApiError(error)) {
    const code = getApiErrorCode(error);
    if (code === "BILLING_REQUIRED") {
      billingPreviewActions.exit();
      void queryClient.invalidateQueries({
        queryKey: billingQueryKeys.status,
      });
      return;
    }
    if (bookingSaveErrorInline(error)) {
      return;
    }
    const copy = code ? BOOKING_SAVE_ERROR_COPY[code] : undefined;
    if (copy) {
      showErrorToast(copy);
      return;
    }
  }
  showErrorToast("Could not save meeting settings. Please try again.");
}

export function useSaveBookingPageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: AdminPutBookingPageInput) => {
      const parsed = AdminPutBookingPageInputSchema.parse(input);
      return BookingApi.putPage(parsed);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(bookingQueryKeys.page, data);
      void queryClient.invalidateQueries({ queryKey: bookingQueryKeys.status });
    },
    onError: (error) => handleBookingSaveError(error, queryClient),
  });
}
