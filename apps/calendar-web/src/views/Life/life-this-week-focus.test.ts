import { isLifeThisWeekFocusEligible } from "@web/views/Life/life-this-week-focus";
import { describe, expect, it } from "bun:test";

describe("isLifeThisWeekFocusEligible", () => {
  it("is false without a birth date", () => {
    expect(isLifeThisWeekFocusEligible({ birthDate: "" })).toBe(false);
  });

  it("is true when the birth date parses", () => {
    expect(isLifeThisWeekFocusEligible({ birthDate: "1990-01-01" })).toBe(true);
  });
});
