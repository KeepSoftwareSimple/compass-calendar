import { datePickerHintSurface } from "@web/shortcuts/tips/buildDatePickerHintParts";
import { getPartsPlainText } from "@web/shortcuts/tips/shortcut-tips.data";
import { describe, expect, it } from "bun:test";

describe("datePickerHintSurface", () => {
  it("never returns the closed open-phrase while the calendar is open and the input is not focused", () => {
    const openNoInputFocus = datePickerHintSurface({
      baseId: "date-picker-event-form",
      captionView: "day",
      isInputFocused: false,
      inputPhrase: "start date",
    });
    const plain = getPartsPlainText(openNoInputFocus.parts);
    expect(plain).toContain("PageDown");
    expect(plain).not.toMatch(/open start date/i);
    expect(openNoInputFocus.id).toBe("date-picker-event-form");
  });

  it("prioritizes typing hints when the input stays focused with the calendar open", () => {
    const typing = datePickerHintSurface({
      baseId: "date-picker-event-form",
      captionView: "day",
      isInputFocused: true,
      inputPhrase: "start date",
    });
    const plain = getPartsPlainText(typing.parts);
    expect(plain).toMatch(/save start date/i);
    expect(plain).not.toContain("PageDown");
    expect(typing.id).toBe("date-picker-event-form");
  });

  it("publishes caption parts on the field's caption id while year or month view is open", () => {
    const year = datePickerHintSurface({
      baseId: "date-picker-event-form",
      captionView: "year",
      isInputFocused: true,
      inputPhrase: "start date",
    });
    expect(year.id).toBe("date-picker-event-form-caption");
    expect(getPartsPlainText(year.parts)).toMatch(/move years/i);

    const month = datePickerHintSurface({
      baseId: "date-picker-life",
      captionView: "month",
      isInputFocused: false,
      inputPhrase: "birth date",
    });
    expect(month.id).toBe("date-picker-life-caption");
    expect(getPartsPlainText(month.parts)).toMatch(/select/i);
  });
});
