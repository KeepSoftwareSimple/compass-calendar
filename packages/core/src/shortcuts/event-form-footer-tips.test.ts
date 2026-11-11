import {
  buildEventFormFooterTipParts,
  buildTieredEventFormFooterTips,
} from "@core/shortcuts/event-form-footer-tips";
import { describe, expect, it } from "bun:test";

describe("buildTieredEventFormFooterTips", () => {
  it("returns nothing when focus is outside the form", () => {
    expect(
      buildTieredEventFormFooterTips({
        focusInsideForm: false,
        tabNavigationApplies: true,
      }),
    ).toEqual({ primary: [], secondary: [] });
  });

  it("puts tab navigation on primary and actions behind more", () => {
    const tiered = buildTieredEventFormFooterTips({
      focusInsideForm: true,
      tabNavigationApplies: true,
      datePickerHintActive: false,
    });
    expect(
      tiered.primary.some(
        (part) =>
          typeof part === "object" && "keys" in part && part.keys[0] === "Tab",
      ),
    ).toBe(true);
    expect(
      tiered.secondary.some(
        (part) => typeof part === "object" && "key" in part && part.key === "0",
      ),
    ).toBe(true);
  });

  it("omits footer tips while a date picker owns the sidebar", () => {
    expect(
      buildTieredEventFormFooterTips({
        focusInsideForm: true,
        tabNavigationApplies: false,
        datePickerHintActive: true,
      }),
    ).toEqual({ primary: [], secondary: [] });
  });

  it("shows only actions on primary when tab navigation does not apply", () => {
    const tiered = buildTieredEventFormFooterTips({
      focusInsideForm: true,
      tabNavigationApplies: false,
      datePickerHintActive: false,
    });
    expect(
      tiered.primary.some(
        (part) => typeof part === "object" && "key" in part && part.key === "0",
      ),
    ).toBe(true);
    expect(
      tiered.primary.some(
        (part) =>
          typeof part === "object" && "keys" in part && part.keys[0] === "Tab",
      ),
    ).toBe(false);
  });
});

describe("buildEventFormFooterTipParts", () => {
  it("includes secondary segments only when expanded", () => {
    const collapsed = buildEventFormFooterTipParts({
      focusInsideForm: true,
      tabNavigationApplies: true,
    });
    expect(
      collapsed.some(
        (part) => typeof part === "object" && "key" in part && part.key === "0",
      ),
    ).toBe(false);
    const expanded = buildEventFormFooterTipParts(
      {
        focusInsideForm: true,
        tabNavigationApplies: true,
      },
      true,
    );
    expect(
      expanded.some(
        (part) => typeof part === "object" && "key" in part && part.key === "0",
      ),
    ).toBe(true);
  });
});
