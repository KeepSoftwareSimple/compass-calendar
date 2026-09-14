/**
 * Booking analytics and log redaction.
 *
 * Guest capabilities live in `?token=` and reservation ids live in paths.
 * Named product events already omit guest fields; this module is the shared
 * allowlist + URL rewrite used by web `before_send`, HTTP access logs, and
 * PostHog/OTel transports so those secrets never leave as telemetry.
 */

const BOOKING_ROUTE_CATEGORIES = [
  "meet_page",
  "meet_confirmed",
  "meet_cancel",
  "meet_reschedule",
  "book_page",
  "book_confirmed",
  "book_cancel",
  "book_reschedule",
  "api_booking_page",
  "api_booking_slots",
  "api_booking_create",
  "api_booking_reservation",
  "api_booking_reservation_cancel",
  "api_booking_reservation_slots",
  "api_booking_reservation_reschedule",
  "api_booking_admin",
] as const;

export type BookingRouteCategory = (typeof BOOKING_ROUTE_CATEGORIES)[number];

export interface ClassifiedBookingPath {
  category: BookingRouteCategory;
  canonicalPath: string;
}

const KEEP_QUERY_KEYS = new Set([
  "start",
  "end",
  "timezone",
  "tz",
  "month",
  "date",
  "slot",
]);

const WEB_ACTION = /^\/(meet|book)\/(confirmed|cancel|reschedule)\/([^/]+)$/;
const WEB_PAGE = /^\/(meet|book)\/([^/]+)$/;
const API_RESERVATION =
  /^\/api\/booking\/reservations\/([^/]+)(?:\/(cancel|slots|reschedule))?$/;
const API_PUBLIC_PAGE =
  /^\/api\/booking\/pages\/([^/]+)(?:\/(slots|reservations))?$/;
const API_ADMIN = /^\/api\/booking\/page(?:\/.*)?$/;
const COMPASS_ORIGIN = "https://compasscalendar.com";

const API_RESERVATION_BY_SUFFIX: Record<string, ClassifiedBookingPath> = {
  cancel: {
    category: "api_booking_reservation_cancel",
    canonicalPath: "/api/booking/reservations/:reservationId/cancel",
  },
  slots: {
    category: "api_booking_reservation_slots",
    canonicalPath: "/api/booking/reservations/:reservationId/slots",
  },
  reschedule: {
    category: "api_booking_reservation_reschedule",
    canonicalPath: "/api/booking/reservations/:reservationId/reschedule",
  },
};

const API_PUBLIC_PAGE_BY_SUFFIX: Record<string, ClassifiedBookingPath> = {
  slots: {
    category: "api_booking_slots",
    canonicalPath: "/api/booking/pages/:slug/slots",
  },
  reservations: {
    category: "api_booking_create",
    canonicalPath: "/api/booking/pages/:slug/reservations",
  },
};

