import { QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { createFakeServerMessageBus } from "@web/__tests__/utils/sse-message-bus.test.util";
import { createCompassQueryClient } from "@web/api/query-client";
import * as realSessionHook from "@web/auth/compass/session/useSession";
import * as realUserHook from "@web/auth/compass/user/hooks/useUser";
import * as realUserMetadata from "@web/auth/compass/user/util/user-metadata.util";
import * as realConnectProvider from "@web/auth/providers/useConnectProvider";
import * as realSseClient from "@web/sse/client/sse.client";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockUseSession = mock();
const mockUseUser = mock();
const openStream = mock();
const closeStream = mock();
const getStream = mock(() => null);
// SSEProvider mounts useSyncFocusRefresh, which calls useConnectProvider().
// This test isn't about Google/sync behavior, so give it a stable, complete
// fake of its own rather than inheriting whatever another file installed.
const mockUseConnectProvider = mock(() => ({
  commandAction: null,
  isAvailable: false,
  isConnecting: false,
  isRefreshing: false,
  state: "NOT_CONNECTED" as const,
  connect: mock(),
  refresh: mock(),
}));

mockModuleForFile("@web/auth/compass/session/useSession", realSessionHook, {
  useSession: mockUseSession,
});
mockModuleForFile("@web/auth/compass/user/hooks/useUser", realUserHook, {
  useUser: mockUseUser,
});
mockModuleForFile(
  "@web/auth/compass/user/util/user-metadata.util",
  realUserMetadata,
  { refreshUserMetadata: mock().mockResolvedValue(undefined) },
);
mockModuleForFile(
  "@web/auth/providers/useConnectProvider",
  realConnectProvider,
  {
    useConnectProvider: mockUseConnectProvider,
  },
);
mockModuleForFile("@web/sse/client/sse.client", realSseClient, {
  openStream,
  closeStream,
  getStream,
  onServerMessage: createFakeServerMessageBus().onServerMessage,
  onStreamReopen: () => () => undefined,
});

const { default: SSEProvider } =
  require("./SSEProvider") as typeof import("./SSEProvider");

describe("SSEProvider", () => {
  beforeEach(() => {
    closeStream.mockClear();
    getStream.mockClear();
    mockUseSession.mockClear();
    mockUseUser.mockClear();
    openStream.mockClear();
    mockUseSession.mockReturnValue({
      authenticated: true,
      setAuthenticated: mock(),
    });
    mockUseUser.mockReturnValue({ userId: "test-user-id" });
  });

  it("keeps the SSE stream open while authenticated even before the user id loads", async () => {
    mockUseUser.mockReturnValue({ userId: undefined });

    render(
      <QueryClientProvider client={createCompassQueryClient()}>
        <SSEProvider>
          <div>Test</div>
        </SSEProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(openStream).toHaveBeenCalled();
    });
    expect(closeStream).not.toHaveBeenCalled();
  });
});
