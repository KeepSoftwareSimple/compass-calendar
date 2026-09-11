import { type ConnectionListResponse } from "@core/types/sync/connection.contracts";
import {
  type ConnectionId,
  type ProviderAccountId,
} from "@core/types/sync/identity.contracts";
import { providerConnection } from "@backend/__tests__/factories/provider-connection.factory";
import { resolveGoogleConnectionFromSync } from "./google-connection-status";
import {
  type SyncClientResult,
  type SyncPrincipal,
} from "./sync-service.client";
import { describe, expect, it } from "bun:test";

const principal: SyncPrincipal = {
  tenantId: "64b7f9c2e1a2b3c4d5e6f7a8",
  principalId: "64b7f9c2e1a2b3c4d5e6f7a8",
};

// A minimal client stub whose listConnections returns a scripted result.
const clientReturning = (result: SyncClientResult<ConnectionListResponse>) => ({
  listConnections: async () => result,
});

const connection = (
  state: string,
  stateReason: string | null = null,
): ConnectionListResponse["connections"][number] =>
  providerConnection(
    state as Parameters<typeof providerConnection>[0],
    stateReason as Parameters<typeof providerConnection>[1],
    {
      tenantId: principal.tenantId,
      principalId: principal.principalId,
    } as never,
  );

describe("resolveGoogleConnectionFromSync", () => {
  it("translates a healthy connection to HEALTHY", async () => {
    const client = clientReturning({
      ok: true,
      value: { connections: [connection("healthy")] },
      correlationId: "corr-1",
    });

    const resolved = await resolveGoogleConnectionFromSync(client, principal);
    expect(resolved.connectionState).toBe("HEALTHY");
  });

  it("reports NOT_CONNECTED when the principal has no connections", async () => {
    const client = clientReturning({
      ok: true,
      value: { connections: [] },
      correlationId: "corr-1",
    });

    const resolved = await resolveGoogleConnectionFromSync(client, principal);
    expect(resolved.connectionState).toBe("NOT_CONNECTED");
  });

  it("surfaces ATTENTION on any client error kind (timeout, unauthorized, ...)", async () => {
    for (const kind of [
      "unavailable",
      "timeout",
      "unauthorized",
      "badRequest",
      "invalidResponse",
      "unexpectedStatus",
    ] as const) {
      const client = clientReturning({
        ok: false,
        error: { kind, correlationId: "corr-1" },
      });

      const resolved = await resolveGoogleConnectionFromSync(client, principal);
      expect(resolved.connectionState).toBe("ATTENTION");
    }
  });

  it("returns no connections when Sync is unavailable", async () => {
    const client = clientReturning({
      ok: false,
      error: { kind: "unavailable", correlationId: "corr-1" },
    });

    expect(await resolveGoogleConnectionFromSync(client, principal)).toEqual({
      connectionState: "ATTENTION",
      connections: [],
    });
  });

  it("summarizes every connection, in the order sync returned them", async () => {
    const client = clientReturning({
      ok: true,
      value: {
        connections: [
          {
            ...connection("healthy", null),
            id: "c-first" as ConnectionId,
            account: {
              providerAccountId: "a1" as ProviderAccountId,
              email: "first@example.com",
              displayName: null,
            },
          },
          {
            ...connection("actionRequired", "authorizationRevoked"),
            id: "c-second" as ConnectionId,
            account: {
              providerAccountId: "a2" as ProviderAccountId,
              email: "second@example.com",
              displayName: null,
            },
          },
        ],
      },
      correlationId: "corr-1",
    });

    const result = await resolveGoogleConnectionFromSync(client, principal);

    expect(
      result.connections.map((summary) => [
        summary.accountEmail,
        summary.connectionState,
      ]),
    ).toEqual([
      ["first@example.com", "HEALTHY"],
      ["second@example.com", "RECONNECT_REQUIRED"],
    ]);
  });

  it("filters disconnected connections, treating a sole disconnected account as NOT_CONNECTED", async () => {
    const client = clientReturning({
      ok: true,
      value: { connections: [connection("disconnected", null)] },
      correlationId: "corr-1",
    });

    const resolved = await resolveGoogleConnectionFromSync(client, principal);
    expect(resolved.connectionState).toBe("NOT_CONNECTED");
    expect(resolved.connections).toEqual([]);
  });

  it("filters disconnected connections, never letting one drag a healthy sibling to RECONNECT_REQUIRED", async () => {
    const client = clientReturning({
      ok: true,
      value: {
        connections: [
          {
            ...connection("disconnected", null),
            id: "c-disconnected" as ConnectionId,
            account: {
              providerAccountId: "a-old" as ProviderAccountId,
              email: "old@example.com",
              displayName: null,
            },
          },
          {
            ...connection("healthy", null),
            id: "c-healthy" as ConnectionId,
            account: {
              providerAccountId: "a-new" as ProviderAccountId,
              email: "new@example.com",
              displayName: null,
            },
          },
        ],
      },
      correlationId: "corr-1",
    });

    const result = await resolveGoogleConnectionFromSync(client, principal);
    expect(result.connectionState).toBe("HEALTHY");
    expect(result.connections.map((s) => s.accountEmail)).toEqual([
      "new@example.com",
    ]);
  });
});
