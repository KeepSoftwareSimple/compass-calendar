import { HttpResponse, http } from "msw";
import { Status } from "@core/errors/status.codes";
import { ENV_WEB } from "@web/common/constants/env.constants";

export const DEFAULT_PUBLIC_RESERVATION_ID = "000000000000000000000099";

export function publicPagePayload(overrides: Record<string, unknown> = {}) {
  return {
    hostDisplayName: "Tyler Dane",
    durationMinutes: 30,
    timeZone: "America/Chicago",
    enabled: true,
    maxHorizonDays: 60,
    ...overrides,
  };
}

export function pageHandler(
  overrides: Record<string, unknown> = {},
  slug = "tylerdane",
) {
  return http.get(`${ENV_WEB.API_BASEURL}/booking/pages/${slug}`, () =>
    HttpResponse.json(publicPagePayload(overrides), { status: Status.OK }),
  );
}

export function reservationGetHandler(
  slotStart: string,
  overrides: Record<string, unknown> = {},
  id = DEFAULT_PUBLIC_RESERVATION_ID,
) {
  return http.get(`${ENV_WEB.API_BASEURL}/booking/reservations/${id}`, () =>
    HttpResponse.json(
      {
        slotStart,
        guestTimeZone: "UTC",
        durationMinutes: 30,
        hostDisplayName: "Tyler Dane",
        status: "confirmed",
        bookingSlug: "tylerdane",
        guestName: "Guest User",
        notes: null,
        ...overrides,
      },
      { status: Status.OK },
    ),
  );
}
