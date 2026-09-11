import {
  type PrincipalId,
  type ProviderAccountId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import {
  decryptAdoptAuthorizationCredential,
  decryptCredentialConnectPayload,
  decryptInternalCredential,
  encryptAdoptAuthorizationCredential,
  encryptCredentialConnectPayload,
  encryptInternalCredential,
} from "./internal-credential-envelope";
import { describe, expect, it } from "bun:test";

describe("internal credential envelope", () => {
  const context = {
    tenantId: "64b7f9c2e1a2b3c4d5e6f7a8" as TenantId,
    principalId: "64b7f9c2e1a2b3c4d5e6f7a8" as PrincipalId,
    account: {
      providerAccountId: "google-sub-1" as ProviderAccountId,
      email: "connected@example.com",
      displayName: "Connected User",
    },
    grantedScopes: ["https://www.googleapis.com/auth/calendar.events"],
  };

  it("round-trips a credential without exposing it in the envelope", () => {
    const credential = "server-exchanged-refresh-token";
    const envelope = encryptInternalCredential(
      "shared-secret",
      credential,
      context,
    );

    expect(JSON.stringify(envelope)).not.toContain(credential);
    expect(decryptInternalCredential("shared-secret", envelope, context)).toBe(
      credential,
    );
  });

  it("rejects a modified ciphertext", () => {
    const envelope = encryptInternalCredential(
      "shared-secret",
      "credential",
      context,
    );
    const modified = {
      ...envelope,
      ciphertext: `${envelope.ciphertext.slice(0, -2)}AA`,
    };

    expect(() =>
      decryptInternalCredential("shared-secret", modified, context),
    ).toThrow();
  });

  it("rejects a credential envelope replayed for another principal", () => {
    const envelope = encryptInternalCredential(
      "shared-secret",
      "credential",
      context,
    );

    expect(() =>
      decryptInternalCredential("shared-secret", envelope, {
        ...context,
        principalId: "64b7f9c2e1a2b3c4d5e6f7a9" as PrincipalId,
      }),
    ).toThrow();
    expect(() =>
      decryptInternalCredential("shared-secret", envelope, {
        ...context,
        grantedScopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      }),
    ).toThrow();
  });

  it("round-trips an adopt-authorization credential bound to the provider", () => {
    const credential = "microsoft-refresh-token";
    const adoptContext = {
      ...context,
      provider: "microsoft" as const,
    };
    const envelope = encryptAdoptAuthorizationCredential(
      "shared-secret",
      credential,
      adoptContext,
    );

    expect(JSON.stringify(envelope)).not.toContain(credential);
    expect(
      decryptAdoptAuthorizationCredential(
        "shared-secret",
        envelope,
        adoptContext,
      ),
    ).toBe(credential);
    expect(() =>
      decryptAdoptAuthorizationCredential("shared-secret", envelope, {
        ...adoptContext,
        provider: "google",
      }),
    ).toThrow();
    expect(() =>
      decryptInternalCredential("shared-secret", envelope, context),
    ).toThrow();
  });

  it("round-trips a credential connect payload without exposing the secret", () => {
    const connectContext = {
      tenantId: context.tenantId,
      principalId: context.principalId,
      provider: "apple" as const,
    };
    const payload = {
      username: "user@icloud.com",
      secret: "app-specific-password",
    };
    const envelope = encryptCredentialConnectPayload(
      "shared-secret",
      payload,
      connectContext,
    );

    expect(JSON.stringify(envelope)).not.toContain(payload.secret);
    expect(
      decryptCredentialConnectPayload(
        "shared-secret",
        envelope,
        connectContext,
      ),
    ).toEqual(payload);
  });

  it("rejects a credential connect envelope replayed for another principal", () => {
    const envelope = encryptCredentialConnectPayload(
      "shared-secret",
      { username: "user@icloud.com", secret: "app-specific-password" },
      {
        tenantId: context.tenantId,
        principalId: context.principalId,
        provider: "apple",
      },
    );

    expect(() =>
      decryptCredentialConnectPayload("shared-secret", envelope, {
        tenantId: context.tenantId,
        principalId: "64b7f9c2e1a2b3c4d5e6f7a9" as PrincipalId,
        provider: "apple",
      }),
    ).toThrow();
  });
});
