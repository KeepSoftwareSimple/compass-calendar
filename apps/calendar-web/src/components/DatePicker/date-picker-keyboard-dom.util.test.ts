import { findKeyboardSelectedDay } from "@web/components/DatePicker/date-picker-keyboard-dom.util";
import { afterEach, describe, expect, it } from "bun:test";

const selectedClass =
  "react-datepicker__day react-datepicker__day--keyboard-selected";

describe("findKeyboardSelectedDay", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("prefers the portaled popper day over an inline calendar class", () => {
    document.body.innerHTML = `
      <div class="react-datepicker-popper">
        <div class="${selectedClass}" id="popper-day">15</div>
      </div>
      <div class="calendar lifeBirthDatePicker">
        <div class="${selectedClass}" id="inline-day">16</div>
      </div>
    `;
    expect(findKeyboardSelectedDay("lifeBirthDatePicker")?.id).toBe(
      "popper-day",
    );
  });

  it("falls back to the named calendar when no popper is open", () => {
    document.body.innerHTML = `
      <div class="calendar lifeBirthDatePicker">
        <div class="${selectedClass}" id="inline-day">16</div>
      </div>
    `;
    expect(findKeyboardSelectedDay("lifeBirthDatePicker")?.id).toBe(
      "inline-day",
    );
    expect(findKeyboardSelectedDay()).toBeNull();
  });
});
