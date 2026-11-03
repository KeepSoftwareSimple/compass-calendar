import { isBackendUnavailableError } from "@web/api/util/backend-unavailable-error.util";

/**
 * How many times an event write is re-sent after the backend could not be
 * reached. A production deploy swaps the backend container and leaves it
 * unreachable for roughly 25 to 40 seconds; with the backoff below the
 * retries span about 47 seconds, so a save made mid-deploy lands once the
 * new container is up instead of rolling back.
 */
export const EVENT_WRITE_UNAVAILABLE_RETRIES = 8;

const EVENT_WRITE_RETRY_BASE_MS = 1000;
const EVENT_WRITE_RETRY_MAX_MS = 8000;

/**
 * Only a write that never got an answer from the backend is re-sent. Any
 * response the backend authored (validation, conflict, billing, a retryable
 * Sync failure) is its decision and goes straight to the user. Re-sending is
 * safe because every event command carries an idempotency key that Sync
 * dedupes on, so a request that did land before the connection dropped is
 * not applied twice.
 */
export const shouldRetryEventWrite = (
  failureCount: number,
  error: unknown,
): boolean =>
  failureCount < EVENT_WRITE_UNAVAILABLE_RETRIES &&
  isBackendUnavailableError(error);

/** 1s, 2s, 4s, then every 8s. `attempt` is zero-based. */
export const eventWriteRetryDelay = (attempt: number): number =>
  Math.min(EVENT_WRITE_RETRY_BASE_MS * 2 ** attempt, EVENT_WRITE_RETRY_MAX_MS);
