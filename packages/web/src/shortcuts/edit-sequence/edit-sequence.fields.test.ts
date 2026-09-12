import {
  EDIT_SEQUENCE_FIELD_BY_DIGIT,
  EDIT_SEQUENCE_FIELDS,
  FORM_FIELD_DIGITS,
} from "@web/shortcuts/edit-sequence/edit-sequence.fields";
import { describe, expect, it } from "bun:test";

describe("edit-sequence.fields", () => {
  it("assigns a unique digit to every jump target", () => {
    const digits = EDIT_SEQUENCE_FIELDS.map((entry) => entry.digit);
    expect([...digits].sort()).toEqual([
      "-",
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
    ]);
    expect(new Set(digits).size).toBe(digits.length);
  });

  it("orders FORM_FIELD_DIGITS by physical top-row key, fields then actions then RSVP", () => {
    // The jump engine resolves a keypress to a physical key index, so `0`
    // must land after `9` (where the key sits) even though the actions
    // toolbar it points at renders first, above the title. RSVP uses `-`,
    // the next key after `0`.
    expect(FORM_FIELD_DIGITS.map((entry) => entry.field)).toEqual([
      "title",
      "start",
      "end",
      "recurrence",
      "calendar",
      "color",
      "location",
      "attendees",
      "description",
      "actions",
      "rsvp",
    ]);
  });

  it("maps every digit back to its field for dispatch", () => {
    for (const entry of EDIT_SEQUENCE_FIELDS) {
      expect(EDIT_SEQUENCE_FIELD_BY_DIGIT[entry.digit]).toBe(entry.field);
    }
  });
});
