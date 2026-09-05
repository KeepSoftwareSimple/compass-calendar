import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { ConnectionIdSchema } from "@core/types/sync/identity.contracts";
import { type GoogleSyncConnectionSummary } from "@core/types/user.types";
import { createStoreWrapper } from "@web/__tests__/render-with-store";
import { AuthApi } from "@web/api/auth.api";
import { userMetadataActions } from "@web/auth/state/user-metadata.store";
import { useConnectProvider } from "./useConnectProvider";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

const connection = (
  overrides: Partial<GoogleSyncConnectionSummary>,
): GoogleSyncConnectionSummary => ({
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
      google: {
        connectionState: "RECONNECT_REQUIRED",
        connections: [connection({})],
      },
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

  it("does not navigate on a connected begin response", async () => {
    const assign = spyOn(window.location, "assign").mockImplementation(
      () => {},
    );
    const beginSpy = spyOn(AuthApi, "beginConnection").mockResolvedValue({
      kind: "connected",
      connectionId: ConnectionIdSchema.parse("64b7f9c2e1a2b3c4d5e6f7a8"),
    } as Awaited<ReturnType<typeof AuthApi.beginConnection>>);

    const { wrapper } = createStoreWrapper();
    const { result } = renderHook(
      () => useConnectProvider("apple", { newAccount: true }),
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
});
