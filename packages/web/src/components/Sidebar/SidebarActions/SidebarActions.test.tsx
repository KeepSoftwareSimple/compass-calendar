import { act, render, screen } from "@testing-library/react";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import {
  resetGoogleSyncUIStateForTests,
  setSyncingSyncIndicatorOverride,
} from "@web/auth/providers/sync.indicator.state";
import * as realUseversioncheck from "@web/components/Sidebar/SidebarActions/useVersionCheck";
import { viewActions } from "@web/events/stores/view.store";
import { afterAll, afterEach, describe, expect, it } from "bun:test";

// mock.module is process-wide and not reliably restorable, so the real hook
// is captured up front and a flag (flipped off in afterAll) decides which
// implementation runs on each call. This lets useVersionCheck.test.ts (which
// sits alongside this file and imports the real hook) get the real
// implementation back instead of permanently inheriting this file's stub.
const actualUseVersionCheck = (
  await import("@web/components/Sidebar/SidebarActions/useVersionCheck")
).useVersionCheck;
let isVersionCheckMocked = true;

mockModuleForFile(
  "@web/components/Sidebar/SidebarActions/useVersionCheck",
  realUseversioncheck,
  {
    useVersionCheck: () =>
      isVersionCheckMocked
        ? { isUpdateAvailable: false }
        : actualUseVersionCheck(),
  },
);

afterAll(() => {
  isVersionCheckMocked = false;
});

afterEach(() => {
  act(() => resetGoogleSyncUIStateForTests());
});

const { SidebarActions } =
  require("@web/components/Sidebar/SidebarActions/SidebarActions") as typeof import("@web/components/Sidebar/SidebarActions/SidebarActions");

describe("SidebarActions", () => {
  it("shimmers the command palette icon while Google Calendar is syncing", () => {
    const { wrapper } = createStoreWrapper();
    setSyncingSyncIndicatorOverride();

    render(<SidebarActions />, { wrapper });

    expect(
      screen.getByRole("button", {
        name: "Open command palette, syncing in the background",
      }),
    ).toBeInTheDocument();
  });

  it("does not render the background import spinner in the sidebar", () => {
    const { wrapper } = createStoreWrapper();

    render(<SidebarActions />, { wrapper });

    expect(
      screen.queryByRole("button", {
        name: "Syncing Google Calendar in the background.",
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open command palette" }),
    ).toHaveAttribute("data-pointer-shortcut", '["Mod","K"]');
    expect(
      screen.getByRole("button", { name: "Open settings" }),
    ).toHaveAttribute("data-pointer-shortcut", '["Mod",","]');
    expect(
      screen.queryByRole("button", { name: "Refresh" }),
    ).not.toBeInTheDocument();
  });

  it("labels the shortcuts button as a close action when shortcuts are open", () => {
    const { wrapper } = createStoreWrapper();
    viewActions.setSidebarOpen(true);
    act(() => viewActions.toggleShortcuts());

    render(<SidebarActions />, { wrapper });

    expect(
      screen.getByRole("button", { name: "Close shortcuts" }),
    ).toBeInTheDocument();
  });
});
