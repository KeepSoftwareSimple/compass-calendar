import {
  calendarAccentAccessibleSuffix,
  calendarAccentStyle,
  calendarGradient,
  eventCardFill,
  eventEdgeFocusShadow,
  eventFocusColor,
  eventFocusOutlineClass,
  joinGridEventBoxShadow,
  mergedCalendarStops,
} from "./calendar-accent.util";
import { describe, expect, it } from "bun:test";

describe("calendarAccentStyle", () => {
  it("is a flat fill for an ordinary card", () => {
    expect(
      calendarAccentStyle({ name: "Work", backgroundColor: "#3b82f6" }),
    ).toEqual({ backgroundColor: "#3b82f6" });
  });
});

describe("mergedCalendarStops", () => {
  it("is null for an ordinary card", () => {
    expect(
      mergedCalendarStops({ name: "Work", backgroundColor: "#3b82f6" }),
    ).toBeNull();
  });

  it("lists the own calendar first, then every other copy's color", () => {
    expect(
      mergedCalendarStops({
        name: "Work",
        backgroundColor: "#3b82f6",
        otherCopies: [
          { label: "ahab@gmail.com", backgroundColor: "#ef4444" },
          { label: "Miscellaneous", backgroundColor: "#22c55e" },
        ],
      }),
    ).toEqual(["#3b82f6", "#ef4444", "#22c55e"]);
  });
});

describe("calendarGradient", () => {
  it("is a diagonal gradient through every stop in order", () => {
    expect(calendarGradient(["#3b82f6", "#ef4444", "#22c55e"])).toBe(
      "linear-gradient(135deg, #3b82f6, #ef4444, #22c55e)",
    );
  });
});

describe("eventCardFill", () => {
  const identity = {
    name: "Work",
    backgroundColor: "#3b82f6",
    otherCopies: [{ label: "Home", backgroundColor: "#ef4444" }],
  };

  it("uses the event fill for an ordinary card", () => {
    const fill = eventCardFill(
      { name: "Work", backgroundColor: "#3b82f6" },
      "#111111",
      (color) => `fill(${color})`,
      (color) => `hover(${color})`,
    );

    expect(fill.mergedStops).toBeNull();
    expect(fill.fillStops).toEqual(["fill(#111111)"]);
    expect(fill.bgColor).toBe("fill(#111111)");
    expect(fill.hoverBgColor).toBe("hover(#111111)");
    expect(fill.imageVars).toBeUndefined();
  });

  it("paints calendar stops and hover images on a merged card", () => {
    const fill = eventCardFill(
      identity,
      "#111111",
      (color) => `fill(${color})`,
      (color) => `hover(${color})`,
    );

    expect(fill.mergedStops).toEqual(["#3b82f6", "#ef4444"]);
    expect(fill.fillStops).toEqual(["fill(#3b82f6)", "fill(#ef4444)"]);
    expect(fill.bgColor).toBe("fill(#3b82f6)");
    expect(fill.hoverBgColor).toBe("hover(#3b82f6)");
    expect(fill.imageVars).toEqual({
      "--event-bg-image":
        "linear-gradient(135deg, fill(#3b82f6), fill(#ef4444))",
      "--event-hover-bg-image":
        "linear-gradient(135deg, hover(#3b82f6), hover(#ef4444))",
    });
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

describe("joinGridEventBoxShadow", () => {
  it("joins present shadows and drops empty parts", () => {
    expect(
      joinGridEventBoxShadow("0 0 0 1px red", undefined, "0 3px 0 0 blue"),
    ).toBe("0 0 0 1px red, 0 3px 0 0 blue");
    expect(joinGridEventBoxShadow(false, null, undefined)).toBeUndefined();
  });
});
