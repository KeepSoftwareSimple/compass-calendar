import { HostBookingApi } from "@booking-web/api/host-booking.api";
import { getErrorStatus } from "@booking-web/api/public-booking-http";
import { useQuery } from "@tanstack/react-query";
import { isSavedBookingPage } from "@core/types/booking.contracts";

export const hostBookingPageQueryKey = ["host-booking", "page"] as const;

/** Loads host meeting settings when the viewer owns the public page. */
export function usePublicBookingOwnerSettings(enabled: boolean) {
  return useQuery({
    queryKey: hostBookingPageQueryKey,
    queryFn: () => HostBookingApi.getPage(),
    enabled,
    staleTime: 30_000,
    retry: (failureCount, error) => {
      const status = getErrorStatus(error);
      if (status === 401) {
        return false;
      }
      return failureCount < 1;
    },
  });
}

export function ownerHasWeeklyBookingHours(
  page: Awaited<ReturnType<typeof HostBookingApi.getPage>> | undefined,
): boolean | undefined {
  if (!page) {
    return undefined;
  }
  if (!isSavedBookingPage(page)) {
    return page.weeklyAvailability.length > 0;
  }
  return page.weeklyAvailability.length > 0;
}
