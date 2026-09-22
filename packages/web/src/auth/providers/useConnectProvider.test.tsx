import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { ConnectionIdSchema } from "@core/types/sync/identity.contracts";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { AuthApi } from "@web/api/auth.api";
import * as Track from "@web/auth/posthog/track";
import {
  connectAppleActions,
  useConnectAppleStore,
} from "@web/auth/providers/connect-apple.store";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import { useConnectProvider } from "./useConnectProvider";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

const connection = (
  overrides: Partial<SyncConnectionSummary>,
): SyncConnectionSummary => ({
  id: "connection-primary",
  state: "actionRequired",
  stateReason: "authorizationRevoked",
  lastSyncedAt: null,
  lastHealthyAt: null,
  accountEmail: "primary@example.com",
  connectionState: "RECONNECT_REQUIRED",
  canSuggestContacts: false,
  ...overrides,
});

describe("useConnectProvider", () => {
  beforeEach(() => {
    userMetadataActions.set({
      connections: [connection({})],
    });
  });

  afterEach(() => {
    cleanup();
    userMetadataActions.clear();
  });

  it("navigates on a redirect begin response", async () => {
    const assign = spyOn(window.location, "assign").mockImplementation(
      () => {},
    );
    const beginSpy = spyOn(AuthApi, "beginConnection").mockResolvedValue({
      kind: "redirect",
      authorizationUrl: "#consent",
    });

    const { wrapper } = createStoreWrapper();
    const { result } = renderHook(
      () => useConnectProvider("google", { newAccount: true }),
      { wrapper },
    );
    act(() => result.current.connect());

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith("#consent");
    });

    beginSpy.mockRestore();
    assign.mockRestore();
  });

  it("opens the Apple credential form instead of navigating", async () => {
    const assign = spyOn(window.location, "assign").mockImplementation(
      () => {},
    );
    const beginSpy = spyOn(AuthApi, "beginConnection");

    const { wrapper } = createStoreWrapper();
    const { result } = renderHook(
      () => useConnectProvider("apple", { newAccount: true }),
      { wrapper },
    );
    act(() => result.current.connect());

    await waitFor(() => {
      expect(useConnectAppleStore.getState().isOpen).toBe(true);
    });
    expect(beginSpy).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();

    connectAppleActions.close();
    beginSpy.mockRestore();
    assign.mockRestore();
  });

  it("pre-fills Apple reconnect email when authorization expired", async () => {
    userMetadataActions.set({
      connections: [
        connection({
          id: "connection-apple",
          provider: "apple",
          stateReason: "authorizationExpired",
          accountEmail: "host@icloud.com",
        }),
      ],
    });

    const { wrapper } = createStoreWrapper();
    const { result } = renderHook(
      () =>
        useConnectProvider("apple", {
          connection: connection({
            id: "connection-apple",
            provider: "apple",
            stateReason: "authorizationExpired",
            accountEmail: "host@icloud.com",
          }),
        }),
      { wrapper },
    );
    act(() => result.current.connect());

    await waitFor(() => {
      expect(useConnectAppleStore.getState().initialEmail).toBe(
        "host@icloud.com",
      );
    });

    connectAppleActions.close();
  });

  it("does not navigate on a connected begin response", async () => {
    const assign = spyOn(window.location, "assign").mockImplementation(
      () => {},
    );
    const beginSpy = spyOn(AuthApi, "beginConnection").mockResolvedValue({
      kind: "connected",
      connectionId: ConnectionIdSchema.parse("64b7f9c2e1a2b3c4d5e6f7a8"),
    });

    const { wrapper } = createStoreWrapper();
    const { result } = renderHook(
      () => useConnectProvider("microsoft", { newAccount: true }),
      { wrapper },
    );
    act(() => result.current.connect());

    await waitFor(() => {
      expect(beginSpy).toHaveBeenCalled();
    });
    expect(assign).not.toHaveBeenCalled();

    beginSpy.mockRestore();
    assign.mockRestore();
  });

  it("binds reconnect to the scoped account's connection id", async () => {
    const beginSpy = spyOn(AuthApi, "beginGoogleConnection").mockResolvedValue({
      authorizationUrl: "#consent",
    });

    const { wrapper } = createStoreWrapper();
    const { result } = renderHook(
      () =>
        useConnectProvider("google", {
          connection: connection({ id: "connection-second" }),
        }),
      { wrapper },
    );
    act(() => result.current.connect());

    await waitFor(() => {
      expect(beginSpy).toHaveBeenCalledWith({
        connectionId: "connection-second",
      });
    });

    beginSpy.mockRestore();
  });

  it("starts reconnect authorization with intent reconnect", async () => {
    const assign = spyOn(window.location, "assign").mockImplementation(
      () => {},
    );
    const beginSpy = spyOn(AuthApi, "beginConnection").mockResolvedValue({
      kind: "redirect",
      authorizationUrl: "#consent",
    });
    const trackSpy = spyOn(Track, "track").mockImplementation(() => {});

    const { wrapper } = createStoreWrapper();
    const { result } = renderHook(
      () =>
        useConnectProvider("google", {
          connection: connection({ id: "connection-second" }),
          intent: "reconnect",
        }),
      { wrapper },
    );
    act(() => result.current.connect());

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith("#consent");
    });
    expect(trackSpy).toHaveBeenCalledWith("oauth_redirect_started", {
      provider: "google",
      intent: "reconnect",
    });

    trackSpy.mockRestore();
    beginSpy.mockRestore();
    assign.mockRestore();
  });
});
