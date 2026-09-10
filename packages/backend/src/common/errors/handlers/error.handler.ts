import { POSTHOG_ERROR_TRACKING_PROPERTY } from "@core/constants/posthog-error-tracking.properties";
import { BaseError } from "@core/errors/errors.base";
import { Status } from "@core/errors/status.codes";
import { Logger } from "@core/logger/winston.logger";
import { type ErrorMetadata } from "@backend/common/types/error.types";

const logger = Logger("app:error.handler");

// An OPERATIONAL 503 is a service-state condition the caller is expected to
// retry through, not a defect in this process: the sync service is briefly
// unreachable (AuthError.SyncConnectionUnavailable, e.g. during its own
// deploy), maintenance mode is on, or Google isn't configured for this
// instance. PostHogExceptionTransport only listens at `error`, so logging
// these at `error` captured them as exceptions and — via the error-autofix
// pipeline — filed GitHub issues for what is really upstream downtime. Log
// them at `warn` instead: same message and metadata in the server log and
// OTel, but no exception. A sustained outage still surfaces through the sync
// service's own error telemetry and the gap in its sync_health_snapshot beat,
// which is the signal that actually distinguishes "down" from "restarting".
export const logLevelForError = (error: Error): "warn" | "error" =>
  error instanceof BaseError &&
  error.isOperational &&
  error.statusCode === Status.SERVICE_UNAVAILABLE
    ? "warn"
    : "error";

/**
 * Transforms error metadata into a BaseError class
 * @param cause The cause of the error
 * @param result The result of the error
 * @returns
 */
export const error = (cause: ErrorMetadata, result: string) => {
  return new BaseError(
    result,
    cause.description,
    cause.status,
    cause.isOperational,
    cause.code,
  );
};

/**
 * Returns a safe payload for BaseError to send to clients.
 * Avoids exposing stack, isOperational, or other internal details.
 */
export const toClientErrorPayload = (e: BaseError) => {
  const payload = {
    result: e.result,
    message: e.description,
  };

  return e.code ? { ...payload, code: e.code } : payload;
};

class ErrorHandler {
  public isOperational(error: Error): boolean {
    if (error instanceof BaseError) {
      return error.isOperational;
    }
    return true;
  }

  public log(
    error: Error,
    context?: {
      method?: string;
      path?: string;
      status?: number;
      userId?: string | null;
      correlationId?: string;
    },
  ): void {
    // JSON.stringify(error) on a plain Error serializes to "{}" - name,
    // message, and stack are non-enumerable - and this used to be the ONLY
    // log line emitted for every backend HTTP error (see
    // error.express.handler.ts's handleExpressError), so failures left no
    // trace of why. Log the message/stack, never the raw error object: this
    // runs unconditionally, before the Google-error branch even checks the
    // error's shape, so `error` here can be a GaxiosError whose `config`/
    // `response` fields (request headers, client_secret, bearer tokens) are
    // OWN ENUMERABLE properties (unlike Error.prototype's message/stack) -
    // passing the object itself to the logger would serialize those secrets
    // straight into the log output.
    const meta: {
      stack?: string;
      method?: string;
      path?: string;
      status?: number;
      userId?: string;
      correlationId?: string;
      result?: string;
      errorType?: string;
    } = { stack: error.stack };
    if (context?.method !== undefined) meta.method = context.method;
    if (context?.path !== undefined) meta.path = context.path;
    if (context?.status !== undefined) meta.status = context.status;
    if (context?.userId != null) meta.userId = context.userId;
    if (context?.correlationId !== undefined) {
      meta.correlationId = context.correlationId;
    }
    if (error instanceof BaseError) {
      meta[POSTHOG_ERROR_TRACKING_PROPERTY.result] = error.result;
      meta[POSTHOG_ERROR_TRACKING_PROPERTY.errorType] =
        error.code ?? error.constructor.name;
    }
    logger[logLevelForError(error)](error.message || String(error), meta);
  }

  exitAfterProgrammerError(): void {
    logger.error(
      "Programmer error occurred. Exiting to prevent app instability",
    );
    // uses 500 as code for the response error, but if the error is one of our own,
    // then a more accurate code will be given in the payload
    process.exit(1);
  }
}

export const errorHandler = new ErrorHandler();
