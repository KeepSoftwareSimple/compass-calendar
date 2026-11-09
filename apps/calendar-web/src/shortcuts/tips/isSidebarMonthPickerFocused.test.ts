import { isSidebarMonthPickerFocused } from "@web/shortcuts/tips/isSidebarMonthPickerFocused";
import { describe, expect, it } from "bun:test";

describe("isSidebarMonthPickerFocused", () => {
  it("is false outside the month picker", () => {
    const grid = document.createElement("div");
    grid.setAttribute("data-event-id", "evt-1");
    document.body.append(grid);
    expect(isSidebarMonthPickerFocused(grid)).toBe(false);
    grid.remove();
  });

  it("is true inside the sidebar month picker fieldset", () => {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "c-month-picker";
    const day = document.createElement("button");
    fieldset.append(day);
    document.body.append(fieldset);
    expect(isSidebarMonthPickerFocused(day)).toBe(true);
    fieldset.remove();
  });
});
