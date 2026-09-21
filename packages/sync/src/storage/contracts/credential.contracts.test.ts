import { faker } from "@faker-js/faker";
import { type ConnectionId } from "@core/types/sync/identity.contracts";
import {
  CredentialRecordSchema,
  PasswordCredentialRecordSchema,
} from "./credential.contracts";
import { describe, expect, it } from "bun:test";

const objectId = () => faker.database.mongodbObjectId() as ConnectionId;

describe("CredentialRecordSchema", () => {
  it("rejects legacy plaintext oauth rows without credentialKind", () => {
    const result = CredentialRecordSchema.safeParse({
      _id: objectId(),
      provider: "google" as const,
      refreshToken: "refresh-token-secret",
      accessToken: null,
      accessTokenExpiresAt: null,
      refreshFailureCount: 0,
      scopes: ["https://www.googleapis.com/auth/calendar.events"],
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(result.success).toBe(false);
  });

  it("parses an encrypted oauth refresh row", () => {
    const parsed = CredentialRecordSchema.parse({
      credentialKind: "oauthRefresh",
      _id: objectId(),
      provider: "google",
      refreshTokenCiphertext: "cipher",
      refreshTokenIv: "iv",
      refreshTokenTag: "tag",
      keyVersion: 1,
      accessToken: null,
      accessTokenExpiresAt: null,
      refreshFailureCount: 0,
      scopes: [],
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });
    expect(parsed.credentialKind).toBe("oauthRefresh");
    if (parsed.credentialKind !== "oauthRefresh") {
      throw new Error("expected oauthRefresh");
    }
    expect(parsed.refreshTokenCiphertext).toBe("cipher");
  });

  it("rejects oauth rows with a legacy plaintext refresh token field", () => {
    const result = CredentialRecordSchema.safeParse({
      credentialKind: "oauthRefresh",
      _id: objectId(),
      provider: "google",
      refreshToken: "plain",
      refreshTokenCiphertext: "cipher",
      refreshTokenIv: "iv",
      refreshTokenTag: "tag",
      keyVersion: 1,
      accessToken: null,
      accessTokenExpiresAt: null,
      refreshFailureCount: 0,
      scopes: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password row without ciphertext fields", () => {
    const result = CredentialRecordSchema.safeParse({
      credentialKind: "password",
      _id: objectId(),
      provider: "apple",
      username: "user@icloud.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result.success).toBe(false);
    expect(
      PasswordCredentialRecordSchema.safeParse({
        credentialKind: "password",
        _id: objectId(),
        provider: "apple",
        username: "user@icloud.com",
        createdAt: new Date(),
        updatedAt: new Date(),
      }).success,
    ).toBe(false);
  });

  it("parses a password row with ciphertext fields", () => {
    const parsed = CredentialRecordSchema.parse({
      credentialKind: "password",
      _id: objectId(),
      provider: "apple",
      username: "user@icloud.com",
      secretCiphertext: "cipher",
      secretIv: "iv",
      secretTag: "tag",
      keyVersion: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(parsed.credentialKind).toBe("password");
  });
});
