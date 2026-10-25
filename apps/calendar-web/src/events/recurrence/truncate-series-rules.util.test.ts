import { truncateSeriesRulesBefore } from "./truncate-series-rules.util";
import { describe, expect, test } from "bun:test";

describe("truncateSeriesRulesBefore", () => {
  test("truncates a timed daily rule one second before the split instant", () => {
    expect(
      truncateSeriesRulesBefore(
        ["RRULE:FREQ=DAILY;COUNT=10"],
        "2026-05-06T09:00:00Z",
      ),
    ).toEqual(["RRULE:FREQ=DAILY;UNTIL=20260506T085959Z"]);
  });

  test("emits full timed UTC UNTIL for all-day splits, never a bare date", () => {
    expect(
      truncateSeriesRulesBefore(["RRULE:FREQ=DAILY;COUNT=10"], "2026-08-04"),
    ).toEqual(["RRULE:FREQ=DAILY;UNTIL=20260803T235959Z"]);
  });

  test("passes through non-RRULE lines unchanged", () => {
    expect(
      truncateSeriesRulesBefore(
        ["EXDATE:20260101T120000Z", "RRULE:FREQ=WEEKLY;COUNT=3"],
        "2026-05-06T09:00:00.000Z",
      ),
    ).toEqual([
      "EXDATE:20260101T120000Z",
      "RRULE:FREQ=WEEKLY;UNTIL=20260506T085959Z",
    ]);
  });
});
