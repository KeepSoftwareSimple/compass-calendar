import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import {
  readSidebarOpen,
  writeSidebarOpen,
} from "@web/common/storage/sidebar-open.storage";
import { beforeEach, describe, expect, it } from "bun:test";

describe("sidebar open storage", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to open when nothing is stored", () => {
    expect(readSidebarOpen()).toBe(true);
  });

  it("defaults to open for invalid stored values", () => {
    localStorage.setItem(STORAGE_KEYS.SIDEBAR_OPEN, "not-a-boolean");

    expect(readSidebarOpen()).toBe(true);
  });

  it("writes and reads back through the storage abstraction", () => {
    writeSidebarOpen(false);
    expect(localStorage.getItem(STORAGE_KEYS.SIDEBAR_OPEN)).toBe("false");
    expect(readSidebarOpen()).toBe(false);

    writeSidebarOpen(true);
    expect(localStorage.getItem(STORAGE_KEYS.SIDEBAR_OPEN)).toBe("true");
    expect(readSidebarOpen()).toBe(true);
  });
});
