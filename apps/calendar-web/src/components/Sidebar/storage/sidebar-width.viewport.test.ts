import {
  resolveSidebarWidthForViewport,
  SIDEBAR_DEFAULT_WIDTH,
} from "@web/components/Sidebar/storage/sidebar-width.constants";
import { describe, expect, it } from "bun:test";

describe("resolveSidebarWidthForViewport", () => {
  it("keeps the stored width on wide viewports", () => {
    expect(resolveSidebarWidthForViewport(SIDEBAR_DEFAULT_WIDTH, 1280)).toBe(
      SIDEBAR_DEFAULT_WIDTH,
    );
  });

  it("shrinks the sidebar on a 360px viewport so the grid stays visible", () => {
    expect(resolveSidebarWidthForViewport(SIDEBAR_DEFAULT_WIDTH, 360)).toBe(
      232,
    );
  });

  it("caps width when the viewport is moderately narrow", () => {
    expect(resolveSidebarWidthForViewport(SIDEBAR_DEFAULT_WIDTH, 400)).toBe(
      272,
    );
  });
});
