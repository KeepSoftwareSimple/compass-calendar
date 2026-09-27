import {
  calendarAccentAccessibleSuffix,
  calendarAccentStyle,
  eventEdgeFocusShadow,
  eventFocusColor,
  eventFocusOutlineClass,
} from "./calendar-accent.util";
import { describe, expect, it } from "bun:test";

describe("calendarAccentStyle", () => {
  it("is a flat fill for an ordinary card", () => {
    expect(
      calendarAccentStyle({ name: "Work", backgroundColor: "#3b82f6" }),
    ).toEqual({ backgroundColor: "#3b82f6" });
  });

  it("is a gradient through every other copy's color for a merged card", () => {
    const style = calendarAccentStyle({
      name: "Work",
      backgroundColor: "#3b82f6",
      otherCopies: [
        { label: "ahab@gmail.com", backgroundColor: "#ef4444" },
        { label: "Miscellaneous", backgroundColor: "#22c55e" },
      ],
    });

    expect(style).toEqual({
      backgroundImage: "linear-gradient(to bottom, #3b82f6, #ef4444, #22c55e)",
    });
    // A flat fill and a gradient must never both apply - the gradient would
    // render underneath an opaque solid color and never be visible.
    expect(style).not.toHaveProperty("backgroundColor");
  });
});

describe("calendarAccentAccessibleSuffix", () => {
  it("names only the calendar for an ordinary card", () => {
    expect(
      calendarAccentAccessibleSuffix({
        name: "Work",
        backgroundColor: "#3b82f6",
      }),
    ).toBe(", Work calendar");
  });

  it("names the other copies too for a merged card", () => {
    expect(
      calendarAccentAccessibleSuffix({
        name: "Work",
        backgroundColor: "#3b82f6",
        otherCopies: [{ label: "ahab@gmail.com", backgroundColor: "#ef4444" }],
      }),
    ).toBe(", Work calendar, also on ahab@gmail.com");
  });

  it("joins several other copies in the label", () => {
    expect(
      calendarAccentAccessibleSuffix({
        name: "Work",
        backgroundColor: "#3b82f6",
        otherCopies: [
          { label: "ahab@gmail.com", backgroundColor: "#ef4444" },
          { label: "Miscellaneous", backgroundColor: "#22c55e" },
        ],
      }),
    ).toBe(", Work calendar, also on ahab@gmail.com and Miscellaneous");
  });
});

describe("eventFocusColor", () => {
  it("uses the calendar color when it contrasts with the page", () => {
    expect(eventFocusColor("#616161")).toBe("#616161");
  });

  it("falls back to --text when no calendar color is available", () => {
    expect(eventFocusColor(null)).toBe("var(--text)");
    expect(eventFocusColor(undefined)).toBe("var(--text)");
  });

  it("falls back to --text for near-white or low-contrast calendar colors", () => {
    // Local/anonymous calendar uses #ffffff — invisible on the light page.
    expect(eventFocusColor("#ffffff")).toBe("var(--text)");
    // Common Google gray fails 3:1 on light paper.
    expect(eventFocusColor("#9e9e9e")).toBe("var(--text)");
  });
});

describe("eventFocusOutlineClass", () => {
  it("suppresses the whole-card outline while an edge is focused", () => {
    expect(eventFocusOutlineClass("startDate")).toBe(
      "focus-visible:outline-none",
    );
  });

  it("uses the calendar focus color outline when no edge is focused", () => {
    expect(eventFocusOutlineClass(null)).toBe(
      "focus-visible:outline-(--event-focus-color) focus-visible:outline-2 focus-visible:outline-offset-2",
    );
  });
});

describe("eventEdgeFocusShadow", () => {
  it("paints outside the timed card for start and end edges", () => {
    expect(eventEdgeFocusShadow("startDate", "vertical", "#9e9e9e")).toBe(
      "0 -3px 0 0 #9e9e9e",
    );
    expect(eventEdgeFocusShadow("endDate", "vertical", "#9e9e9e")).toBe(
      "0 3px 0 0 #9e9e9e",
    );
  });

  it("paints outside the all-day card for start and end edges", () => {
    expect(eventEdgeFocusShadow("startDate", "horizontal", "#3b82f6")).toBe(
      "-3px 0 0 0 #3b82f6",
    );
    expect(eventEdgeFocusShadow("endDate", "horizontal", "#3b82f6")).toBe(
      "3px 0 0 0 #3b82f6",
    );
  });
});
