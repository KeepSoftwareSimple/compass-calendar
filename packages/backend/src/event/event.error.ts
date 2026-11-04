import { ZodError, type z } from "zod/v4";
import { BaseError } from "@core/errors/errors.base";
import { Status } from "@core/errors/status.codes";
import { Logger } from "@core/logger/winston.logger";
import {
  type EventMutationError,
  type EventMutationErrorCodeSchema,
} from "@core/types/event-command.contracts";
import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { type SyncClientError } from "@backend/common/services/sync-service/sync-service.client";

const logger = Logger("app:event.error");

const GENERIC_MUTATION_FAILURE_MESSAGE =
  "Something went wrong. Please try again.";

export type EventMutationErrorCode = z.infer<
  typeof EventMutationErrorCodeSchema
>;

/**
 * One row per mutation code: the HTTP status it answers with and whether a
 * client should retry it. The two are decided together (a 502 the client may
 * retry against a 403 no retry can clear), so they share an entry instead of
 * living in two tables a new code has to be added to twice, 30 lines apart.
 */
const POLICY_BY_CODE: Record<
  EventMutationErrorCode,
  { status: Status; retryable: boolean }
> = {
  EVENT_NOT_FOUND: { status: Status.NOT_FOUND, retryable: false },
  CALENDAR_NOT_FOUND: { status: Status.NOT_FOUND, retryable: false },
  CALENDAR_READ_ONLY: { status: Status.FORBIDDEN, retryable: false },
  RECURRENCE_CONFLICT: { status: Status.CONFLICT, retryable: false },
  DUPLICATE_EVENT_ID: { status: Status.CONFLICT, retryable: false },
  INVALID_SCHEDULE: { status: Status.BAD_REQUEST, retryable: false },
  INVALID_OCCURRENCE_ID: { status: Status.BAD_REQUEST, retryable: false },
  PROVIDER_FAILURE: { status: 502 as Status, retryable: true },
  SYNC_UNAVAILABLE: { status: Status.SERVICE_UNAVAILABLE, retryable: true },
  // 410 Gone, not 401: SuperTokens treats every 401 as a Compass session
  // expiry and retries the request after refresh. Google revocation must not
  // share that status or event creates loop until maxRetryAttemptsForSessionRefresh.
  CONNECTION_REVOKED: { status: Status.GONE, retryable: false },
  MAINTENANCE: { status: Status.SERVICE_UNAVAILABLE, retryable: true },
  MOVE_UNSUPPORTED: { status: Status.BAD_REQUEST, retryable: false },
  INVALID_INPUT: { status: Status.BAD_REQUEST, retryable: false },
  BILLING_REQUIRED: { status: Status.FORBIDDEN, retryable: false },
  // 403 like CALENDAR_READ_ONLY: the provider refuses the operation for this
  // event (e.g. deleting one occurrence of a Google birthday event) — not a
  // provider outage, so never the retryable 502 it used to surface as.
  UNSUPPORTED_OPERATION: { status: Status.FORBIDDEN, retryable: false },
  PROVIDER_REJECTED: { status: 502 as Status, retryable: true },
  // 403 like the capability refusals above: guests can only be written to a
  // writable calendar that can invite attendees, and retrying cannot change that.
  ATTENDEES_UNSUPPORTED: { status: Status.FORBIDDEN, retryable: false },
};

export class EventMutationException extends BaseError {
  constructor(
    public readonly mutationCode: EventMutationErrorCode,
    message: string,
    // The Sync failure behind this error, when it came from a Sync call. Kept
    // off the client payload (`toEventMutationError` never reads it) and used
    // only for logging: the event read path answers every Sync failure with
    // PROVIDER_FAILURE, so its status alone cannot tell a Sync restart from a
    // defect, and the correlation id belongs in the log rather than in the
    // message, which PostHog groups issues by.
    public readonly syncError?: SyncClientError,
    // Calendar provider for user-facing save-failure copy when known.
    public readonly provider?: ProviderKind,
  ) {
    super(
      mutationCode,
      message,
      POLICY_BY_CODE[mutationCode].status,
      true,
      mutationCode,
    );
  }
}

export const eventMutationError = (
  code: EventMutationErrorCode,
  message: string,
  syncError?: SyncClientError,
  provider?: ProviderKind,
): EventMutationException =>
  new EventMutationException(code, message, syncError, provider);

/**
 * Maps any thrown error into the strict EventMutationError envelope (B5).
 * Never leaks the generic `{ result, message }` shape from event/calendar
 * routes.
 */
export const toEventMutationError = (
  e: unknown,
): { status: Status; body: EventMutationError } => {
  if (e instanceof EventMutationException) {
    return {
      status: POLICY_BY_CODE[e.mutationCode].status,
      body: {
        code: e.mutationCode,
        message: e.message,
        retryable: POLICY_BY_CODE[e.mutationCode].retryable,
        ...(e.provider ? { provider: e.provider } : {}),
      },
    };
  }

  if (e instanceof BaseError && e.code) {
    const code = e.code as EventMutationErrorCode;
    if (code in POLICY_BY_CODE) {
      return {
        status: POLICY_BY_CODE[code].status,
        body: {
          code,
          message: e.description,
          retryable: POLICY_BY_CODE[code].retryable,
        },
      };
    }
  }

  // A contract violation (e.g. CreateEventInputSchema.parse rejecting an
  // unrecognized key) is a client-side mistake, not a provider outage — map
  // it to its own code/status rather than falling into the provider-failure
  // catch-all below, which used to mislabel it as a retryable 500.
  if (e instanceof ZodError) {
    const message = e.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return {
      status: POLICY_BY_CODE.INVALID_INPUT.status,
      body: {
        code: "INVALID_INPUT",
        message,
        retryable: POLICY_BY_CODE.INVALID_INPUT.retryable,
      },
    };
  }

  // Programmer bugs and unexpected throws are not provider outages — never
  // advertise them as retryable or clients will hammer the same broken path.
  logger.error("Unexpected event mutation error", e);
  return {
    status: Status.INTERNAL_SERVER,
    body: {
      code: "PROVIDER_FAILURE",
      message: GENERIC_MUTATION_FAILURE_MESSAGE,
      retryable: false,
    },
  };
};
