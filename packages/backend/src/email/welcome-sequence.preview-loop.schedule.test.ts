import {
  nextPreviewLoopMonthlyStart,
  nextPreviewLoopMonthlyStartAfterCompletion,
  previewLoopMonthStartUtc,
} from "@backend/email/welcome-sequence.preview-loop.schedule";
import { describe, expect, it } from "bun:test";

describe("preview loop monthly schedule (America/Denver)", () => {
  it("anchors on the 1st at 8:00 local", () => {
    const nov = previewLoopMonthStartUtc(2026, 11);
    expect(nov.toISOString()).toBe("2026-11-01T14:00:00.000Z");
  });

  it("picks the upcoming 1st when still before it this month", () => {
    const from = new Date("2026-10-01T13:00:00.000Z");
    expect(nextPreviewLoopMonthlyStart(from).toISOString()).toBe(
      "2026-10-01T14:00:00.000Z",
    );
  });

  it("skips to the next month after the 1st has passed", () => {
    const from = new Date("2026-10-28T12:00:00.000Z");
    expect(nextPreviewLoopMonthlyStart(from).toISOString()).toBe(
      "2026-11-01T14:00:00.000Z",
    );
  });

  it("rolls year forward from December", () => {
    const from = new Date("2026-12-02T16:00:00.000Z");
    expect(nextPreviewLoopMonthlyStart(from).toISOString()).toBe(
      "2027-01-01T15:00:00.000Z",
    );
  });

  it("uses MST offset after fall DST ends", () => {
    const from = new Date("2026-11-02T12:00:00.000Z");
    expect(nextPreviewLoopMonthlyStart(from).toISOString()).toBe(
      "2026-12-01T15:00:00.000Z",
    );
  });

  it("uses MDT offset on the spring 1st", () => {
    const from = new Date("2026-03-15T12:00:00.000Z");
    expect(nextPreviewLoopMonthlyStart(from).toISOString()).toBe(
      "2026-04-01T14:00:00.000Z",
    );
  });

  it("schedules the month after completion in Denver", () => {
    const completed = new Date("2026-10-15T20:00:00.000Z");
    expect(
      nextPreviewLoopMonthlyStartAfterCompletion(completed).toISOString(),
    ).toBe("2026-11-01T14:00:00.000Z");
  });

  it("rolls completion into January after a December finish", () => {
    const completed = new Date("2026-12-20T18:00:00.000Z");
    expect(
      nextPreviewLoopMonthlyStartAfterCompletion(completed).toISOString(),
    ).toBe("2027-01-01T15:00:00.000Z");
  });
});
