import {
  calendarGridSidebarModeHintsEligible,
  isCalendarGridSpaPathname,
  isCalendarOnlyDatePickerHintId,
  isLifeSpaPathname,
  sidebarDatePickerHintEligible,
} from "@core/shortcuts/sidebar-hint-surface";
import { describe, expect, it } from "bun:test";

describe("sidebar-hint-surface", () => {
  it("detects life and calendar grid paths", () => {
    expect(isLifeSpaPathname("/life")).toBe(true);
    expect(isLifeSpaPathname("/life/share")).toBe(true);
    expect(isCalendarGridSpaPathname("/week")).toBe(true);
    expect(isCalendarGridSpaPathname("/day/2026-05-01")).toBe(true);
    expect(isCalendarGridSpaPathname("/")).toBe(true);
    expect(isCalendarGridSpaPathname("/life")).toBe(false);
  });

  it("allows grid mode hints only on calendar grid paths", () => {
    expect(calendarGridSidebarModeHintsEligible("/week")).toBe(true);
    expect(calendarGridSidebarModeHintsEligible("/life")).toBe(false);
    expect(calendarGridSidebarModeHintsEligible("/shortcuts")).toBe(false);
  });

  it("keeps life date-picker hints on life and blocks calendar-only ids", () => {
    expect(sidebarDatePickerHintEligible("/life", ["date-picker-life"])).toBe(
      true,
    );
    expect(
      sidebarDatePickerHintEligible("/life", ["date-picker-sidebar-month"]),
    ).toBe(false);
    expect(
      sidebarDatePickerHintEligible("/week", ["date-picker-event-form"]),
    ).toBe(true);
  });

  it("marks calendar-only date picker hint ids", () => {
    expect(isCalendarOnlyDatePickerHintId("date-picker-sidebar-month")).toBe(
      true,
    );
    expect(isCalendarOnlyDatePickerHintId("date-picker-life")).toBe(false);
  });
});
