import dayjs from "@core/util/date/dayjs";
import {
  getMonthPickerDayClassName,
  MONTH_PICKER_IN_VIEW_CLASS,
} from "./monthPickerDayClassName";
import { describe, expect, it } from "bun:test";

const selectedDate = dayjs("2026-05-13");

const classNameFor = (date: string, viewStart: string, viewEnd: string) =>
  getMonthPickerDayClassName({
    date: dayjs(date),
    selectedDate,
    viewEnd: dayjs(viewEnd),
    viewStart: dayjs(viewStart),
  });

describe("getMonthPickerDayClassName", () => {
  it("marks a Sun-Sat window as in view", () => {
    expect(classNameFor("2026-05-10", "2026-05-10", "2026-05-16")).toContain(
      MONTH_PICKER_IN_VIEW_CLASS,
    );
    expect(classNameFor("2026-05-16", "2026-05-10", "2026-05-16")).toContain(
      MONTH_PICKER_IN_VIEW_CLASS,
    );
    expect(classNameFor("2026-05-13", "2026-05-10", "2026-05-16")).toContain(
      "!font-semibold",
    );
    expect(
      classNameFor("2026-05-09", "2026-05-10", "2026-05-16"),
    ).not.toContain(MONTH_PICKER_IN_VIEW_CLASS);
    expect(
      classNameFor("2026-05-17", "2026-05-10", "2026-05-16"),
    ).not.toContain(MONTH_PICKER_IN_VIEW_CLASS);
  });

  it("moves the in-view band with a Shift+K window while keeping selection", () => {
    const shifted = classNameFor("2026-05-13", "2026-05-11", "2026-05-17");

    expect(
      classNameFor("2026-05-10", "2026-05-11", "2026-05-17"),
    ).not.toContain(MONTH_PICKER_IN_VIEW_CLASS);
    expect(classNameFor("2026-05-11", "2026-05-11", "2026-05-17")).toContain(
      MONTH_PICKER_IN_VIEW_CLASS,
    );
    expect(classNameFor("2026-05-17", "2026-05-11", "2026-05-17")).toContain(
      MONTH_PICKER_IN_VIEW_CLASS,
    );
    expect(shifted).toContain(MONTH_PICKER_IN_VIEW_CLASS);
    expect(shifted).toContain("!font-semibold");
  });

  it("bolds the whole cursor week when a week end is given", () => {
    const weekClass = (date: string) =>
      getMonthPickerDayClassName({
        date: dayjs(date),
        selectedDate: dayjs("2026-05-10"),
        selectedEnd: dayjs("2026-05-16"),
        viewEnd: dayjs("2026-05-16"),
        viewStart: dayjs("2026-05-10"),
      });

    expect(weekClass("2026-05-10")).toContain("!font-semibold");
    expect(weekClass("2026-05-16")).toContain("!font-semibold");
    expect(weekClass("2026-05-17")).toContain("!font-light");
  });
});
