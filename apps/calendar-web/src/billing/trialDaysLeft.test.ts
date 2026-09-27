import dayjs from "@core/util/date/dayjs";
import {
  formatTrialBadgeDescription,
  formatTrialBadgeLabel,
  getTrialDaysLeft,
} from "@web/billing/trialDaysLeft";
import { describe, expect, it } from "bun:test";

const now = dayjs("2026-08-27T12:00:00.000Z");

describe("getTrialDaysLeft", () => {
  it("rounds a partial final day up to 1", () => {
    expect(getTrialDaysLeft("2026-08-27T18:00:00.000Z", now)).toBe(1);
  });

  it("counts a full seven-day trial", () => {
    expect(getTrialDaysLeft("2026-09-03T12:00:00.000Z", now)).toBe(7);
  });

  it("rounds a partial day up rather than down", () => {
    expect(getTrialDaysLeft("2026-09-03T13:00:00.000Z", now)).toBe(8);
  });

  it("clamps a past end date to 0", () => {
    expect(getTrialDaysLeft("2026-08-20T12:00:00.000Z", now)).toBe(0);
  });

  it("returns 0 for an unparseable date rather than NaN", () => {
    expect(getTrialDaysLeft("not-a-date", now)).toBe(0);
  });
});

describe("trial badge copy", () => {
  it("labels the last day without a number", () => {
    expect(formatTrialBadgeLabel(0)).toBe("Last day");
    expect(formatTrialBadgeDescription(0)).toBe("Last day of your trial");
  });

  it("uses a compact label and a full description", () => {
    expect(formatTrialBadgeLabel(7)).toBe("7d");
    expect(formatTrialBadgeDescription(7)).toBe("7 days left in your trial");
  });

  it("singularizes one day", () => {
    expect(formatTrialBadgeLabel(1)).toBe("1d");
    expect(formatTrialBadgeDescription(1)).toBe("1 day left in your trial");
  });
});
