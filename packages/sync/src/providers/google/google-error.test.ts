import {
  describeGoogleRequestBodyForLog,
  describeGoogleWriteTargetForLog,
  googleErrorReasons,
  hasGoogleRateLimitReason,
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

describe("describeGoogleWriteTargetForLog", () => {
  it("names an occurrence target and an unconditional write, never the id", () => {
    expect(
      describeGoogleWriteTargetForLog({
        eventId: "abc123series_20261102T140000Z",
        ifMatch: null,
      }),
    ).toBe("target=instance, ifMatch=n");
  });

  it("names a whole-event target and a conditional write", () => {
    expect(
      describeGoogleWriteTargetForLog({
        eventId: "abc123series",
        ifMatch: '"etag-1"',
      }),
    ).toBe("target=event, ifMatch=y");
  });
});

describe("describeGoogleRequestBodyForLog", () => {
  it("logs the schedule shape of a series patch, never its values", () => {
    const message = describeGoogleRequestBodyForLog({
      summary: "Secret title",
      start: {
        date: null,
        dateTime: "2025-01-15T09:00:00-05:00",
        timeZone: "America/New_York",
      },
      end: {
        date: null,
        dateTime: "2025-01-15T10:00:00-05:00",
        timeZone: "America/New_York",
      },
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO", "EXDATE:20250120T140000Z"],
    });

    expect(message).toBe(
      "bodyKeys=[end,recurrence,start,summary]; schedule={start.date=n, start.dateTime=y, start.timeZone=y, end.date=n, end.dateTime=y, end.timeZone=y, sameTimeZone=y, startVsEnd=before, recurrence=series[RRULE,EXDATE]}",
    );
  });

  it("flags a start after its end and a cleared recurrence", () => {
    expect(
      describeGoogleRequestBodyForLog({
        start: { dateTime: "2026-10-29T10:00:00Z", timeZone: "Europe/Berlin" },
        end: { dateTime: "2026-10-28T10:00:00Z", timeZone: null },
        recurrence: null,
      }),
    ).toContain("sameTimeZone=n, startVsEnd=after, recurrence=cleared");
  });

  it("reports an unparsable time and an omitted recurrence key", () => {
    expect(
      describeGoogleRequestBodyForLog({
        start: { dateTime: "not-a-time", timeZone: "UTC" },
        end: { dateTime: "2026-10-28T10:00:00Z", timeZone: "UTC" },
      }),
    ).toContain("startVsEnd=unparsed, recurrence=omitted");
  });

  it("logs only body keys when the body writes no schedule", () => {
    expect(describeGoogleRequestBodyForLog({ eventLabelId: "" })).toBe(
      "bodyKeys=[eventLabelId]",
    );
    expect(describeGoogleRequestBodyForLog(undefined)).toBe("bodyKeys=[]");
  });
});
