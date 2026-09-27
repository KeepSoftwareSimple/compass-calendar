import {
  clearAllGoogleReconnectRequired,
  hasGoogleReconnectRequired,
  isAccountReconnectRequired,
  markAccountReconnectRequired,
  resetGoogleReconnectRequiredForTests,
} from "@web/auth/providers/reconnect.state";
import {
  createGoogleAuthUtil,
  LOCAL_EVENTS_SYNC_ERROR_MESSAGE,
  LOCAL_EVENTS_SYNC_SESSION_EXPIRED_MESSAGE,
} from "./connection-revoked.util.factory";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

const mockSyncLocalEventsToCloud = mock();
const mockToastError = mock();
const mockShowReconnectToast = mock();
const mockRefreshUserMetadata = mock();
const mockCloseStream = mock();
const mockOpenStream = mock();
const mockMarkAccountReconnectRequired = mock((target) =>
  markAccountReconnectRequired(target),
);
const mockResolveRevokedAccount = mock(
  (): {
    connectionId: string;
    accountEmail: string;
    provider: "google";
  } | null => ({
    connectionId: "conn-1",
    accountEmail: "lance@example.com",
    provider: "google",
  }),
);

const googleAuthUtil = createGoogleAuthUtil({
  closeStream: mockCloseStream,
  openStream: mockOpenStream,
  refreshUserMetadata: mockRefreshUserMetadata,
  resolveRevokedAccount: mockResolveRevokedAccount,
  markAccountReconnectRequired: mockMarkAccountReconnectRequired,
  showReconnectToast: mockShowReconnectToast,
  syncLocalEventsToCloud: mockSyncLocalEventsToCloud,
  toastError: mockToastError,
});

const { handleGoogleRevoked, syncLocalEvents, syncPendingLocalEvents } =
  googleAuthUtil;

describe("google-auth.util", () => {
  beforeEach(() => {
    mockSyncLocalEventsToCloud.mockClear();
    mockToastError.mockClear();
    mockShowReconnectToast.mockClear();
    mockRefreshUserMetadata.mockClear();
    mockCloseStream.mockClear();
    mockOpenStream.mockClear();
    mockMarkAccountReconnectRequired.mockClear();
    mockResolveRevokedAccount.mockClear();
    resetGoogleReconnectRequiredForTests();
  });

  afterEach(() => {
    clearAllGoogleReconnectRequired();
  });

  describe("syncLocalEvents", () => {
    it("returns syncedCount and success when sync succeeds", async () => {
      mockSyncLocalEventsToCloud.mockResolvedValue(5);

      await expect(syncLocalEvents()).resolves.toEqual({
        syncedCount: 5,
        success: true,
      });
    });

    it("returns 0 count when no events to sync", async () => {
      mockSyncLocalEventsToCloud.mockResolvedValue(0);

      await expect(syncLocalEvents()).resolves.toEqual({
        syncedCount: 0,
        success: true,
      });
    });

    it("returns error when sync fails", async () => {
      const error = new Error("Network failed");
      mockSyncLocalEventsToCloud.mockRejectedValue(error);

      await expect(syncLocalEvents()).resolves.toEqual({
        error,
        syncedCount: 0,
        success: false,
      });
    });
  });

  describe("syncPendingLocalEvents", () => {
    let consoleSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      consoleSpy = spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it("returns true when sync succeeds with events", async () => {
      mockSyncLocalEventsToCloud.mockResolvedValue(3);

      await expect(syncPendingLocalEvents()).resolves.toBe(true);
    });

    it("returns true when syncedCount is zero", async () => {
      mockSyncLocalEventsToCloud.mockResolvedValue(0);

      await expect(syncPendingLocalEvents()).resolves.toBe(true);
    });

    it("shows toast and returns false on sync failure", async () => {
      const error = new Error("Network failed");
      mockSyncLocalEventsToCloud.mockRejectedValue(error);

      await expect(syncPendingLocalEvents()).resolves.toBe(false);

      expect(mockToastError).toHaveBeenCalledWith(
        LOCAL_EVENTS_SYNC_ERROR_MESSAGE,
        expect.any(Object),
      );
      expect(consoleSpy).toHaveBeenCalledWith(error);
    });

    it("shows session recovery copy when local event sync fails because the Compass session expired", async () => {
      const error = Object.assign(new Error("Request failed with status 401"), {
        response: { status: 401 },
      });
      mockSyncLocalEventsToCloud.mockRejectedValue(error);

      await expect(syncPendingLocalEvents()).resolves.toBe(false);

      expect(mockToastError).toHaveBeenCalledWith(
        LOCAL_EVENTS_SYNC_SESSION_EXPIRED_MESSAGE,
        expect.any(Object),
      );
      expect(consoleSpy).toHaveBeenCalledWith(error);
    });
  });

  describe("handleGoogleRevoked", () => {
    it("marks the affected account, shows a named reconnect toast, and refreshes metadata", () => {
      handleGoogleRevoked({ calendarId: "cal-1" });

      expect(mockResolveRevokedAccount).toHaveBeenCalledWith({
        calendarId: "cal-1",
      });
      expect(mockMarkAccountReconnectRequired).toHaveBeenCalledWith({
        connectionId: "conn-1",
        accountEmail: "lance@example.com",
        provider: "google",
      });
      expect(mockShowReconnectToast).toHaveBeenCalledWith({
        connectionId: "conn-1",
        accountEmail: "lance@example.com",
        provider: "google",
      });
      expect(mockRefreshUserMetadata).toHaveBeenCalledTimes(1);
      expect(isAccountReconnectRequired("lance@example.com", "google")).toBe(
        true,
      );
      expect(hasGoogleReconnectRequired()).toBe(true);
    });

    it("does not prune Google events or flip the app onto local storage", () => {
      handleGoogleRevoked({ calendarId: "cal-1" });

      // Former side effects were removeEventsByGoogleCalendars /
      // refreshEventRepositorySource / removeEventQueries / markGoogleAsRevoked.
      // They are intentionally absent from the factory dependencies now.
      expect(mockShowReconnectToast).toHaveBeenCalledTimes(1);
      expect(mockRefreshUserMetadata).toHaveBeenCalledTimes(1);
    });

    it("refreshes metadata without sticky-marking when the revoked account is ambiguous", () => {
      mockResolveRevokedAccount.mockReturnValueOnce(null);

      handleGoogleRevoked();

      expect(mockMarkAccountReconnectRequired).not.toHaveBeenCalled();
      expect(mockShowReconnectToast).not.toHaveBeenCalled();
      expect(mockRefreshUserMetadata).toHaveBeenCalledTimes(1);
      expect(mockCloseStream).toHaveBeenCalledTimes(1);
      expect(mockOpenStream).toHaveBeenCalledTimes(1);
    });

    it("reconnects SSE stream so the client gets a fresh session after revocation", () => {
      handleGoogleRevoked({ calendarId: "cal-1" });

      expect(mockCloseStream).toHaveBeenCalledTimes(1);
      expect(mockOpenStream).toHaveBeenCalledTimes(1);
    });
  });
});
