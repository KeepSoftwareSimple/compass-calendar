import { edgeFocusHintParts } from "@web/grid/shortcuts/edge-focus-hint.parts";
import { getPartsPlainText } from "@web/shortcuts/tips/shortcut-tips.data";
import { describe, expect, it } from "bun:test";

describe("edgeFocusHintParts", () => {
  it("teaches timed start-edge nudges", () => {
    const text = getPartsPlainText(
      edgeFocusHintParts("startDate", false, "Editing start time"),
    );
    expect(text).toContain("Shift");
    expect(text).toMatch(/adjusts start/i);
    expect(text).toMatch(/Tab cycles target/i);
    expect(text).not.toBe("Editing start time");
  });

  it("keeps a nudge result and still teaches the next adjustment", () => {
    const text = getPartsPlainText(
      edgeFocusHintParts("startDate", false, "Start 9:15 AM"),
    );
    expect(text).toContain("Start 9:15 AM");
    expect(text).toMatch(/adjusts start/i);
  });

  it("uses horizontal arrows for all-day whole-event moves", () => {
    const text = getPartsPlainText(
      edgeFocusHintParts(null, true, "Editing whole event"),
    );
    expect(text).toMatch(/ArrowLeft/);
    expect(text).toMatch(/moves event/i);
    expect(text).not.toContain("ArrowUp");
  });
});
