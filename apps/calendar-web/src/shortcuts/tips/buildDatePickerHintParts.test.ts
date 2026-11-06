import { surfaceForPickerContext } from "@web/shortcuts/tips/buildDatePickerHintParts";
import { getPartsPlainText } from "@web/shortcuts/tips/shortcut-tips.data";
import { describe, expect, it } from "bun:test";

describe("surfaceForPickerContext", () => {
  it("uses the closed-field ArrowDown contract only when the picker is closed", () => {
    const closed = surfaceForPickerContext({
      id: "date-picker-event-form",
      isOpen: false,
      gridFocused: false,
      captionView: "day",
      isInputFocused: false,
      inputPhrase: "start date",
    });
    expect(closed).toBeNull();

    const closedSidebar = surfaceForPickerContext({
      id: "date-picker-sidebar-month",
      isOpen: false,
      gridFocused: false,
      captionView: "day",
      isInputFocused: false,
      inputPhrase: "month",
    });
    expect(getPartsPlainText(closedSidebar!.parts)).toContain("Enter");
  });

  it("never returns the closed open-phrase while the calendar is open and the input is not focused", () => {
    const openNoInputFocus = surfaceForPickerContext({
      id: "date-picker-event-form",
      isOpen: true,
      gridFocused: false,
      captionView: "day",
      isInputFocused: false,
      inputPhrase: "start date",
    });
    const plain = getPartsPlainText(openNoInputFocus!.parts);
    expect(plain).toContain("PageDown");
    expect(plain).not.toMatch(/open start date/i);
  });

  it("prioritizes typing hints when the input stays focused with the calendar open", () => {
    const typing = surfaceForPickerContext({
      id: "date-picker-event-form",
      isOpen: true,
      gridFocused: true,
      captionView: "day",
      isInputFocused: true,
      inputPhrase: "start date",
    });
    const plain = getPartsPlainText(typing!.parts);
    expect(plain).toMatch(/save start date/i);
    expect(plain).not.toContain("PageDown");
  });
});
