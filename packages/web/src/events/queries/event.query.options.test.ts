import { type ApiError } from "@web/api/api.types";
import { weekEventsQueryOptions } from "./event.query.options";
import { describe, expect, it } from "bun:test";

const options = weekEventsQueryOptions({
  source: "remote",
  startDate: "2026-08-16T00:00:00.000Z",
  endDate: "2026-08-23T00:00:00.000Z",
});

const shouldRetry = options.retry as (
  failureCount: number,
  error: unknown,
) => boolean;

describe("event query retry policy", () => {
  it("retries short backend availability failures", () => {
    const error = new Error("Request failed") as ApiError;
    error.name = "ApiError";

    expect(shouldRetry(0, error)).toBe(true);
    expect(shouldRetry(2, error)).toBe(true);
    expect(shouldRetry(3, error)).toBe(false);
  });

  it("does not retry request-specific failures", () => {
    expect(shouldRetry(0, new Error("Invalid event range"))).toBe(false);
  });

  it("does not retry an aborted range read", () => {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    expect(shouldRetry(0, error)).toBe(false);
  });
});
