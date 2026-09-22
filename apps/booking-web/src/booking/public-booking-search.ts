import {
  isBookingDateKey,
  isBookingMonthKey,
} from "@booking-web/booking/public-booking.keys";
import { isValidTimeZone } from "@web/timezone/browser-timezone";

export interface PublicBookingSearch {
  month?: string;
  date?: string;
  slot?: string;
  tz?: string;
}

/**
 * Search params are the guest's shareable selection state (month in view,
 * picked day, picked slot, timezone override). Garbage never throws - an
 * invalid value drops to undefined and the page falls back to its defaults.
 */
export function validatePublicBookingSearch(
  search: Record<string, unknown>,
): PublicBookingSearch {
  const month =
    typeof search["month"] === "string" && isBookingMonthKey(search["month"])
      ? search["month"]
      : undefined;
  const date =
    typeof search["date"] === "string" && isBookingDateKey(search["date"])
      ? search["date"]
      : undefined;
  const slot =
    typeof search["slot"] === "string" &&
    !Number.isNaN(Date.parse(search["slot"]))
      ? search["slot"]
      : undefined;
  const tz =
    typeof search["tz"] === "string" && isValidTimeZone(search["tz"])
      ? search["tz"]
      : undefined;
  return { month, date, slot, tz };
}

/**
 * Guest-action `?token=` on cancel and confirmation permalinks. Previously
 * it lived only because the root route's auth-modal whitelist happened to
 * share the param name.
 */
export function validateBookingCancelSearch(search: Record<string, unknown>): {
  token?: string;
} {
  return {
    token:
      typeof search["token"] === "string" && search["token"].length > 0
        ? search["token"]
        : undefined,
  };
}

export interface PublicBookingRescheduleSearch extends PublicBookingSearch {
  token?: string;
}

export function validateBookingRescheduleSearch(
  search: Record<string, unknown>,
): PublicBookingRescheduleSearch {
  return {
    ...validatePublicBookingSearch(search),
    ...validateBookingCancelSearch(search),
  };
}

export function tokenFromGuestActionUrl(url: string): string {
  try {
    return (
      new URL(url, "https://compasscalendar.com").searchParams.get("token") ??
      ""
    );
  } catch {
    return "";
  }
}

export function publicCancelUrlForReservation(
  reservationId: string,
  token: string,
  origin: string,
): string {
  return publicGuestActionUrlForReservation(
    "cancel",
    reservationId,
    token,
    origin,
  );
}

export function publicRescheduleUrlForReservation(
  reservationId: string,
  token: string,
  origin: string,
): string {
  return publicGuestActionUrlForReservation(
    "reschedule",
    reservationId,
    token,
    origin,
  );
}

export function guestActionUrlFromHistory(
  state: unknown,
  key: "cancelUrl" | "rescheduleUrl",
): string | undefined {
  if (!state || typeof state !== "object") {
    return undefined;
  }
  const value = (state as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function publicGuestActionUrlForReservation(
  action: "cancel" | "reschedule",
  reservationId: string,
  token: string,
  origin: string,
): string {
  const url = new URL(`/meet/${action}/${reservationId}`, origin);
  url.searchParams.set("token", token);
  return url.toString();
}
