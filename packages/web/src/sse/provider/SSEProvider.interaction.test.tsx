import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { ConnectionIdSchema } from "@core/types/sync/identity.contracts";
import { type UserMetadata } from "@core/types/user.types";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { createMockConnection } from "@web/__tests__/utils/factories/calendar.factory";
import { createFakeServerMessageBus } from "@web/__tests__/utils/sse-message-bus.test.util";
import {
  getGoogleSyncIndicatorOverride,
  resetGoogleSyncUIStateForTests,
  setSyncingSyncIndicatorOverride,
} from "@web/auth/providers/sync.indicator.state";
import {
  userMetadataActions,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import { GoogleReconnectToast } from "@web/common/utils/toast/google-reconnect.toast";
import { createUseSyncSSE } from "../hooks/useSyncSSE.factory";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockHandleConnectionRevoked = mock();
const mockInvalidateEventQueries = mock();
const mockShowErrorToast = mock();
const refreshUserMetadata = mock().mockResolvedValue(undefined);

const {
  onServerMessage,
  emit: fireMessage,
  clear,
} = createFakeServerMessageBus();

const useSyncSSE = createUseSyncSSE({
  handleConnectionRevoked: mockHandleConnectionRevoked,
  invalidateEventQueries: mockInvalidateEventQueries,
  onServerMessage,
  refreshUserMetadata,
  setUserMetadata: userMetadataActions.set,
  showErrorToast: mockShowErrorToast,
});

const HookHost = () => {
  useSyncSSE();
  return null;
};

const fireUserMetadata = (metadata: UserMetadata) => {
  fireMessage({
    type: "userMetadataChanged",
    metadata: metadata as unknown as Record<string, unknown>,
  });
};

describe("useSyncSSE", () => {
  beforeEach(() => {
    clear();
    mockHandleConnectionRevoked.mockClear();
    mockInvalidateEventQueries.mockClear();
    mockShowErrorToast.mockClear();
    refreshUserMetadata.mockClear();
    resetGoogleSyncUIStateForTests();
  });

  it("does not trigger a client-side import when USER_METADATA reports RESTART", () => {
    render(<HookHost />);

    act(() => {
      fireUserMetadata({
        google: { connectionState: "ATTENTION" },
        sync: { importGCal: "RESTART" },
      });
    });

    expect(useUserMetadataStore.getState().current).toEqual({
      google: { connectionState: "ATTENTION" },
      sync: { importGCal: "RESTART" },
    });
  });

  it("stores IMPORTING metadata without starting another import", () => {
    render(<HookHost />);

    act(() => {
      fireUserMetadata({
        google: { connectionState: "IMPORTING" },
        sync: { importGCal: "IMPORTING" },
      });
    });

    expect(useUserMetadataStore.getState().current).toEqual({
      google: { connectionState: "IMPORTING" },
      sync: { importGCal: "IMPORTING" },
    });
  });

  it("sets the syncing override when syncStatusChanged reports syncing", async () => {
    render(<HookHost />);

    act(() => {
      fireMessage({ type: "syncStatusChanged", sync: { status: "syncing" } });
    });

    await waitFor(() => {
      expect(getGoogleSyncIndicatorOverride()).toBe("syncing");
    });
  });

  it("clears a stale syncing override when replayed metadata is healthy", async () => {
    render(<HookHost />);

    act(() => {
      fireMessage({ type: "syncStatusChanged", sync: { status: "syncing" } });
      fireUserMetadata({ google: { connectionState: "HEALTHY" } });
    });

    await waitFor(() => {
      expect(getGoogleSyncIndicatorOverride()).toBe(null);
    });
  });

  it("clears a stale syncing override when replayed metadata needs attention", async () => {
    render(<HookHost />);

    act(() => {
      fireMessage({ type: "syncStatusChanged", sync: { status: "syncing" } });
      fireUserMetadata({ google: { connectionState: "ATTENTION" } });
    });

    await waitFor(() => {
      expect(getGoogleSyncIndicatorOverride()).toBe(null);
    });
  });

  it("keeps the syncing override when replayed metadata confirms active work", async () => {
    render(<HookHost />);

    act(() => {
      fireMessage({ type: "syncStatusChanged", sync: { status: "syncing" } });
      fireUserMetadata({ google: { connectionState: "IMPORTING" } });
    });

    await waitFor(() => {
      expect(getGoogleSyncIndicatorOverride()).toBe("syncing");
    });
  });

  it("refetches metadata and events after importCompleted without clearing syncing", async () => {
    setSyncingSyncIndicatorOverride();

    render(<HookHost />);

    act(() => {
      fireMessage({
        type: "importCompleted",
        operation: "repair",
        eventsCount: 4,
        calendarsCount: 1,
      });
    });

    await waitFor(() => {
      // importCompleted alone never clears the override; only metadata that
      // leaves IMPORTING (or an attention/healthy syncStatusChanged) does.
      expect(getGoogleSyncIndicatorOverride()).toBe("syncing");
      expect(refreshUserMetadata).toHaveBeenCalledWith({ force: true });
      expect(mockInvalidateEventQueries).toHaveBeenCalled();
    });
  });

  it("refetches metadata on calendarsChanged so Sync connection health can land", async () => {
    render(<HookHost />);

    act(() => {
      fireMessage({ type: "calendarsChanged", calendarIds: [] });
    });

    await waitFor(() => {
      expect(refreshUserMetadata).toHaveBeenCalledWith({ force: true });
    });
  });

  it("refetches metadata on healthy syncStatusChanged instead of clearing locally", async () => {
    render(<HookHost />);

    act(() => {
      fireMessage({ type: "syncStatusChanged", sync: { status: "syncing" } });
      fireMessage({ type: "syncStatusChanged", sync: { status: "healthy" } });
    });

    await waitFor(() => {
      expect(getGoogleSyncIndicatorOverride()).toBe("syncing");
      expect(refreshUserMetadata).toHaveBeenCalledWith({ force: true });
    });
  });

  it("clears the syncing override and shows the repair toast on WATCH_REPAIR_FAILED", async () => {
    setSyncingSyncIndicatorOverride();

    render(<HookHost />);

    act(() => {
      fireMessage({
        type: "syncStatusChanged",
        sync: {
          status: "attention",
          code: "WATCH_REPAIR_FAILED",
          retryable: true,
        },
      });
    });

    await waitFor(() => {
      expect(getGoogleSyncIndicatorOverride()).toBe(null);
      expect(mockShowErrorToast).toHaveBeenCalledWith(
        "We couldn't keep your calendar connection healthy. Try Refresh, or reconnect if this lasts.",
        expect.anything(),
      );
    });
  });

  it("clears the syncing override when Google is revoked", async () => {
    setSyncingSyncIndicatorOverride();

    render(<HookHost />);

    act(() => {
      fireMessage({
        type: "syncStatusChanged",
        sync: { status: "attention", code: "GOOGLE_REVOKED", retryable: false },
      });
    });

    await waitFor(() => {
      expect(getGoogleSyncIndicatorOverride()).toBe(null);
      expect(mockHandleConnectionRevoked).toHaveBeenCalledTimes(1);
    });
  });

  it("passes CONNECTION_REVOKED connectionId for a non-primary account", async () => {
    const google = createMockConnection("ahab@pequod.com", {
      id: "64b7f9c2e1a2b3c4d5e6f7a8",
      provider: "google",
    });
    const microsoft = createMockConnection("ada@outlook.com", {
      id: "64b7f9c2e1a2b3c4d5e6f7a9",
      provider: "microsoft",
    });
    const microsoftId = ConnectionIdSchema.parse(microsoft.id);
    userMetadataActions.set({
      google: { connectionState: "HEALTHY", connections: [google] },
      connections: [google, microsoft],
    });
    setSyncingSyncIndicatorOverride();

    render(<HookHost />);

    act(() => {
      fireMessage({
        type: "syncStatusChanged",
        sync: {
          status: "attention",
          code: "CONNECTION_REVOKED",
          connectionId: microsoftId,
          retryable: false,
        },
      });
    });

    await waitFor(() => {
      expect(getGoogleSyncIndicatorOverride()).toBe(null);
      expect(mockHandleConnectionRevoked).toHaveBeenCalledWith({
        connectionId: microsoftId,
      });
    });

    const { wrapper } = createStoreWrapper();
    render(
      <HotkeysProvider>
        <GoogleReconnectToast
          accountEmail={microsoft.accountEmail}
          connectionId={microsoft.id}
          toastId="google-revoked-api"
        />
      </HotkeysProvider>,
      { wrapper },
    );

    expect(
      screen.getByText("Microsoft Calendar disconnected (ada@outlook.com)"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reconnect Microsoft Calendar" }),
    ).toBeInTheDocument();
  });
});
