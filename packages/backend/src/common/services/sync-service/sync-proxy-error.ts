import { Status } from "@core/errors/status.codes";
import { AuthError } from "@backend/common/errors/auth/auth.errors";
import { error } from "@backend/common/errors/handlers/error.handler";
import { type SyncClientErrorKind } from "@backend/common/services/sync-service/sync-service.client";
import { eventMutationError } from "@backend/event/event.error";

// The one place that decides which Sync failures are operational: our own
// backpressure or a Sync restart the caller retries through, versus a defect
// (a drifted internalAuthToken, a broken response contract, a query Sync
// rejects outright). Everything below branches on this rather than repeating
// the kind list.
const isOperationalKind = (kind: SyncClientErrorKind) =>
  kind === "timeout" || kind === "unavailable";

// The log level a caller should use for a failed Sync call, mirroring
// logLevelForError's operational-503 downgrade. Callers that answer their own
// errors (the event controller writes responses directly, so the global error
// handler never logs the exception) must choose the level themselves, and
// PostHogExceptionTransport only listens at `error` — so a defect logged at
// `warn` is never captured as an exception.
export function logLevelForSyncClientError(
  kind: SyncClientErrorKind,
): "warn" | "error" {
  return isOperationalKind(kind) ? "warn" : "error";
}

// Map a failed Sync HTTP call on a read/proxy route into a real HTTP status.
// Never Status.UNSURE (600). Timeout/unavailable → 503; other failures → 502.
// `detail` is the log-safe SyncClientError.detail (an invalidResponse's
// contract mismatch, or an unexpectedStatus's raw status): appended to the
// message so the error-tracking issue names which field broke the contract,
// or which status Sync answered with, instead of just that it broke. It
// carries field names, Zod issue codes, a content-type header, or a status
// code only — never a field value — so it is safe in the message the handler
// logs and returns.
export function throwSyncProxyFailure(
  kind: SyncClientErrorKind,
  userMessage: string,
  detail?: string,
): never {
  const message = detail ? `${userMessage}: ${detail}` : userMessage;
  if (isOperationalKind(kind)) {
    throw error(AuthError.SyncConnectionUnavailable, message);
  }
  throw error(
    {
      description: "Sync service returned an unexpected failure",
      status: Status.BAD_GATEWAY,
      isOperational: true,
      code: "SYNC_PROXY_FAILURE",
    },
    message,
  );
}

// Map a failed Sync command submit. Never GenericError.NotSure / HTTP 600.
// Timeout/unavailable are our own backpressure rather than a provider verdict,
// so they mirror the read path's 503 instead of surfacing as a 502 (the two
// paths disagreed until 2026-08-23, which made a Sync throttle look like a bad
// gateway in the logs). Both stay retryable: Sync may already have applied the
// write, so a caller MUST retry with the SAME idempotency key.
export function throwSyncCommandSubmitFailure(
  kind: SyncClientErrorKind,
): never {
  if (isOperationalKind(kind)) {
    throw eventMutationError(
      "SYNC_UNAVAILABLE",
      `Sync command ${kind}; the mutation may already be applied`,
    );
  }
  throw eventMutationError(
    "PROVIDER_FAILURE",
    `Failed to submit command to sync (${kind})`,
  );
}
