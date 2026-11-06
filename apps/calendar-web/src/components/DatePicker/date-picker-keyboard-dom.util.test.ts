import {
  findKeyboardSelectedDay,
  focusKeyboardSelectedDay,
} from "@web/components/DatePicker/date-picker-keyboard-dom.util";
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

describe("focusKeyboardSelectedDay", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("scrolls overflow hosts inside the popper so the focused day is not clipped (no document scroll)", async () => {
    const popper = document.createElement("div");
    popper.className = "react-datepicker-popper";
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

    focusKeyboardSelectedDay();
    await new Promise((r) => {
      requestAnimationFrame(() => requestAnimationFrame(r));
    });

    expect(popper.scrollTop).toBeGreaterThan(0);

    expect(document.activeElement).toBe(dayEl);

    const r = dayEl.getBoundingClientRect();
    const hr = popper.getBoundingClientRect();
    expect(r.bottom).toBeLessThanOrEqual(hr.bottom + 1);
    expect(r.top).toBeGreaterThanOrEqual(hr.top - 1);
    expect(window.scrollY).toBe(beforeWinScroll);
  });
});
