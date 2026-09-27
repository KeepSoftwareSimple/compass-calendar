import { queryClient } from "@web/api/query-client";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

const mockRefreshEventRepositorySource = mock();
const mockUserMetadataActionsClear = mock();
const mockClearGoogleSyncIndicatorOverride = mock();
const mockSseCloseStream = mock();
const mockDraftActionsDiscard = mock();

// bun's mock.module is global and leaks into every other test file in the
// run. Spread the real module so unrelated suites still see its full surface,
// and only intercept what this file asserts on while it runs - the flag flips
// back to the real implementations in afterAll, because many later suites
// exercise these functions for real (draftActions.discard closes event forms,
// clearGoogleSyncIndicatorOverride drives useGcalSSE, and the source store's
// own tests call refreshEventRepositorySource).
const actualRepositorySource = {
  ...(await import("@web/events/repositories/event.repository.source.store")),
};
const actualUserMetadata = {
  ...(await import("@web/auth/state/user-metadata.store")),
};
const actualSseClient = { ...(await import("@web/sse/client/sse.client")) };
const actualSyncState = {
  ...(await import("@web/auth/providers/sync.indicator.state")),
};
const actualDraftStore = {
  ...(await import("@web/events/stores/draft.store")),
};
let isTeardownMocked = true;

mock.module("@web/events/repositories/event.repository.source.store", () => ({
  ...actualRepositorySource,
  refreshEventRepositorySource: (...args: unknown[]) =>
    isTeardownMocked
      ? mockRefreshEventRepositorySource(...args)
      : actualRepositorySource.refreshEventRepositorySource(
          ...(args as Parameters<
            typeof actualRepositorySource.refreshEventRepositorySource
          >),
        ),
}));

mock.module("@web/auth/state/user-metadata.store", () => ({
  ...actualUserMetadata,
  userMetadataActions: {
    ...actualUserMetadata.userMetadataActions,
    clear: (...args: unknown[]) =>
      isTeardownMocked
        ? mockUserMetadataActionsClear(...args)
        : actualUserMetadata.userMetadataActions.clear(),
  },
}));

mock.module("@web/auth/providers/sync.indicator.state", () => ({
  ...actualSyncState,
  clearGoogleSyncIndicatorOverride: (...args: unknown[]) =>
    isTeardownMocked
      ? mockClearGoogleSyncIndicatorOverride(...args)
      : actualSyncState.clearGoogleSyncIndicatorOverride(),
}));

mock.module("@web/sse/client/sse.client", () => ({
  ...actualSseClient,
  closeStream: (...args: unknown[]) =>
    isTeardownMocked
      ? mockSseCloseStream(...args)
      : actualSseClient.closeStream(),
}));

mock.module("@web/events/stores/draft.store", () => ({
  ...actualDraftStore,
  draftActions: {
    ...actualDraftStore.draftActions,
    discard: (...args: unknown[]) =>
      isTeardownMocked
        ? mockDraftActionsDiscard(...args)
        : actualDraftStore.draftActions.discard(),
  },
}));

afterAll(() => {
  isTeardownMocked = false;
});

const { clearAccountScopedClientState, clearAccountScopedQueryCache } =
  await import("./logout.teardown");

describe("logout.teardown", () => {
  beforeEach(() => {
    mockRefreshEventRepositorySource.mockClear();
    mockUserMetadataActionsClear.mockClear();
    mockClearGoogleSyncIndicatorOverride.mockClear();
    mockSseCloseStream.mockClear();
    mockDraftActionsDiscard.mockClear();
  });

  describe("clearAccountScopedClientState", () => {
    it("calls all teardown functions in order", () => {
      const callOrder: string[] = [];
      mockRefreshEventRepositorySource.mockImplementation(() => {
        callOrder.push("refreshEventRepositorySource");
      });
      mockUserMetadataActionsClear.mockImplementation(() => {
        callOrder.push("userMetadataActions.clear");
      });
      mockClearGoogleSyncIndicatorOverride.mockImplementation(() => {
        callOrder.push("clearGoogleSyncIndicatorOverride");
      });
      mockSseCloseStream.mockImplementation(() => {
        callOrder.push("closeStream");
      });
      mockDraftActionsDiscard.mockImplementation(() => {
        callOrder.push("draftActions.discard");
      });

      clearAccountScopedClientState();

      expect(callOrder).toEqual([
        "refreshEventRepositorySource",
        "userMetadataActions.clear",
        "clearGoogleSyncIndicatorOverride",
        "closeStream",
        "draftActions.discard",
      ]);
    });

    it("calls refreshEventRepositorySource with false", () => {
      clearAccountScopedClientState();
      expect(mockRefreshEventRepositorySource).toHaveBeenCalledWith(false);
    });
  });

  describe("clearAccountScopedQueryCache", () => {
    it("removes event, calendar, and availability queries", () => {
      const removeQueriesSpy = spyOn(queryClient, "removeQueries");

      clearAccountScopedQueryCache();

      expect(removeQueriesSpy).toHaveBeenCalledTimes(3);
      expect(removeQueriesSpy).toHaveBeenNthCalledWith(1, {
        queryKey: eventQueryKeys.all,
      });
      expect(removeQueriesSpy).toHaveBeenNthCalledWith(2, {
        queryKey: calendarQueryKeys.all,
      });
      expect(removeQueriesSpy).toHaveBeenNthCalledWith(3, {
        queryKey: ["availability"],
      });

      removeQueriesSpy.mockRestore();
    });
  });
});
