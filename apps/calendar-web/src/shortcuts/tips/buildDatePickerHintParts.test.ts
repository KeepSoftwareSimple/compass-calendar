import { surfaceForPickerContext } from "@web/shortcuts/tips/buildDatePickerHintParts";
import { getPartsPlainText } from "@web/shortcuts/tips/shortcut-tips.data";
import { describe, expect, it } from "bun:test";

describe("surfaceForPickerContext", () => {
  it("uses the closed-field ArrowDown contract only when the picker is closed", () => {
    const closed = surfaceForPickerContext({
      id: "date-picker-event-form",
      isOpen: false,
      captionView: "day",
      isInputFocused: false,
      inputPhrase: "start date",
    });
    expect(closed).toBeNull();

    expect(
      surfaceForPickerContext({
        id: "date-picker-sidebar-month",
        isOpen: false,
        captionView: "day",
        isInputFocused: false,
        inputPhrase: "month",
      }),
    ).toBeNull();
  });

  it("never returns the closed open-phrase while the calendar is open and the input is not focused", () => {
    const openNoInputFocus = surfaceForPickerContext({
      id: "date-picker-event-form",
      isOpen: true,
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
      captionView: "day",
      isInputFocused: true,
      inputPhrase: "start date",
    });
    const plain = getPartsPlainText(typing!.parts);
    expect(plain).toMatch(/save start date/i);
    expect(plain).not.toContain("PageDown");
  });

  it("uses caption parts on the given id while year or month view is open", () => {
    const year = surfaceForPickerContext({
      id: "date-picker-event-form-caption",
      isOpen: true,
      captionView: "year",
      isInputFocused: true,
      inputPhrase: "start date",
    });
    expect(getPartsPlainText(year!.parts)).toMatch(/move years/i);

    const month = surfaceForPickerContext({
      id: "date-picker-life-caption",
      isOpen: true,
      captionView: "month",
      isInputFocused: false,
      inputPhrase: "birth date",
    });
    expect(getPartsPlainText(month!.parts)).toMatch(/select/i);
  });
});
