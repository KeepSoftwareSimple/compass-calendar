import {
  isRetryableProviderHttpStatus,
  parseRetryAfterMs,
  providerHttpRetryDelayMs,
  withRetryableProviderHttp,
} from "@sync/providers/provider-http-retry.util";
import { runWithInlineProviderRequestBudget } from "@sync/providers/provider-inline-request-budget";
import { describe, expect, it, mock } from "bun:test";

describe("parseRetryAfterMs", () => {
  it("parses a delay in seconds", () => {
    expect(parseRetryAfterMs("30", 0)).toBe(30_000);
  });

  it("parses an HTTP-date", () => {
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    expect(parseRetryAfterMs("Wed, 01 Jan 2026 00:00:30 GMT", now)).toBe(
      30_000,
    );
  });
});

describe("providerHttpRetryDelayMs", () => {
  it("prefers Retry-After over exponential backoff", () => {
    expect(providerHttpRetryDelayMs(2, 5_000)).toBe(5_000);
  });

  it("exponential backoff when Retry-After is missing", () => {
    expect(providerHttpRetryDelayMs(1, undefined, 1_000)).toBe(1_000);
    expect(providerHttpRetryDelayMs(2, undefined, 1_000)).toBe(2_000);
  });
});

describe("isRetryableProviderHttpStatus", () => {
  it("treats 429, 503, and 5xx as retryable", () => {
    expect(isRetryableProviderHttpStatus(429)).toBe(true);
    expect(isRetryableProviderHttpStatus(503)).toBe(true);
    expect(isRetryableProviderHttpStatus(500)).toBe(true);
    expect(isRetryableProviderHttpStatus(404)).toBe(false);
  });
});

describe("withRetryableProviderHttp", () => {
  it("retries retryable failures until success", async () => {
    const sleep = mock(() => Promise.resolve());
    const operation = mock(() => {
      if (operation.mock.calls.length < 3) {
        return Promise.reject(
          Object.assign(new Error("throttled"), { response: { status: 429 } }),
        );
      }
      return Promise.resolve("ok");
    });

    await expect(
      withRetryableProviderHttp(operation, {
        sleep,
        readRetryAfterMs: () => 12,
      }),
    ).resolves.toBe("ok");

    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls[0]?.[0]).toBe(12);
  });

  it("caps Retry-After during an inline command request", async () => {
    const sleep = mock(() => Promise.resolve());
    const operation = mock()
      .mockRejectedValueOnce(
        Object.assign(new Error("throttled"), { response: { status: 503 } }),
      )
      .mockResolvedValueOnce("ok");

    await runWithInlineProviderRequestBudget(() =>
      withRetryableProviderHttp(operation, {
        sleep,
        readRetryAfterMs: () => 600_000,
      }),
    );

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep.mock.calls[0]?.[0]).toBeLessThanOrEqual(2_000);
  });

  it("does not retry a non-retryable status", async () => {
    const operation = mock(() =>
      Promise.reject(
        Object.assign(new Error("nope"), { response: { status: 400 } }),
      ),
    );

    await expect(
      withRetryableProviderHttp(operation, { maxAttempts: 5 }),
    ).rejects.toThrow("nope");
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
