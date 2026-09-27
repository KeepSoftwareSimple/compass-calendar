import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, describe, expect, it, mock } from "bun:test";
import "@testing-library/jest-dom";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realBrowserNavigation from "@web/common/utils/browser/browser-navigation.util";
import * as realUseVersionCheck from "@web/components/Sidebar/SidebarActions/useVersionCheck";
import * as realUseSseDegraded from "@web/sse/hooks/useSseDegraded";

let degradedSinceMs: number | null = null;
let isUpdateAvailable = false;
let isDegradedMocked = true;
let isVersionCheckMocked = true;
const actualUseSseDegradedSince = realUseSseDegraded.useSseDegradedSince;
const actualUseVersionCheck = realUseVersionCheck.useVersionCheck;
mockModuleForFile("@web/sse/hooks/useSseDegraded", realUseSseDegraded, {
  useSseDegradedSince: () =>
    isDegradedMocked ? degradedSinceMs : actualUseSseDegradedSince(),
});
mockModuleForFile(
  "@web/components/Sidebar/SidebarActions/useVersionCheck",
  realUseVersionCheck,
  {
    useVersionCheck: () =>
      isVersionCheckMocked
        ? { isUpdateAvailable, currentVersion: "test" }
        : actualUseVersionCheck(),
  },
);

const reloadLocation = mock();
mockModuleForFile(
  "@web/common/utils/browser/browser-navigation.util",
  realBrowserNavigation,
  { reloadLocation },
);

afterAll(() => {
  isDegradedMocked = false;
  isVersionCheckMocked = false;
});

// Cache-bust so this file's mocks apply even when another suite already
// loaded the component with the real hooks.
const moduleUrl = new URL(
  `./SidebarRefreshButton.tsx?test=${Math.random().toString(36).slice(2)}`,
  import.meta.url,
);
const { SidebarRefreshButton, REFRESH_AFTER_DEGRADED_MS } = (await import(
  moduleUrl.href
)) as typeof import("./SidebarRefreshButton");

describe("SidebarRefreshButton", () => {
  afterEach(() => {
    degradedSinceMs = null;
    isUpdateAvailable = false;
    reloadLocation.mockClear();
  });

  it("renders nothing while the stream is healthy and no update is waiting", () => {
    render(<SidebarRefreshButton />);

    expect(
      screen.queryByRole("button", { name: "Refresh" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Reconnecting…")).not.toBeInTheDocument();
  });

  it("stays hidden during a short outage instead of showing reconnecting copy", () => {
    degradedSinceMs = Date.now();
    render(<SidebarRefreshButton />);

    expect(
      screen.queryByRole("button", { name: "Refresh" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Reconnecting…")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("offers a reload once the outage has outlived the refresh window", async () => {
    const user = userEvent.setup();
    degradedSinceMs = Date.now() - REFRESH_AFTER_DEGRADED_MS - 1_000;
    render(<SidebarRefreshButton />);

    const refresh = screen.getByRole("button", { name: "Refresh" });
    await user.hover(refresh);
    const tooltip = await screen.findByRole("tooltip");
    expect(
      within(tooltip).getByText("Reload for the latest calendar"),
    ).toBeInTheDocument();
    expect(within(tooltip).getByText("R")).toBeInTheDocument();

    // Bare focus() opens the tooltip outside React's act; wrap it.
    act(() => refresh.focus());
    await user.keyboard("{Enter}");
    expect(reloadLocation).toHaveBeenCalledTimes(1);
  });

  it("adds the refresh control when the remaining window elapses", async () => {
    degradedSinceMs = Date.now() - REFRESH_AFTER_DEGRADED_MS + 50;
    render(<SidebarRefreshButton />);

    expect(
      screen.queryByRole("button", { name: "Refresh" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Refresh" }),
    ).toBeInTheDocument();
  });

  it("clears the control when the stream reopens", () => {
    degradedSinceMs = Date.now() - REFRESH_AFTER_DEGRADED_MS - 1_000;
    const { rerender } = render(<SidebarRefreshButton />);
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();

    degradedSinceMs = null;
    rerender(<SidebarRefreshButton />);

    expect(
      screen.queryByRole("button", { name: "Refresh" }),
    ).not.toBeInTheDocument();
  });

  it("shows one refresh control when a newer app version is available", async () => {
    const user = userEvent.setup();
    isUpdateAvailable = true;
    render(<SidebarRefreshButton />);

    expect(screen.getAllByRole("button", { name: "Refresh" })).toHaveLength(1);

    await user.hover(screen.getByRole("button", { name: "Refresh" }));
    const tooltip = await screen.findByRole("tooltip");
    expect(within(tooltip).getByText("Get latest version")).toBeInTheDocument();
    expect(within(tooltip).getByText("R")).toBeInTheDocument();
  });

  it("keeps a single refresh control when both an outage and an update apply", () => {
    isUpdateAvailable = true;
    degradedSinceMs = Date.now() - REFRESH_AFTER_DEGRADED_MS - 1_000;
    render(<SidebarRefreshButton />);

    expect(screen.getAllByRole("button", { name: "Refresh" })).toHaveLength(1);
    expect(screen.queryByText("Reconnecting…")).not.toBeInTheDocument();
  });
});
