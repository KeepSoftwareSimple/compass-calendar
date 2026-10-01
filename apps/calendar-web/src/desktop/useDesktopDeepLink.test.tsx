import * as realRouter from "@tanstack/react-router";
import { renderHook, waitFor } from "@testing-library/react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockHistoryReplace = mock((_path: string) => {});
const mockReportDeepLinkNavigation = mock((_path: string) => {});

mockModuleForFile("@tanstack/react-router", realRouter, {
  useRouter: () =>
    ({
      history: { replace: mockHistoryReplace },
    }) as ReturnType<typeof realRouter.useRouter>,
});

const { useDesktopDeepLink } =
  require("./useDesktopDeepLink") as typeof import("./useDesktopDeepLink");

describe("useDesktopDeepLink", () => {
  beforeEach(() => {
    mockHistoryReplace.mockClear();
    mockReportDeepLinkNavigation.mockClear();
    delete window.compassDesktop;
    window.focus = () => {};
  });

  it("opens the day route and reports navigation for day deep links", async () => {
    let deepLinkHandler: ((url: string) => void) | undefined;
    window.compassDesktop = {
      version: "0.1.0",
      platform: "macos",
      openExternal: () => {},
      setAgenda: () => {},
      restartToUpdate: () => {},
      onDeepLink: (handler) => {
        deepLinkHandler = handler;
        return () => {};
      },
      onUpdateReady: () => () => {},
      reportDeepLinkNavigation: mockReportDeepLinkNavigation,
    };

    renderHook(() => useDesktopDeepLink());
    expect(deepLinkHandler).toBeDefined();

    deepLinkHandler!("compass://day/2026-10-15");

    await waitFor(() => {
      expect(mockHistoryReplace).toHaveBeenCalledWith("/day/2026-10-15");
    });
    expect(mockReportDeepLinkNavigation).toHaveBeenCalledWith(
      "/day/2026-10-15",
    );
  });
});
