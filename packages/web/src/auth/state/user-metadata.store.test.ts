import { type SyncConnectionSummary } from "@core/types/user.types";
import {
  findPrimaryGoogleSyncConnectionFromMetadata,
  findSyncConnectionFromMetadata,
  selectPrimaryGoogleSyncConnection,
  userMetadataActions,
  useUserMetadataStore,
} from "./user-metadata.store";
import { describe, expect, it } from "bun:test";

const connection = (
  overrides: Partial<SyncConnectionSummary>,
): SyncConnectionSummary => ({
  id: "connection-1",
  state: "healthy",
  stateReason: null,
  lastSyncedAt: null,
  lastHealthyAt: null,
  accountEmail: "ahab@pequod.com",
  connectionState: "HEALTHY",
  canSuggestContacts: false,
  ...overrides,
});

describe("selectPrimaryGoogleSyncConnection", () => {
  it("returns null with no connections", () => {
    expect(
      selectPrimaryGoogleSyncConnection(useUserMetadataStore.getState()),
    ).toBeNull();
  });

  it("picks the connection whose own state matches the aggregate - the broken one, not the first", () => {
    // Mirrors the sync service's own precedence: the account most responsible
    // for the aggregate state, so an unscoped reconnect targets it.
    const healthy = connection({ id: "healthy", connectionState: "HEALTHY" });
    const broken = connection({
      id: "broken",
      accountEmail: "starbuck@pequod.com",
      connectionState: "RECONNECT_REQUIRED",
      canSuggestContacts: false,
    });
    userMetadataActions.set({
      connections: [healthy, broken],
    });

    expect(
      selectPrimaryGoogleSyncConnection(useUserMetadataStore.getState())?.id,
    ).toBe("broken");
  });

  it("falls back to the first connection when none match the aggregate", () => {
    const solo = connection({ connectionState: "HEALTHY" });
    userMetadataActions.set({
      connections: [solo],
    });

    expect(
      selectPrimaryGoogleSyncConnection(useUserMetadataStore.getState())?.id,
    ).toBe(solo.id);
  });
});

describe("userMetadataActions.removeConnection", () => {
  it("drops the given connection, leaving the others", () => {
    const kept = connection({ id: "kept" });
    const removed = connection({
      id: "removed",
      accountEmail: "starbuck@pequod.com",
    });
    userMetadataActions.set({
      connections: [kept, removed],
    });

    userMetadataActions.removeConnection("removed");

    expect(useUserMetadataStore.getState().current?.connections).toEqual([
      kept,
    ]);
  });

  it("is a no-op when metadata hasn't loaded yet", () => {
    useUserMetadataStore.setState({ current: null, status: "idle" });

    userMetadataActions.removeConnection("whatever");

    expect(useUserMetadataStore.getState().current).toBeNull();
  });
});

describe("findPrimaryGoogleSyncConnectionFromMetadata", () => {
  it("applies the same precedence to a raw payload, not just the store", () => {
    // useSyncSSE.factory.ts calls this directly on an SSE message's metadata,
    // before it reaches the store.
    const healthy = connection({ id: "healthy", connectionState: "HEALTHY" });
    const broken = connection({
      id: "broken",
      connectionState: "RECONNECT_REQUIRED",
      canSuggestContacts: false,
    });

    expect(
      findPrimaryGoogleSyncConnectionFromMetadata({
        connections: [healthy, broken],
      })?.id,
    ).toBe("broken");
  });

  it("returns null when the payload has no connections", () => {
    expect(findPrimaryGoogleSyncConnectionFromMetadata({})).toBeNull();
  });
});

describe("findSyncConnectionFromMetadata", () => {
  it("finds a non-primary connection by id on connections[]", () => {
    const google = connection({
      id: "google-primary",
      connectionState: "HEALTHY",
    });
    const microsoft = connection({
      id: "ms-secondary",
      accountEmail: "ada@outlook.com",
      connectionState: "HEALTHY",
    });

    expect(
      findSyncConnectionFromMetadata(
        {
          connections: [
            { ...google, provider: "google" },
            { ...microsoft, provider: "microsoft" },
          ],
        },
        "ms-secondary",
      )?.accountEmail,
    ).toBe("ada@outlook.com");
  });
});
