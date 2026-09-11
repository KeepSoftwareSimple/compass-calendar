import { type BaseError } from "@core/errors/errors.base";
import { Status } from "@core/errors/status.codes";
import {
  type PrincipalId,
  type ProviderAccountId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import {
  adoptGoogleAuthorization,
  adoptProviderAuthorization,
} from "./sync-connection-adoption";
import { describe, expect, it } from "bun:test";

const principal = {
  tenantId: "64b7f9c2e1a2b3c4d5e6f7a8" as TenantId,
  principalId: "64b7f9c2e1a2b3c4d5e6f7a8" as PrincipalId,
};
const request = {
  account: {
    providerAccountId: "google-sub-1" as ProviderAccountId,
    email: "connected@example.com",
    displayName: "Connected User",
  },
  refreshToken: "server-exchanged-refresh-token",
  grantedScopes: ["https://www.googleapis.com/auth/calendar.events"],
};

describe("adoptGoogleAuthorization", () => {
  it("returns when Sync durably adopts the authorization", async () => {
    const client = {
      listConnections: async () => ({
        ok: true as const,
        value: { connections: [] },
        correlationId: "corr-1",
      }),
      adoptGoogleAuthorization: async () => ({
        ok: true as const,
        value: {},
        correlationId: "corr-1",
      }),
    };

    await expect(
      adoptGoogleAuthorization(client, principal, request),
    ).resolves.toEqual({});
  });

  it("maps Sync failures to a safe 503", async () => {
    const client = {
      listConnections: async () => ({
        ok: true as const,
        value: { connections: [] },
        correlationId: "corr-1",
      }),
      adoptGoogleAuthorization: async () => ({
        ok: false as const,
        error: { kind: "timeout" as const, correlationId: "corr-1" },
      }),
    };

    await expect(
      adoptGoogleAuthorization(client, principal, request),
    ).rejects.toMatchObject({
      statusCode: Status.SERVICE_UNAVAILABLE,
    } satisfies Partial<BaseError>);
  });

  it("does not restart an already-live connection for the same account", async () => {
    let adopted = false;
    const client = {
      listConnections: async () => ({
        ok: true as const,
        value: {
          connections: [{ account: request.account, state: "healthy" }],
        },
        correlationId: "corr-1",
      }),
      adoptGoogleAuthorization: async () => {
        adopted = true;
        return { ok: true as const, value: {}, correlationId: "corr-1" };
      },
    };

    await expect(
      adoptGoogleAuthorization(client as never, principal, request),
    ).resolves.toEqual({});
    expect(adopted).toBe(false);
  });
});

describe("adoptProviderAuthorization", () => {
  const microsoftRequest = {
    provider: "microsoft" as const,
    ...request,
    account: {
      ...request.account,
      providerAccountId: "ms-oid-1" as ProviderAccountId,
    },
  };

  it("posts the microsoft authorization when no live connection exists", async () => {
    const client = {
      listConnections: async () => ({
        ok: true as const,
        value: { connections: [] },
        correlationId: "corr-1",
      }),
      adoptProviderAuthorization: async () => ({
        ok: true as const,
        value: {},
        correlationId: "corr-1",
      }),
    };

    await expect(
      adoptProviderAuthorization(client, principal, microsoftRequest),
    ).resolves.toEqual({});
  });

  it("does not restart an already-live microsoft connection for the same account", async () => {
    let adopted = false;
    const client = {
      listConnections: async () => ({
        ok: true as const,
        value: {
          connections: [
            {
              provider: "microsoft",
              account: microsoftRequest.account,
              state: "healthy",
            },
          ],
        },
        correlationId: "corr-1",
      }),
      adoptProviderAuthorization: async () => {
        adopted = true;
        return { ok: true as const, value: {}, correlationId: "corr-1" };
      },
    };

    await expect(
      adoptProviderAuthorization(client as never, principal, microsoftRequest),
    ).resolves.toEqual({});
    expect(adopted).toBe(false);
  });
});
