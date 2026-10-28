import {
  googleErrorReasons,
  hasGoogleRateLimitReason,
  summarizeGoogleScheduleForLog,
} from "@sync/providers/google/google-error";
import { describe, expect, it } from "bun:test";

describe("googleErrorReasons", () => {
  it("reads reasons from the response body and the error object", () => {
    expect(
      googleErrorReasons({
        response: { data: { error: { errors: [{ reason: "badRequest" }] } } },
        errors: [{ reason: "rateLimitExceeded" }],
      }),
    ).toEqual(["badRequest", "rateLimitExceeded"]);
  });
});

describe("hasGoogleRateLimitReason", () => {
  it("treats quota reasons as retryable even when they sit on the error object", () => {
    expect(
      hasGoogleRateLimitReason({
        errors: [{ reason: "rateLimitExceeded" }],
      }),
    ).toBe(true);
    expect(
      hasGoogleRateLimitReason({
        response: { data: { error: { errors: [{ reason: "forbidden" }] } } },
      }),
    ).toBe(false);
  });
});

describe("summarizeGoogleScheduleForLog", () => {
  it("flags a start after its end and a mixed date/dateTime start", () => {
    expect(
      summarizeGoogleScheduleForLog({
        start: {
          date: "2026-10-29",
          dateTime: "2026-10-29T10:00:00Z",
          timeZone: "Europe/Berlin",
        },
        end: { date: null, dateTime: "2026-10-28T10:00:00Z", timeZone: null },
        recurrence: null,
      }),
    ).toBe(
      "start=both, end=timed, start.timeZone=y, end.timeZone=n, sameTimeZone=n, startVsEnd=after, recurrence=cleared",
    );
  });

  it("reports an unparsable time and an omitted recurrence key", () => {
    expect(
      summarizeGoogleScheduleForLog({
        start: { dateTime: "not-a-time", timeZone: "UTC" },
        end: { dateTime: "2026-10-28T10:00:00Z", timeZone: "UTC" },
      }),
    ).toBe(
      "start=timed, end=timed, start.timeZone=y, end.timeZone=y, sameTimeZone=y, startVsEnd=unparsed, recurrence=omitted",
    );
  });
});
