import { type DateTime } from "@core/types/domain-primitives";
import {
  type ConnectionId,
  type ProviderAccountId,
} from "@core/types/sync/identity.contracts";
import { providerConnection } from "@backend/__tests__/factories/provider-connection.factory";
import {
  toGoogleConnectionState,
  toGoogleSyncConnectionSummary,
} from "./connection-state.translation";
import { describe, expect, it } from "bun:test";

const connection = providerConnection;

describe("toGoogleConnectionState", () => {
  it("reports NOT_CONNECTED when there are no connections", () => {
    expect(toGoogleConnectionState([])).toBe("NOT_CONNECTED");
  });

  it("maps healthy to HEALTHY", () => {
    expect(toGoogleConnectionState([connection("healthy")])).toBe("HEALTHY");
  });

  it("maps every in-progress state to IMPORTING", () => {
    for (const state of ["connecting", "importing", "catchingUp"] as const) {
      expect(toGoogleConnectionState([connection(state)])).toBe("IMPORTING");
    }
  });

  it("maps delayed to ATTENTION", () => {
    expect(
      toGoogleConnectionState([connection("delayed", "workOverdue")]),
    ).toBe("ATTENTION");
  });

  it("maps actionRequired with a re-auth reason to RECONNECT_REQUIRED", () => {
    for (const reason of [
      "authorizationRevoked",
      "authorizationExpired",
      "insufficientScopes",
    ] as const) {
      expect(
        toGoogleConnectionState([connection("actionRequired", reason)]),
      ).toBe("RECONNECT_REQUIRED");
    }
  });

  it("maps actionRequired with a non-re-auth reason to ATTENTION", () => {
    for (const reason of [
      "providerErrors",
      "workOverdue",
      "consentRequired",
    ] as const) {
      expect(
        toGoogleConnectionState([connection("actionRequired", reason)]),
      ).toBe("ATTENTION");
    }
  });

  describe("precedence across multiple connections", () => {
    it("surfaces RECONNECT_REQUIRED over a healthy sibling", () => {
      expect(
        toGoogleConnectionState([
          connection("healthy"),
          connection("actionRequired", "authorizationRevoked"),
        ]),
      ).toBe("RECONNECT_REQUIRED");
    });

    it("surfaces ATTENTION over IMPORTING and HEALTHY", () => {
      expect(
        toGoogleConnectionState([
          connection("healthy"),
          connection("importing"),
          connection("delayed", "providerErrors"),
        ]),
      ).toBe("ATTENTION");
    });

    it("surfaces IMPORTING over a healthy sibling", () => {
      expect(
        toGoogleConnectionState([
          connection("healthy"),
          connection("importing"),
        ]),
      ).toBe("IMPORTING");
    });

    it("reports HEALTHY only when every connection is healthy", () => {
      expect(
        toGoogleConnectionState([connection("healthy"), connection("healthy")]),
      ).toBe("HEALTHY");
    });

    it("ignores non-Google connections when collapsing the Google enum", () => {
      expect(
        toGoogleConnectionState([
          connection("healthy"),
          connection("actionRequired", "authorizationRevoked", {
            provider: "microsoft",
          }),
        ]),
      ).toBe("HEALTHY");
    });
  });
});

describe("toGoogleSyncConnectionSummary", () => {
  it("maps id, state, timestamps, account email, and the connection's own product state", () => {
    const record = {
      ...connection("delayed", "workOverdue"),
      id: "c-summary" as ConnectionId,
      account: {
        providerAccountId: "a1" as ProviderAccountId,
        email: "user@example.com",
        displayName: "User",
      },
      lastSyncedAt: "2026-07-24T10:00:00.000Z" as DateTime,
      lastHealthyAt: "2026-07-23T10:00:00.000Z" as DateTime,
    };
    expect(toGoogleSyncConnectionSummary(record)).toEqual({
      id: "c-summary" as ConnectionId,
      provider: "google",
      state: "delayed",
      stateReason: "workOverdue",
      lastSyncedAt: "2026-07-24T10:00:00.000Z" as DateTime,
      lastHealthyAt: "2026-07-23T10:00:00.000Z" as DateTime,
      accountEmail: "user@example.com",
      // This connection's own state, so the browser can render one account's
      // status without knowing sync's vocabulary. delayed maps to ATTENTION.
      connectionState: "ATTENTION",
      // No capabilities on the record — no contacts grant to surface.
      canSuggestContacts: false,
    });
  });

  it("surfaces suggestContacts as canSuggestContacts", () => {
    const granted = connection("healthy", null, {
      capabilities: ["readEvents", "writeEvents", "suggestContacts"],
    });
    expect(toGoogleSyncConnectionSummary(granted).canSuggestContacts).toBe(
      true,
    );

    const notGranted = connection("healthy", null, {
      capabilities: ["readEvents", "writeEvents"],
    });
    expect(toGoogleSyncConnectionSummary(notGranted).canSuggestContacts).toBe(
      false,
    );
  });

  it("preserves consentRequired stateReason on the web-facing summary", () => {
    const summary = toGoogleSyncConnectionSummary(
      connection("actionRequired", "consentRequired", {
        provider: "microsoft",
      }),
    );
    expect(summary.stateReason).toBe("consentRequired");
    expect(summary.connectionState).toBe("ATTENTION");
  });
});
