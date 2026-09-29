import { readability } from "@web/common/styles/color.utils";
import { theme } from "@web/common/styles/theme";
import { describe, expect, it } from "bun:test";

describe("theme.getContrastText", () => {
  it("picks the more readable token for a flat fill", () => {
    const onNearBlack = theme.getContrastText("#111111");
    const onNearWhite = theme.getContrastText("#f5f5f5");

    expect(readability(onNearBlack, "#111111")).toBeGreaterThan(4.5);
    expect(readability(onNearWhite, "#f5f5f5")).toBeGreaterThan(4.5);
    expect(onNearBlack).not.toBe(onNearWhite);
  });

  it("judges a gradient by its worst stop", () => {
    // One mid-dark stop and one dark stop: the token that reads on the dark
    // stop wins even though the mid stop alone might tip the other way.
    const text = theme.getContrastText(["#8a8a8a", "#1a1a1a"]);

    expect(text).toBe(theme.getContrastText("#1a1a1a"));
  });
});
