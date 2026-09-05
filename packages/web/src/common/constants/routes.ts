export const ROOT_ROUTES = {
  API: "/api",
  BOOK: "/book/$username",
  BOOK_CANCEL: "/book/cancel/$reservationId",
  BOOK_RESCHEDULE: "/book/reschedule/$reservationId",
  BOOK_CONFIRMED: "/book/confirmed/$reservationId",
  CLEANUP: "/cleanup",
  GOOGLE_AUTH_CALLBACK: "/auth/google/callback",
  PROVIDER_AUTH_CALLBACK: "/auth/$provider/callback",
  LIFE: "/life",
  ROOT: "/",
  WEEK: "/week",
  WEEK_DATE: "/week/$dateString",
  DAY: "/day",
  DAY_DATE: "/day/$dateString",
} as const;

export const DEFAULT_CALENDAR_ROUTE = ROOT_ROUTES.WEEK;

// TanStack route *ids* (used for useMatch/useParams `from`), which diverge
// from the URL-shaped ROOT_ROUTES above under the pathless "authenticated"
// layout route. Kept as literals rather than importing the route objects
// from router.routes.tsx so hooks like useWeek don't drag in that module's
// (now eager) view component imports.
export const ROUTE_IDS = {
  DAY_DATE: "/calendar-shell/authenticated/day/$dateString",
  LIFE: "/calendar-shell/life",
  WEEK_DATE: "/calendar-shell/authenticated/week/$dateString",
} as const;