const BOOKING_URL_IN_TEXT =
  /(?:https?:\/\/[^\s"'<>\\]+)|(?:\/(?:meet|book|api\/booking)[^\s"'<>\\]*)/gi;
const EMAIL_IN_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const TOKEN_QUERY = /([?&]token=)[^&\s"'<>\\]*/gi;

const BOOKING_UNSAFE_META_KEYS = new Set([
  "slug",
  "username",
  "guestname",
  "guestemail",
  "email",
  "notes",
  "reservationid",
  "cancelurl",
  "rescheduleurl",
  "bookingurl",
  "token",
  "canceltoken",
  "canceltokenhash",
]);

const normalizeMetaKey = (key: string): string =>
  key.toLowerCase().replace(/[^a-z0-9]/g, "");

const parseAbsoluteOrRelativeUrl = (value: string): URL | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return /^https?:\/\//i.test(trimmed)
      ? new URL(trimmed)
      : new URL(trimmed, COMPASS_ORIGIN);
  } catch {
    return null;
  }
};

const pathnameOf = (value: string): string => {
  const parsed = parseAbsoluteOrRelativeUrl(value);
  if (parsed) return parsed.pathname;
  const path = value.trim().split("?")[0] ?? value;
  return path.startsWith("/") ? path : "";
};

const containsBookingPath = (value: string): boolean =>
  /\/(?:meet|book)(?:\/|$)/.test(value) || /\/api\/booking(?:\/|$)/.test(value);

export function classifyBookingPath(
  pathname: string,
): ClassifiedBookingPath | null {
  const path = pathname.replace(/\/+$/, "") || "/";

  const action = WEB_ACTION.exec(path);
  if (action) {
    const prefix = action[1] as "meet" | "book";
    const kind = action[2] as "confirmed" | "cancel" | "reschedule";
    return {
      category: `${prefix}_${kind}` as BookingRouteCategory,
      canonicalPath: `/${prefix}/${kind}/:reservationId`,
    };
  }

  const page = WEB_PAGE.exec(path);
  if (page) {
    const prefix = page[1] as "meet" | "book";
    return {
      category: `${prefix}_page` as BookingRouteCategory,
      canonicalPath: `/${prefix}/:slug`,
    };
  }

  const reservation = API_RESERVATION.exec(path);
  if (reservation) {
    return (
      API_RESERVATION_BY_SUFFIX[reservation[2] ?? ""] ?? {
        category: "api_booking_reservation",
        canonicalPath: "/api/booking/reservations/:reservationId",
      }
    );
  }

  const publicPage = API_PUBLIC_PAGE.exec(path);
  if (publicPage) {
    return (
      API_PUBLIC_PAGE_BY_SUFFIX[publicPage[2] ?? ""] ?? {
        category: "api_booking_page",
        canonicalPath: "/api/booking/pages/:slug",
      }
    );
  }

  if (API_ADMIN.test(path)) {
    return {
      category: "api_booking_admin",
      canonicalPath: path,
    };
  }

  return null;
}

export function isPublicBookingPath(pathname: string): boolean {
  const path = pathnameOf(pathname);
  return (
    path === "/meet" ||
    path === "/book" ||
    path.startsWith("/meet/") ||
    path.startsWith("/book/")
  );
}

export function isBookingCapabilityPath(pathname: string): boolean {
  return WEB_ACTION.test(pathnameOf(pathname).replace(/\/+$/, "") || "/");
}

export function isBookingUnsafeMetaKey(key: string): boolean {
  return BOOKING_UNSAFE_META_KEYS.has(normalizeMetaKey(key));
}

const keepQueryParam = (key: string): boolean =>
  KEEP_QUERY_KEYS.has(key.toLowerCase());

export function redactBookingUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return raw;

  const url = parseAbsoluteOrRelativeUrl(trimmed);
  if (!url) return raw;
  const absolute = /^https?:\/\//i.test(trimmed);

  const classified = classifyBookingPath(url.pathname);
  if (!classified) {
    if (!url.searchParams.has("token")) return raw;
    url.searchParams.delete("token");
    url.hash = "";
    return absolute
      ? `${url.origin}${url.pathname}${url.search}`
      : `${url.pathname}${url.search}`;
  }

  url.pathname = classified.canonicalPath;
  const kept: string[] = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (keepQueryParam(key)) kept.push(`${key}=${value}`);
  }
  const suffix = kept.length > 0 ? `?${kept.join("&")}` : "";
  url.hash = "";

  return absolute
    ? `${url.origin}${classified.canonicalPath}${suffix}`
    : `${classified.canonicalPath}${suffix}`;
}

export function redactBookingSecretsFromString(value: string): string {
  let next = value.replace(BOOKING_URL_IN_TEXT, (match) => {
    const trailing = match.match(/[),.;]+$/)?.[0] ?? "";
    const core = trailing ? match.slice(0, -trailing.length) : match;
    return `${redactBookingUrl(core)}${trailing}`;
  });
  next = next.replace(TOKEN_QUERY, "$1:token");
  if (containsBookingPath(value) || containsBookingPath(next)) {
    next = next.replace(EMAIL_IN_TEXT, ":email");
  }
  return next;
}

const rewriteTelemetryValue = (
  value: unknown,
  seen: WeakSet<object>,
  redactKeys: boolean,
): unknown => {
  if (typeof value === "string") return redactBookingSecretsFromString(value);
  if (typeof value !== "object" || value === null) return value;
  if (value instanceof Error || value instanceof Date) return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => rewriteTelemetryValue(entry, seen, redactKeys));
  }

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (redactKeys && isBookingUnsafeMetaKey(key)) continue;
    output[key] = rewriteTelemetryValue(nested, seen, redactKeys);
  }
  return output;
};

export function sanitizeBookingTelemetry<T>(
  value: T,
  options?: { dropUnsafeKeys?: boolean },
): T {
  return rewriteTelemetryValue(
    value,
    new WeakSet(),
    options?.dropUnsafeKeys ?? false,
  ) as T;
}

export function bookingRouteCategoryFromUrl(
  value: string | undefined,
): BookingRouteCategory | undefined {
  if (!value) return undefined;
  return classifyBookingPath(pathnameOf(value))?.category;
}
