import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "@web/components/Sidebar/storage/sidebar-width.constants";
import {
  readSidebarWidth,
  writeSidebarWidth,
} from "@web/components/Sidebar/storage/sidebar-width.storage";
import { beforeEach, describe, expect, it } from "bun:test";

describe("sidebar width storage", () => {
  beforeEach(() => localStorage.clear());

  it("returns the default for missing or invalid values", () => {
    expect(readSidebarWidth()).toBe(SIDEBAR_DEFAULT_WIDTH);

    localStorage.setItem(STORAGE_KEYS.SIDEBAR_WIDTH, "invalid");

    expect(readSidebarWidth()).toBe(SIDEBAR_DEFAULT_WIDTH);
  });

  it("clamps stored widths to the supported range", () => {
    localStorage.setItem(
      STORAGE_KEYS.SIDEBAR_WIDTH,
      String(SIDEBAR_MIN_WIDTH - 1),
    );
    expect(readSidebarWidth()).toBe(SIDEBAR_MIN_WIDTH);

    localStorage.setItem(
      STORAGE_KEYS.SIDEBAR_WIDTH,
      String(SIDEBAR_MAX_WIDTH + 1),
    );
    expect(readSidebarWidth()).toBe(SIDEBAR_MAX_WIDTH);
  });

  it("rounds fractional stored widths instead of resetting to the default", () => {
    // Drags on zoomed/HiDPI displays used to persist values like "400.5",
    // which the old integer-only guard rejected — resetting the sidebar on
    // every view switch and refresh.
    localStorage.setItem(STORAGE_KEYS.SIDEBAR_WIDTH, "400.5");

    expect(readSidebarWidth()).toBe(401);
  });

  it("writes widths through the storage abstraction", () => {
    writeSidebarWidth(360);

    expect(localStorage.getItem(STORAGE_KEYS.SIDEBAR_WIDTH)).toBe("360");
  });

  it("rounds fractional widths on write", () => {
    writeSidebarWidth(400.5);

    expect(localStorage.getItem(STORAGE_KEYS.SIDEBAR_WIDTH)).toBe("401");
  });
});
