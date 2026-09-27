import {
  EVENT_COLOR_SLOT_HEX,
  getEventPalette,
} from "@web/common/styles/theme.util";
import { describe, expect, it } from "bun:test";

describe("theme.util event color slots", () => {
  it("maps all 11 slots to Google modern palette hexes", () => {
    expect(Object.keys(EVENT_COLOR_SLOT_HEX)).toHaveLength(11);
    expect(EVENT_COLOR_SLOT_HEX.lavender).toBe("#7986CB");
    expect(EVENT_COLOR_SLOT_HEX.blue).toBe("#039BE5");
    expect(EVENT_COLOR_SLOT_HEX.red).toBe("#D50000");
  });

  it("builds a palette from a color slot and falls back to the theme default", () => {
    expect(getEventPalette("coral").base).toBe(EVENT_COLOR_SLOT_HEX.coral);
    expect(getEventPalette("coral").hover).not.toBe(
      getEventPalette("coral").base,
    );
    expect(getEventPalette().base).not.toBe(EVENT_COLOR_SLOT_HEX.coral);
  });

  it("prefers colorHex over a color slot, and colorHex over the theme default", () => {
    expect(getEventPalette(undefined, "#009688").base).toBe("#009688");
    expect(getEventPalette("coral", "#009688").base).toBe("#009688");
  });
});
