import { formatEventFormDateLabel } from "@web/views/Forms/EventForm/DateControlsSection/DateTimeSection/eventFormDateField.util";
import { closedFieldAction } from "@web/views/Forms/EventForm/DateControlsSection/DateTimeSection/eventFormDateFieldKeys.util";
import { describe, expect, it } from "bun:test";

const committed = new Date("2026-10-17T12:00:00.000Z");

describe("closedFieldAction", () => {
  it("opens or nudges on arrow keys", () => {
    expect(
      closedFieldAction("ArrowDown", {
        shiftKey: false,
        modKey: false,
        text: "10.17.26",
        committedDate: committed,
      }),
    ).toEqual({ kind: "openCalendar" });
    expect(
      closedFieldAction("ArrowDown", {
        shiftKey: true,
        modKey: false,
        text: "10.17.26",
        committedDate: committed,
      }),
    ).toEqual({ kind: "nudgeDays", days: 7 });
    expect(
      closedFieldAction("ArrowUp", {
        shiftKey: false,
        modKey: false,
        text: "10.17.26",
        committedDate: committed,
      }),
    ).toEqual({ kind: "nudgeDays", days: -1 });
  });

  it("opens the calendar on Enter only when the text is the committed day", () => {
    expect(
      closedFieldAction("Enter", {
        shiftKey: false,
        modKey: false,
        text: formatEventFormDateLabel(committed),
        committedDate: committed,
      }),
    ).toEqual({ kind: "openCalendar" });
    expect(
      closedFieldAction("Enter", {
        shiftKey: false,
        modKey: false,
        text: "10.18.26",
        committedDate: committed,
      }),
    ).toEqual({ kind: "ignore" });
    expect(
      closedFieldAction("Enter", {
        shiftKey: false,
        modKey: true,
        text: formatEventFormDateLabel(committed),
        committedDate: committed,
      }),
    ).toEqual({ kind: "ignore" });
  });
});
