export const BOOKING_OPERATION_RETRY_INTERVAL_MS = 15_000;
export const BOOKING_OPERATION_RETRY_BATCH_SIZE = 25;
export const BOOKING_OPERATION_MAX_ATTEMPTS = 16;
export const BOOKING_OPERATION_MAX_BACKOFF_MS = 5 * 60 * 1000;
export const BOOKING_OPERATION_CLAIM_LEASE_MS = 30_000;

export const bookingOperationBackoffMs = (attemptCount: number): number => {
  const exponent = Math.min(Math.max(attemptCount, 0), 8);
  return Math.min(BOOKING_OPERATION_MAX_BACKOFF_MS, 2_000 * 2 ** exponent);
};
