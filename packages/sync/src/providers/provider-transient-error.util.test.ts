import { ProviderEventReadError } from "@sync/providers/provider-event-reader.port";
import { ProviderNotificationError } from "@sync/providers/provider-notifications.port";
import {
  isRetryableProviderResponseParseFailure,
  isTransientProviderError,
  logSyncJobEngineError,
} from "@sync/providers/provider-transient-error.util";
import { describe, expect, it, mock } from "bun:test";

describe("isTransientProviderError", () => {
  it("returns true for a transient provider error in the cause chain", () => {
    const cause = new ProviderEventReadError("transient", "429");
    const wrapped = new Error("Sync job incrementalPull failed: 429", {
      cause,
    });
    expect(isTransientProviderError(wrapped)).toBe(true);
  });

  it("returns true for a direct transient notification error", () => {
    const error = new ProviderNotificationError(
      "transient",
      "Google watch temporarily unavailable",
    );
    expect(isTransientProviderError(error)).toBe(true);
  });

  it("returns false for a durable provider rejection", () => {
    const error = new ProviderEventReadError("readFailed", "404");
    expect(isTransientProviderError(error)).toBe(false);
  });

  it("returns true when a request timeout sits in the cause chain", () => {
    const timeout = new DOMException(
      "The operation timed out.",
      "TimeoutError",
    );
    const wrapped = new Error(
      "Sync job calendarListSync (job-id) attempt 1 failed: The operation timed out.",
      { cause: timeout },
    );
    expect(isTransientProviderError(wrapped)).toBe(true);
  });

  it("returns true when a JSON parse failure sits in the cause chain", () => {
    const parse = Object.assign(new SyntaxError("Failed to parse JSON"), {
      response: { status: 503, headers: { "content-type": "text/html" } },
    });
    const wrapped = new Error("Sync job calendarListSync failed", {
      cause: parse,
    });
    expect(isTransientProviderError(wrapped)).toBe(true);
  });
});

describe("isRetryableProviderResponseParseFailure", () => {
  it("treats a parse failure with a gateway HTML status as retryable", () => {
    const error = Object.assign(new SyntaxError("Failed to parse JSON"), {
      response: {
        status: 502,
        headers: { "content-type": "text/html" },
      },
    });
    expect(isRetryableProviderResponseParseFailure(error)).toBe(true);
  });

  it("does not treat a parse failure on a durable 4xx JSON error as retryable", () => {
    const error = Object.assign(new SyntaxError("Failed to parse JSON"), {
      response: {
        status: 400,
        headers: { "content-type": "application/json" },
      },
    });
    expect(isRetryableProviderResponseParseFailure(error)).toBe(false);
  });
});

describe("logSyncJobEngineError", () => {
  it("logs transient failures at warn", () => {
    const logger = {
      warn: mock(() => {}),
      error: mock(() => {}),
    };
    const error = new ProviderEventReadError("transient", "flaky");

    logSyncJobEngineError(logger, "engine failed", error);

    expect(logger.warn).toHaveBeenCalledWith("engine failed", error);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs non-transient failures at error", () => {
    const logger = {
      warn: mock(() => {}),
      error: mock(() => {}),
    };
    const error = new Error("mongo down");

    logSyncJobEngineError(logger, "engine failed", error);

    expect(logger.error).toHaveBeenCalledWith("engine failed", error);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
