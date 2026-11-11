import {
  clickDatePickerMonthNav,
  findKeyboardSelectedDay,
  focusKeyboardSelectedDay,
} from "@web/components/DatePicker/date-picker-keyboard-dom.util";
import { afterEach, describe, expect, it } from "bun:test";

const selectedClass =
  "react-datepicker__day react-datepicker__day--keyboard-selected";

const SAMPLE_CURSOR = new Date(1993, 8, 14);
const SAMPLE_LABEL = "Choose Tuesday, September 14th, 1993";

describe("findKeyboardSelectedDay", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("prefers the portaled popper day that contains the named calendar", () => {
    document.body.innerHTML = `
      <div class="react-datepicker-popper">
        <div class="calendar otherPicker">
          <div class="${selectedClass}" id="wrong-popper-day">15</div>
        </div>
      </div>
      <div class="react-datepicker-popper">
        <div class="calendar lifeBirthDatePicker">
          <div class="${selectedClass}" id="popper-day" aria-label="${SAMPLE_LABEL}">16</div>
        </div>
      </div>
      <div class="calendar lifeBirthDatePicker">
        <div class="${selectedClass}" id="inline-day">17</div>
      </div>
    `;
    expect(
      findKeyboardSelectedDay("lifeBirthDatePicker", SAMPLE_CURSOR)?.id,
    ).toBe("popper-day");
  });

  it("falls back to the named calendar when no popper is open", () => {
    document.body.innerHTML = `
      <div class="calendar lifeBirthDatePicker">
        <div class="${selectedClass}" id="inline-day" aria-label="${SAMPLE_LABEL}">16</div>
      </div>
    `;
    expect(
      findKeyboardSelectedDay("lifeBirthDatePicker", SAMPLE_CURSOR)?.id,
    ).toBe("inline-day");
    expect(findKeyboardSelectedDay()).toBeNull();
  });

  it("when the week has multiple keyboard-selected cells, picks the one matching the cursor date", () => {
    document.body.innerHTML = `
      <div class="react-datepicker-popper">
        <div class="calendar lifeBirthDatePicker">
          <div class="${selectedClass}" id="sun" aria-label="Choose Sunday, September 12th, 1993">12</div>
          <div class="${selectedClass}" id="tue" aria-label="${SAMPLE_LABEL}">14</div>
        </div>
      </div>
    `;
    expect(
      findKeyboardSelectedDay("lifeBirthDatePicker", SAMPLE_CURSOR)?.id,
    ).toBe("tue");
  });
});

describe("focusKeyboardSelectedDay", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("scrolls overflow hosts inside the popper so the focused day is not clipped (no document scroll)", async () => {
    const popper = document.createElement("div");
    popper.className =
      "react-datepicker-popper c-date-picker-popper-grid react-datepicker-popper";
    popper.style.overflowY = "auto";
    popper.style.height = "80px";

    const calendarRoot = document.createElement("div");
    calendarRoot.className = "react-datepicker";
    calendarRoot.style.height = "200px";
    calendarRoot.style.position = "relative";

    const spacer = document.createElement("div");
    spacer.style.height = "120px";
    spacer.textContent = "header";

    const dayEl = document.createElement("div");
    dayEl.id = "kbd-day";
    dayEl.className = selectedClass;
    dayEl.tabIndex = -1;
    dayEl.textContent = "15";
    dayEl.setAttribute("aria-label", "Choose Sunday, September 15th, 2024");

    calendarRoot.appendChild(spacer);
    calendarRoot.appendChild(dayEl);
    popper.appendChild(calendarRoot);
    document.body.appendChild(popper);

    Object.defineProperty(dayEl, "offsetTop", {
      value: 120,
      configurable: true,
    });
    Object.defineProperty(dayEl, "offsetHeight", {
      value: 24,
      configurable: true,
    });
    Object.defineProperty(calendarRoot, "offsetHeight", {
      value: 200,
      configurable: true,
    });
    Object.defineProperty(popper, "offsetHeight", {
      value: 80,
      configurable: true,
    });
    Object.defineProperty(popper, "scrollHeight", {
      value: 200,
      configurable: true,
    });

    const beforeWinScroll = window.scrollY;

    focusKeyboardSelectedDay(undefined, new Date(2024, 8, 15));
    await new Promise((r) => requestAnimationFrame(r));

    expect(popper.scrollTop).toBeGreaterThan(0);

    expect(document.activeElement).toBe(dayEl);

    const r = dayEl.getBoundingClientRect();
    const hr = popper.getBoundingClientRect();
    expect(r.bottom).toBeLessThanOrEqual(hr.bottom + 1);
    expect(r.top).toBeGreaterThanOrEqual(hr.top - 1);
    expect(window.scrollY).toBe(beforeWinScroll);
  });
});

describe("clickDatePickerMonthNav", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("clicks the matching month chevron on the named calendar", () => {
    document.body.innerHTML = `
      <div class="calendar lifeBirthDatePicker">
        <button type="button" aria-label="Previous month" id="prev"></button>
        <button type="button" aria-label="Next month" id="next"></button>
      </div>
      <div class="calendar otherPicker">
        <button type="button" aria-label="Next month" id="other"></button>
      </div>
    `;
    const clicks: string[] = [];
    for (const id of ["prev", "next", "other"]) {
      document
        .getElementById(id)
        ?.addEventListener("click", () => clicks.push(id));
    }
    clickDatePickerMonthNav("lifeBirthDatePicker", 1);
    clickDatePickerMonthNav("lifeBirthDatePicker", -1);
    clickDatePickerMonthNav("lifeBirthDatePicker", 0);
    expect(clicks).toEqual(["next", "prev"]);
  });
});
