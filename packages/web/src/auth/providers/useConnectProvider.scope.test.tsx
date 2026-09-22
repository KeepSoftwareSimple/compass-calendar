import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { AuthApi } from "@web/api/auth.api";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import { useConnectProvider } from "./useConnectProvider";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

// Reconnecting one of several accounts must rebind consent to THAT account's
// connection, and report that account's own state - not the precedence-winning
// one the top-level banner shows.

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

const renderScoped = (scoped?: SyncConnectionSummary) => {
  const { wrapper } = createStoreWrapper();
  return renderHook(
    () =>
      useConnectProvider("google", scoped ? { connection: scoped } : undefined),
    { wrapper },
  );
};

describe("useConnectProvider account scoping", () => {
  beforeEach(() => {
    userMetadataActions.set({
      connections: [
        connection({}),
        connection({
          id: "connection-healthy",
          state: "healthy",
          stateReason: null,
          accountEmail: "second@example.com",
          connectionState: "HEALTHY",
          canSuggestContacts: false,
        }),
      ],
    });
  });

  afterEach(() => {
    cleanup();
    userMetadataActions.clear();
  });

  it("reports the scoped account's own state, not the aggregate", () => {
    const healthy = connection({
      id: "connection-healthy",
      state: "healthy",
      stateReason: null,
      accountEmail: "second@example.com",
      connectionState: "HEALTHY",
      canSuggestContacts: false,
    });

    // The aggregate is RECONNECT_REQUIRED because the other account is broken.
    expect(renderScoped().result.current.state).toBe("RECONNECT_REQUIRED");
    expect(renderScoped(healthy).result.current.state).toBe("HEALTHY");
  });

  it("binds reconnect to the scoped account's connection id", async () => {
    const broken = connection({
      id: "connection-second",
      accountEmail: "second@example.com",
    });
    const beginSpy = spyOn(AuthApi, "beginGoogleConnection").mockResolvedValue({
      // A hash target: the hook navigates to whatever URL it gets back, and
      // jsdom implements only hash navigation (a real URL logs a noisy
      // "Not implemented: navigation" error). The assertion is on the request,
      // not the redirect.
      authorizationUrl: "#consent",
    });

    const { result } = renderScoped(broken);
    act(() => result.current.connect());

    await waitFor(() => {
      expect(beginSpy).toHaveBeenCalledWith({
        connectionId: "connection-second",
      });
    });

    beginSpy.mockRestore();
  });

  it("falls back to the precedence-winning connection when unscoped", async () => {
    const beginSpy = spyOn(AuthApi, "beginGoogleConnection").mockResolvedValue({
      // A hash target: the hook navigates to whatever URL it gets back, and
      // jsdom implements only hash navigation (a real URL logs a noisy
      // "Not implemented: navigation" error). The assertion is on the request,
      // not the redirect.
      authorizationUrl: "#consent",
    });

    const { result } = renderScoped();
    act(() => result.current.connect());

    await waitFor(() => {
      expect(beginSpy).toHaveBeenCalledWith({
        connectionId: "connection-primary",
      });
    });

    beginSpy.mockRestore();
  });

  it("never sends connectionId for a new-account connect, even under RECONNECT_REQUIRED", async () => {
    const beginSpy = spyOn(AuthApi, "beginGoogleConnection").mockResolvedValue({
      authorizationUrl: "#consent",
    });

    const { wrapper } = createStoreWrapper();
    const { result } = renderHook(
      () => useConnectProvider("google", { newAccount: true }),
      { wrapper },
    );
    act(() => result.current.connect());

    await waitFor(() => {
      expect(beginSpy).toHaveBeenCalledWith({});
    });

    beginSpy.mockRestore();
  });

  it("adds requested feature groups to the begin body (WP-06 contacts nudge)", async () => {
    const beginSpy = spyOn(AuthApi, "beginGoogleConnection").mockResolvedValue({
      authorizationUrl: "#consent",
    });

    const { wrapper } = createStoreWrapper();
    const { result } = renderHook(
      () => useConnectProvider("google", { features: ["contacts"] }),
      { wrapper },
    );
    act(() => result.current.connect());

    await waitFor(() => {
      // The aggregate here is RECONNECT_REQUIRED, so features ride along on a
      // reconnect body too (incremental re-consent keeps the account pinned).
      expect(beginSpy).toHaveBeenCalledWith({
        connectionId: "connection-primary",
        features: ["contacts"],
      });
    });

    beginSpy.mockRestore();
  });

  it("keeps the begin body free of features when none are requested", async () => {
    const beginSpy = spyOn(AuthApi, "beginGoogleConnection").mockResolvedValue({
      authorizationUrl: "#consent",
    });

    const { wrapper } = createStoreWrapper();
    const { result } = renderHook(
      () => useConnectProvider("google", { newAccount: true }),
      {
        wrapper,
      },
    );
    act(() => result.current.connect());

    await waitFor(() => {
      expect(beginSpy).toHaveBeenCalledTimes(1);
    });
    // Byte-identical legacy body: no features key at all.
    expect(Object.keys(beginSpy.mock.calls[0]?.[0] ?? {})).toEqual([]);

    beginSpy.mockRestore();
  });
});
