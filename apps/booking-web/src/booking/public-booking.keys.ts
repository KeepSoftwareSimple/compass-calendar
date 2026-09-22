// The month/date key predicates live apart from public-booking.format so the
// router's search validators can reach them without importing that module.
// public-booking.format pulls BookingSlotsQuerySchema as a value, and one Zod
// import drags the whole booking.contracts module - ~15KB of schemas that
// evaluate at module load - onto the boot path of every page, for two regexes.
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const isBookingMonthKey = (value: string): boolean =>
  MONTH_KEY_PATTERN.test(value);

export const isBookingDateKey = (value: string): boolean =>
  DATE_KEY_PATTERN.test(value);
