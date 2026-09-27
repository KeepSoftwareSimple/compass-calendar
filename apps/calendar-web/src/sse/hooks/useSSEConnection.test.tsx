import { QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { createCompassQueryClient } from "@web/api/query-client";
import * as realSessionHook from "@web/auth/compass/session/useSession";
import * as realUserHook from "@web/auth/compass/user/hooks/useUser";
import * as realUserMetadata from "@web/auth/compass/user/util/user-metadata.util";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import * as realSseClient from "@web/sse/client/sse.client";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockUseSession = mock();
const mockUseUser = mock();
const mockRefreshUserMetadata = mock().mockResolvedValue(undefined);
const openStream = mock();
const closeStream = mock();
let reopenHandler: (() => void) | null = null;
const onStreamReopen = mock((handler: () => void) => {
  reopenHandler = handler;
  return () => {
    if (reopenHandler === handler) reopenHandler = null;
  };
});

mockModuleForFile("@web/auth/compass/session/useSession", realSessionHook, {
  useSession: mockUseSession,
});
mockModuleForFile("@web/auth/compass/user/hooks/useUser", realUserHook, {
  useUser: mockUseUser,
});
mockModuleForFile(
  "@web/auth/compass/user/util/user-metadata.util",
  realUserMetadata,
  { refreshUserMetadata: mockRefreshUserMetadata },
);
mockModuleForFile("@web/sse/client/sse.client", realSseClient, {
  openStream,
  closeStream,
  onStreamReopen,
});

const { useSSEConnection } =
  require("./useSSEConnection") as typeof import("./useSSEConnection");

const Host = () => {
  useSSEConnection();
  return null;
};

describe("useSSEConnection", () => {
  beforeEach(() => {
    reopenHandler = null;
    openStream.mockClear();
    closeStream.mockClear();
    onStreamReopen.mockClear();
    mockRefreshUserMetadata.mockClear();
    mockUseSession.mockReturnValue({
      authenticated: true,
      setAuthenticated: mock(),
    });
    mockUseUser.mockReturnValue({ userId: "test-user-id" });
  });

  it("invalidates event and calendar queries when the stream reopens", async () => {
    const queryClient = createCompassQueryClient();
    const invalidateSpy = mock(queryClient.invalidateQueries.bind(queryClient));
    queryClient.invalidateQueries = invalidateSpy;

    render(
      <QueryClientProvider client={queryClient}>
        <Host />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(openStream).toHaveBeenCalled();
      expect(onStreamReopen).toHaveBeenCalled();
    });

    invalidateSpy.mockClear();
    reopenHandler?.();

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: eventQueryKeys.all,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: calendarQueryKeys.all,
    });
    expect(mockRefreshUserMetadata).toHaveBeenCalledWith({ force: true });
  });
});
