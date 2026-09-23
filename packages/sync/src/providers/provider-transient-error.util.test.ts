import { ProviderEventReadError } from "@sync/providers/provider-event-reader.port";
import { ProviderNotificationError } from "@sync/providers/provider-notifications.port";
import {
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
