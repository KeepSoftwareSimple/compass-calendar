import { WEEK_DAY_COUNT } from "@web/views/Week/util/week-window.util";
import {
  readBootSidebarOpen,
  readBootVisibleDayCount,
} from "./boot-geometry.util";
import { afterEach, describe, expect, it } from "bun:test";

describe("boot geometry", () => {
  afterEach(() => {
    delete document.documentElement.dataset.bootSidebar;
    delete document.documentElement.dataset.bootCols;
  });

  it("uses the boot shell's sidebar state when present", () => {
    document.documentElement.dataset.bootSidebar = "closed";
    expect(readBootSidebarOpen(true)).toBe(false);

    document.documentElement.dataset.bootSidebar = "open";
    expect(readBootSidebarOpen(false)).toBe(true);
  });

  it("falls back when the boot shell has not run", () => {
    expect(readBootSidebarOpen(true)).toBe(true);
    expect(readBootSidebarOpen(false)).toBe(false);
  });

  it("uses the boot shell's column count when it is in range", () => {
    document.documentElement.dataset.bootCols = "5";
    expect(readBootVisibleDayCount()).toBe(5);
  });

  it("falls back for missing or out-of-range column counts", () => {
    expect(readBootVisibleDayCount()).toBe(7);

    document.documentElement.dataset.bootCols = "0";
    expect(readBootVisibleDayCount(3)).toBe(3);

    document.documentElement.dataset.bootCols = "8";
    expect(readBootVisibleDayCount(3)).toBe(3);

    document.documentElement.dataset.bootCols = "2.5";
    expect(readBootVisibleDayCount(3)).toBe(3);
  });

  it("accepts WEEK_DAY_COUNT and rejects one past it", () => {
    document.documentElement.dataset.bootCols = String(WEEK_DAY_COUNT);
    expect(readBootVisibleDayCount()).toBe(WEEK_DAY_COUNT);

    document.documentElement.dataset.bootCols = String(WEEK_DAY_COUNT + 1);
    expect(readBootVisibleDayCount(3)).toBe(3);
  });
});
