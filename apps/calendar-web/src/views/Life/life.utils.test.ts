import {
  clampLifespan,
  clampWeeksLived,
  formatDateInputValue,
  getAgeInYears,
  getCurrentWeekLabel,
  getLifeDotLabel,
  getRandomLifespan,
  getTotalLifeDots,
  getWeekLivedCount,
  parseLifeDate,
} from "./life.utils";
import { describe, expect, it } from "bun:test";

describe("life utils", () => {
  it("calculates and caps lived weeks", () => {
    const today = new Date(2026, 0, 1);

    expect(getWeekLivedCount("2000-01-01", 79 * 52, today)).toBe(1356);
    expect(getWeekLivedCount("2026-12-31", 79 * 52, today)).toBe(0);
    expect(getWeekLivedCount("1900-01-01", 79 * 52, today)).toBe(79 * 52);
  });

  it("calculates total dots from a clamped lifespan", () => {
    expect(getTotalLifeDots(85)).toBe(85 * 52);
    expect(getTotalLifeDots(Number.NaN)).toBe(77 * 52);
    expect(getTotalLifeDots(-1)).toBe(1 * 52);
    expect(getTotalLifeDots(151)).toBe(150 * 52);
  });

  it("parses real yyyy-mm-dd dates only", () => {
    expect(parseLifeDate("2024-02-29")?.getDate()).toBe(29);
    expect(parseLifeDate("2025-02-29")).toBeNull();
    expect(parseLifeDate("1/1/2000")).toBeNull();
  });

  it("formats local dates for date inputs", () => {
    expect(formatDateInputValue(new Date(2026, 0, 9))).toBe("2026-01-09");
  });

  it("clamps lifespan values to the supported range", () => {
    expect(clampLifespan(80.6)).toBe(81);
    expect(clampLifespan(0)).toBe(1);
    expect(clampLifespan(151)).toBe(150);
    expect(clampLifespan(Number.NaN)).toBe(77);
  });

  it("formats dot tooltip labels from one-indexed week numbers", () => {
    expect(getLifeDotLabel(1)).toBe("Year 1, Week 1");
    expect(getLifeDotLabel(105)).toBe("Year 3, Week 1");
  });

  it("formats the current week tooltip with the available lifespan", () => {
    expect(getCurrentWeekLabel(new Date(2026, 6, 21), 1713, 4000)).toBe(
      "Tuesday, July 21, 2026 | week 1714 / 4000",
    );
  });

  it("clamps arbitrary week counts to the available dot count", () => {
    expect(clampWeeksLived(-5, 100)).toBe(0);
    expect(clampWeeksLived(50, 100)).toBe(50);
    expect(clampWeeksLived(150, 100)).toBe(100);
  });

  it("calculates current age and bounds random lifespan", () => {
    const today = new Date(2026, 6, 21);

    expect(getAgeInYears("1993-09-14", today)).toBe(32);
    expect(getRandomLifespan("1993-09-14", today, () => 0)).toBe(32);
    expect(getRandomLifespan("1993-09-14", today, () => 0.999)).toBe(100);
    expect(getRandomLifespan("", today, () => 0)).toBe(1);
    expect(getRandomLifespan("2026-07-21", today, () => 0)).toBe(1);
  });
});
