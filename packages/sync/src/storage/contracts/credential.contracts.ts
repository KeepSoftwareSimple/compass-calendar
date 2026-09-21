import { z } from "zod/v4";
import {
  ConnectionIdSchema,
  ProviderKindSchema,
} from "@core/types/sync/identity.contracts";

// Persistence record for `credentials`. Credentials live in their OWN
// collection, keyed 1:1 by connection id, so no normal connection projection
// can ever return credential material — reading a connection never touches this
// collection. Only the Sync database user can read it.
//
// Discriminated on credentialKind. `oauthRefresh` is the Google/Microsoft
// grant: the refresh token is the durable secret and the access token is a
// short-lived cache. `password` is the Apple app-specific password: a static
// secret sealed with AES-256-GCM, no refresh, no scopes, no revoke. Existing
// documents without credentialKind parse as oauthRefresh (no migration).
// Token-shaped fields must never reach a log or error — use `redactCredential`
// for any diagnostic output.

export const OauthRefreshCredentialRecordSchema = z.strictObject({
  credentialKind: z.literal("oauthRefresh").default("oauthRefresh"),
  // One credential document per connection; the connection id is the key.
  _id: ConnectionIdSchema,
  provider: ProviderKindSchema,
  refreshTokenCiphertext: z.string().min(1),
  refreshTokenIv: z.string().min(1),
  refreshTokenTag: z.string().min(1),
  keyVersion: z.number().int().positive(),
  // Cached access token and its absolute expiry. Null until first refresh, and
  // whenever the cached token has been invalidated.
  accessToken: z.string().min(1).nullable(),
  accessTokenExpiresAt: z.date().nullable(),
  // Consecutive token-endpoint refreshFailed counts. Reset on a successful
  // mint. After MAX_REFRESH_FAILED_ATTEMPTS the connection is treated as
  // authorizationExpired so the UI can prompt reconnect instead of looping
  // 401s. Defaulted: docs predating this field must still parse.
  refreshFailureCount: z.number().int().min(0).default(0),
  // The scopes the credential was granted, for capability checks.
  scopes: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type OauthRefreshCredentialRecord = z.infer<
  typeof OauthRefreshCredentialRecordSchema
>;

export const PasswordCredentialRecordSchema = z.strictObject({
  credentialKind: z.literal("password"),
  _id: ConnectionIdSchema,
  provider: ProviderKindSchema,
  username: z.string().min(1),
  secretCiphertext: z.string().min(1),
  secretIv: z.string().min(1),
  secretTag: z.string().min(1),
  keyVersion: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type PasswordCredentialRecord = z.infer<
  typeof PasswordCredentialRecordSchema
>;

export const OauthRefreshCredentialReadSchema =
  OauthRefreshCredentialRecordSchema.strip();
export const PasswordCredentialReadSchema =
  PasswordCredentialRecordSchema.strip();

function defaultOauthCredentialKind(value: unknown): unknown {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !("credentialKind" in value)
  ) {
    return { ...value, credentialKind: "oauthRefresh" };
  }
  return value;
}

export const CredentialRecordSchema = z.preprocess(
  defaultOauthCredentialKind,
  z.discriminatedUnion("credentialKind", [
    OauthRefreshCredentialRecordSchema,
    PasswordCredentialRecordSchema,
  ]),
);
export type CredentialRecord = z.infer<typeof CredentialRecordSchema>;

// Reads parse through this stripped variant, not the strict schema above.
// A rolling deploy runs the old build and the new build together: the new
// build stamps a field the old build has never heard of, the old build then
// reads that row, and a strictObject rejects the unknown key
// (`unrecognized_keys`) and throws. Unknown keys are dropped from the
// in-memory record and left untouched in Mongo. Writes stay strict.
export const CredentialReadSchema = z.preprocess(
  defaultOauthCredentialKind,
  z.discriminatedUnion("credentialKind", [
    OauthRefreshCredentialReadSchema,
    PasswordCredentialReadSchema,
  ]),
);

export function isOauthRefreshCredential(
  record: CredentialRecord,
): record is OauthRefreshCredentialRecord {
  return record.credentialKind === "oauthRefresh";
}

export function isPasswordCredential(
  record: CredentialRecord,
): record is PasswordCredentialRecord {
  return record.credentialKind === "password";
}

function oauthRefreshTokenIsStored(
  record: OauthRefreshCredentialRecord,
): boolean {
  return Boolean(
    record.refreshTokenCiphertext &&
      record.refreshTokenIv &&
      record.refreshTokenTag &&
      record.keyVersion,
  );
}

// What a caller provides to store or replace an OAuth credential. Sync owns
// _id, createdAt, and updatedAt; _id doubles as connectionId, so it is picked
// back in under that name rather than omitted. Storing a fresh refresh token
// clears any cached access token so a stale one can never be served after
// re-authorization.
export const CredentialUpsertSchema = z.strictObject({
  connectionId: ConnectionIdSchema,
  provider: ProviderKindSchema,
  refreshToken: z.string().min(1),
  scopes: z.array(z.string()),
});
export type CredentialUpsert = z.infer<typeof CredentialUpsertSchema>;

export const OauthRefreshStoredUpsertSchema = z.strictObject({
  connectionId: ConnectionIdSchema,
  provider: ProviderKindSchema,
  refreshTokenCiphertext: z.string().min(1),
  refreshTokenIv: z.string().min(1),
  refreshTokenTag: z.string().min(1),
  keyVersion: z.number().int().positive(),
  scopes: z.array(z.string()),
});
export type OauthRefreshStoredUpsert = z.infer<
  typeof OauthRefreshStoredUpsertSchema
>;

export const PasswordCredentialUpsertSchema = z.strictObject({
  connectionId: ConnectionIdSchema,
  provider: ProviderKindSchema,
  username: z.string().min(1),
  secretCiphertext: z.string().min(1),
  secretIv: z.string().min(1),
  secretTag: z.string().min(1),
  keyVersion: z.number().int().positive(),
});
export type PasswordCredentialUpsert = z.infer<
  typeof PasswordCredentialUpsertSchema
>;

// A log-safe view of a credential. Token-shaped fields are reduced to presence
// booleans so a diagnostic can say "has a refresh token, access token expired"
// without ever emitting the secret. This is the ONLY shape that should be
// logged for a credential.
export interface RedactedCredential {
  readonly connectionId: string;
  readonly provider: string;
  readonly credentialKind: "oauthRefresh" | "password";
  readonly hasRefreshToken: boolean;
  readonly hasAccessToken: boolean;
  readonly hasPasswordSecret: boolean;
  readonly accessTokenExpiresAt: Date | null;
  readonly scopeCount: number;
}

export function redactCredential(record: CredentialRecord): RedactedCredential {
  if (record.credentialKind === "password") {
    return {
      connectionId: record._id,
      provider: record.provider,
      credentialKind: "password",
      hasRefreshToken: false,
      hasAccessToken: false,
      hasPasswordSecret: true,
      accessTokenExpiresAt: null,
      scopeCount: 0,
    };
  }
  return {
    connectionId: record._id,
    provider: record.provider,
    credentialKind: "oauthRefresh",
    hasRefreshToken: oauthRefreshTokenIsStored(record),
    hasAccessToken: record.accessToken !== null,
    hasPasswordSecret: false,
    accessTokenExpiresAt: record.accessTokenExpiresAt,
    scopeCount: record.scopes.length,
  };
}
