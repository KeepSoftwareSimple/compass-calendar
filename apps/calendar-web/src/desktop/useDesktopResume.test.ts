import { renderHook } from "@testing-library/react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realUserMetadata from "@web/auth/compass/user/util/user-metadata.util";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockRefreshUserMetadata = mock().mockResolvedValue(undefined);
const mockCloseStream = mock();
const mockOpenStream = mock();
const mockRefresh = mock();

mockModuleForFile(
  "@web/auth/compass/user/util/user-metadata.util",
  realUserMetadata,
  { refreshUserMetadata: mockRefreshUserMetadata },
);

mock.module("@web/sse/client/sse.client", () => ({
  closeStream: mockCloseStream,
  openStream: mockOpenStream,
}));

mock.module("@web/auth/providers/useConnectProvider", () => ({
  useConnectProvider: () => ({
    isAvailable: true,
    state: "HEALTHY",
    refresh: mockRefresh,
  }),
}));

const { useDesktopResume } =
  require("./useDesktopResume") as typeof import("./useDesktopResume");

describe("useDesktopResume", () => {
  let resumeHandler: (() => void) | undefined;

  beforeEach(() => {
    mockRefreshUserMetadata.mockClear();
    mockCloseStream.mockClear();
    mockOpenStream.mockClear();
    mockRefresh.mockClear();
    resumeHandler = undefined;
    window.compassDesktop = {
      version: "0.1.0",
      platform: "macos",
      openExternal: mock(),
      setAgenda: mock(),
      restartToUpdate: mock(),
      onDeepLink: mock(),
      onUpdateReady: mock(),
      onResume: (handler: () => void) => {
        resumeHandler = handler;
        return () => {
          resumeHandler = undefined;
        };
      },
      getLaunchAtLogin: mock(),
      setLaunchAtLogin: mock(),
      setAppearance: mock(),
    };
  });

  it("reconnects SSE and refreshes when the shell resumes", () => {
    renderHook(() => useDesktopResume());
    expect(resumeHandler).toBeDefined();
    resumeHandler?.();

    expect(mockCloseStream).toHaveBeenCalledTimes(1);
    expect(mockOpenStream).toHaveBeenCalledTimes(1);
    expect(mockRefreshUserMetadata).toHaveBeenCalledWith({ force: true });
    expect(mockRefresh).toHaveBeenCalledWith({ silent: true });
  });
});
