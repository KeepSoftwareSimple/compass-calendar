import { act, cleanup, renderHook } from "@testing-library/react";
import {
  resetGoogleSyncUIStateForTests,
  setSyncingSyncIndicatorOverride,
} from "@web/auth/providers/sync.indicator.state";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import { resolveGoogleUiState, useGoogleUiState } from "./useProviderUiState";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

beforeEach(() => {
  resetGoogleSyncUIStateForTests();
  userMetadataActions.clear();
});

afterEach(() => {
  cleanup();
  resetGoogleSyncUIStateForTests();
  userMetadataActions.clear();
});

describe("useGoogleUiState", () => {
  it("reflects the loaded Google connection state", () => {
    userMetadataActions.set({
      connections: [
        {
          id: "conn-1",
          provider: "google",
          state: "healthy",
          stateReason: null,
          lastSyncedAt: null,
          lastHealthyAt: null,
          accountEmail: "user@example.com",
          connectionState: "HEALTHY",
          canSuggestContacts: false,
        },
      ],
    });

    const { result } = renderHook(() => useGoogleUiState());

    expect(result.current).toBe("HEALTHY");
  });

  it("prioritizes the transient syncing state", () => {
    userMetadataActions.set({
      connections: [
        {
          id: "conn-1",
          provider: "google",
          state: "healthy",
          stateReason: null,
          lastSyncedAt: null,
          lastHealthyAt: null,
          accountEmail: "user@example.com",
          connectionState: "HEALTHY",
          canSuggestContacts: false,
        },
      ],
    });
    const { result } = renderHook(() => useGoogleUiState());

    act(() => setSyncingSyncIndicatorOverride());
    expect(result.current).toBe("IMPORTING");
  });

  it("does not let a syncing indicator override reconnect-required", () => {
    expect(
      resolveGoogleUiState({
        connectionState: "RECONNECT_REQUIRED",
        hasAuthenticated: true,
        hasReconnectRequired: false,
        syncIndicator: "syncing",
        userMetadataStatus: "loaded",
      }),
    ).toBe("RECONNECT_REQUIRED");

    expect(
      resolveGoogleUiState({
        connectionState: "HEALTHY",
        hasAuthenticated: true,
        hasReconnectRequired: true,
        syncIndicator: "syncing",
        userMetadataStatus: "loaded",
      }),
    ).toBe("RECONNECT_REQUIRED");
  });

  it("reports checking while a returning user's metadata loads", () => {
    expect(
      resolveGoogleUiState({
        connectionState: "NOT_CONNECTED",
        hasAuthenticated: true,
        syncIndicator: null,
        userMetadataStatus: "loading",
      }),
    ).toBe("checking");
  });
});
