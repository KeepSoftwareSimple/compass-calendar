export const ROOT_ROUTES = {
  BOOK: "/meet/$username",
  BOOK_CANCEL: "/meet/cancel/$reservationId",
  BOOK_RESCHEDULE: "/meet/reschedule/$reservationId",
  BOOK_CONFIRMED: "/meet/confirmed/$reservationId",
} as const;

export const LEGACY_BOOK = "/book/$username";
export const LEGACY_BOOK_CANCEL = "/book/cancel/$reservationId";
export const LEGACY_BOOK_RESCHEDULE = "/book/reschedule/$reservationId";
export const LEGACY_BOOK_CONFIRMED = "/book/confirmed/$reservationId";
