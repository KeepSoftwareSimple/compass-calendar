import {
  historicalMemoryWindow,
  nextReflectionSend,
  reflectionSendAt,
  reflectionWindows,
} from "@backend/email/reflection-schedule";
import { describe, expect, it } from "bun:test";

describe("reflection schedule", () => {
  it("sends on Sunday morning across daylight saving changes", () => {
    expect(reflectionSendAt("2026-10-25", "America/Denver").toISOString()).toBe(
      "2026-10-25T16:30:00.000Z",
    );
    expect(reflectionSendAt("2026-11-01", "America/Denver").toISOString()).toBe(
      "2026-11-01T17:30:00.000Z",
    );
    expect(
      nextReflectionSend(
        new Date("2026-10-26T17:00:00Z"),
        "America/Denver",
        "weekly",
      ).toISOString(),
    ).toBe("2026-11-01T17:30:00.000Z");
  });
  it("never replays a missed morning after noon", () => {
    expect(
      nextReflectionSend(
        new Date("2026-11-01T20:00:00Z"),
        "America/Denver",
        "weekly",
      ).toISOString(),
    ).toBe("2026-11-08T17:30:00.000Z");
    expect(
      nextReflectionSend(
        new Date("2026-11-02T20:00:00Z"),
        "America/Denver",
        "daily",
      ).toISOString(),
    ).toBe("2026-11-03T17:30:00.000Z");
  });
  it("recaps the week so far and previews Monday through Sunday", () => {
    const [recent, upcoming] = reflectionWindows(
      "2026-11-01",
      "America/Denver",
      "weekly",
    );
    expect(recent?.start).toBe("2026-10-26T06:00:00.000Z");
    expect(recent?.end).toBe("2026-11-01T17:30:00.000Z");
    expect(upcoming?.start).toBe("2026-11-02T07:00:00.000Z");
    expect(upcoming?.end).toBe("2026-11-09T07:00:00.000Z");
  });
  it.each(["2026-11-07", "2026-11-01", "2027-01-01"])(
    "keeps daily trial windows disjoint on %s",
    (date) => {
      const [recent, upcoming] = reflectionWindows(
        date,
        "America/Denver",
        "daily",
      );
      expect(recent!.end).toBe(upcoming!.start);
      expect(recent!.endDate).toBe(upcoming!.startDate);
      expect(upcoming!.startDate).toBe(date);
      expect(
        new Date(upcoming!.end).getTime() - new Date(upcoming!.start).getTime(),
      ).toBeGreaterThanOrEqual(7 * 86_400_000);
    },
  );
  it("includes a historical week crossing a month/year boundary and clamps leap days", () => {
    const january = historicalMemoryWindow(
      "2026-01-04",
      "America/Denver",
      2020,
      "2025-12-29",
    );
    expect(january.startDate).toBe("2019-12-29");
    expect(january.endDate).toBe("2020-02-01");
    const leap = historicalMemoryWindow(
      "2024-02-29",
      "America/Denver",
      2023,
      "2024-02-26",
    );
    expect(leap.endDate).toBe("2023-03-01");
  });
});
