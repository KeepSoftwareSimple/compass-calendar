import {
  formatGridHour,
  gridOffsetPercent,
  percentBlockStyle,
} from "@web/components/ShortcutShowcase/game-grid.util";
import { describe, expect, it } from "bun:test";

describe("game-grid.util", () => {
  it("formats hours with the shared AM short clock", () => {
    expect(formatGridHour(9)).toMatch(/9/);
    expect(formatGridHour(12)).toMatch(/12/);
  });

  it("places a block as a percent of the visible grid", () => {
    expect(percentBlockStyle(10 * 60, 60, 9 * 60, 8 * 60)).toEqual({
      top: "12.5%",
      height: "12.5%",
    });
    expect(gridOffsetPercent(9 * 60, 9 * 60, 8 * 60)).toBe("0%");
  });
});
