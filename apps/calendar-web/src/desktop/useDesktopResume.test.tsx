import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { type ReactNode } from "react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realUserMetadata from "@web/auth/compass/user/util/user-metadata.util";
import { type UseConnectGoogleResult } from "@web/auth/providers/connect.types";
import * as realSseClient from "@web/sse/client/sse.client";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

const mockCloseStream = mock();
const mockOpenStream = mock();
const mockRefreshUserMetadata = mock().mockResolvedValue(undefined);
const mockRefresh = mock();

mockModuleForFile("@web/sse/client/sse.client", realSseClient, {
  closeStream: mockCloseStream,
  openStream: mockOpenStream,
});

mockModuleForFile(
  "@web/auth/compass/user/util/user-metadata.util",
  realUserMetadata,
  { refreshUserMetadata: mockRefreshUserMetadata },
);

const { useDesktopResume } =
  require("./useDesktopResume") as typeof import("./useDesktopResume");

const fakeConnectGoogle = (): UseConnectGoogleResult => ({
  commandAction: null,
  connection: null,
  isAvailable: true,
  isConnecting: false,
  isRefreshing: false,
  state: "HEALTHY",
  connect: mock(),
  refresh: mockRefresh,
});

describe("useDesktopResume", () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    mockCloseStream.mockClear();
    mockOpenStream.mockClear();
    mockRefreshUserMetadata.mockClear();
    mockRefresh.mockClear();
    delete window.compassDesktop;
  });

  afterEach(() => {
    delete window.compassDesktop;
  });

  it("reconnects SSE and refreshes when the shell delivers onResume", () => {
    let handler: (() => void) | undefined;
    window.compassDesktop = {
      version: "0.1.0",
      platform: "macos",
      openExternal: mock(),
      setAgenda: mock(),
      restartToUpdate: mock(),
      onDeepLink: mock(() => () => {}),
      onUpdateReady: mock(() => () => {}),
      onResume: (next) => {
        handler = next;
        return () => {
          handler = undefined;
        };
      },
    };

    renderHook(() => useDesktopResume(fakeConnectGoogle), { wrapper });
    expect(handler).toBeDefined();
    handler?.();

    expect(mockCloseStream).toHaveBeenCalledTimes(1);
    expect(mockOpenStream).toHaveBeenCalledTimes(1);
    expect(mockRefreshUserMetadata).toHaveBeenCalledWith({ force: true });
    expect(mockRefresh).toHaveBeenCalledWith({ silent: true });
  });
});
