import {
  flattenTieredHint,
  tieredDatePickerGridDayHints,
  tieredDatePickerOpenInputHints,
  tieredEventFormFooterTips,
  tieredRecurrenceUntilHints,
} from "@core/shortcuts/contextual-hint-tiers";
import { describe, expect, it } from "bun:test";

const partText = (
  parts: readonly (string | { key: string } | { keys: string[] })[],
) =>
  parts
    .map((part) => {
      if (typeof part === "string") return part;
      if ("keys" in part) return part.keys.join("+");
      return part.key;
    })
    .join("");

describe("tieredDatePickerGridDayHints", () => {
  it("shows only move date, pick, and close until expanded", () => {
    const tiered = tieredDatePickerGridDayHints();
    const collapsed = partText(flattenTieredHint(tiered, false));
    expect(collapsed).toMatch(/move date/i);
    expect(collapsed).toMatch(/pick/i);
    expect(collapsed).toMatch(/close/i);
    expect(collapsed).not.toContain("PageDown");
    expect(collapsed).not.toContain("month");
  });

  it("discloses month, year, and tab navigation when expanded", () => {
    const tiered = tieredDatePickerGridDayHints();
    const expanded = partText(flattenTieredHint(tiered, true));
    expect(expanded).toContain("PageDown");
    expect(expanded).toMatch(/month/i);
    expect(expanded).toMatch(/year/i);
    expect(expanded).toMatch(/leave and save typed text/i);
  });
});

describe("tieredEventFormFooterTips", () => {
  it("hides footer segments while a date picker owns the sidebar", () => {
    expect(
      tieredEventFormFooterTips({
        focusInsideForm: true,
        tabNavigationApplies: true,
        datePickerHintActive: true,
      }),
    ).toEqual({ primary: [], secondary: [] });
  });

  it("puts Mod+0 actions behind more when tab navigation is visible", () => {
    const tiered = tieredEventFormFooterTips({
      focusInsideForm: true,
      tabNavigationApplies: true,
      datePickerHintActive: false,
    });
    const collapsed = partText(flattenTieredHint(tiered, false));
    expect(collapsed).toMatch(/between fields/i);
    expect(collapsed).not.toMatch(/for actions/i);
    const expanded = partText(flattenTieredHint(tiered, true));
    expect(expanded).toMatch(/for actions/i);
  });
});

describe("tieredDatePickerOpenInputHints", () => {
  it("keeps typing essentials on the primary row", () => {
    const tiered = tieredDatePickerOpenInputHints("start date");
    const collapsed = partText(flattenTieredHint(tiered, false));
    expect(collapsed).toMatch(/save start date/i);
    expect(collapsed).not.toMatch(/calendar/i);
  });
});

describe("tieredRecurrenceUntilHints", () => {
  it("hides month paging until expanded", () => {
    const tiered = tieredRecurrenceUntilHints();
    expect(partText(flattenTieredHint(tiered, false))).not.toContain(
      "PageDown",
    );
    expect(partText(flattenTieredHint(tiered, true))).toContain("PageDown");
  });
});
