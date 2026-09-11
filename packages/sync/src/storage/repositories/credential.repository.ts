import { type Collection, type Db } from "mongodb";
import { type ConnectionId } from "@core/types/sync/identity.contracts";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import {
  type CredentialRecord,
  CredentialRecordSchema,
  type OauthRefreshCredentialRecord,
  OauthRefreshCredentialRecordSchema,
  type OauthRefreshStoredUpsert,
  OauthRefreshStoredUpsertSchema,
  type PasswordCredentialRecord,
  PasswordCredentialRecordSchema,
  type PasswordCredentialUpsert,
  PasswordCredentialUpsertSchema,
} from "@sync/storage/contracts/credential.contracts";

const OAUTH_ONLY_FILTER = { credentialKind: { $ne: "password" as const } };

const PASSWORD_FIELDS = {
  username: "",
  secretCiphertext: "",
  secretIv: "",
  secretTag: "",
} as const;

const OAUTH_FIELDS = {
  refreshToken: "",
  refreshTokenCiphertext: "",
  refreshTokenIv: "",
  refreshTokenTag: "",
  accessToken: "",
  accessTokenExpiresAt: "",
  refreshFailureCount: "",
  scopes: "",
} as const;

const PLAINTEXT_REFRESH_TOKEN_FIELD = { refreshToken: "" } as const;

// Repository for `credentials`. One document per connection, keyed by the
// connection id. This is the ONLY place provider credentials are read or
// written; no connection query touches this collection, so a connection read
// can never surface a token. The repository never logs credential material.
export class CredentialRepository {
  private readonly collection: Collection<CredentialRecord>;

  constructor(db: Db) {
    this.collection = db.collection(SYNC_COLLECTIONS.credentials);
  }

  // Store or replace a connection's OAuth credential with encrypted refresh
  // token fields. A new refresh token clears any cached access token, so a
  // token minted from a superseded grant can never be served after
  // re-authorization. Password fields from a prior kind are unset so the
  // document cannot mix kinds.
  async store(
    input: OauthRefreshStoredUpsert,
  ): Promise<OauthRefreshCredentialRecord> {
    const fields = OauthRefreshStoredUpsertSchema.parse(input);
    const now = new Date();

    const result = await this.collection.findOneAndUpdate(
      { _id: fields.connectionId },
      {
        $set: {
          credentialKind: "oauthRefresh",
          provider: fields.provider,
          refreshTokenCiphertext: fields.refreshTokenCiphertext,
          refreshTokenIv: fields.refreshTokenIv,
          refreshTokenTag: fields.refreshTokenTag,
          keyVersion: fields.keyVersion,
          scopes: fields.scopes,
          accessToken: null,
          accessTokenExpiresAt: null,
          refreshFailureCount: 0,
          updatedAt: now,
        },
        $unset: { ...PASSWORD_FIELDS, ...PLAINTEXT_REFRESH_TOKEN_FIELD },
        // _id comes from the query filter on insert; setting it here too would
        // touch the immutable field.
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, returnDocument: "after" },
    );

    if (!result) {
      throw new Error("Credential store did not return a record");
    }
    return OauthRefreshCredentialRecordSchema.parse(result);
  }

  // Replace a legacy plaintext refresh token with encrypted fields after a
  // successful refresh. Idempotent when the row is already encrypted.
  async reencryptOauthRefresh(
    connectionId: ConnectionId,
    input: Omit<
      OauthRefreshStoredUpsert,
      "connectionId" | "provider" | "scopes"
    >,
  ): Promise<OauthRefreshCredentialRecord | null> {
    const result = await this.collection.findOneAndUpdate(
      {
        _id: connectionId,
        ...OAUTH_ONLY_FILTER,
        refreshToken: { $type: "string" },
      },
      {
        $set: {
          refreshTokenCiphertext: input.refreshTokenCiphertext,
          refreshTokenIv: input.refreshTokenIv,
          refreshTokenTag: input.refreshTokenTag,
          keyVersion: input.keyVersion,
          updatedAt: new Date(),
        },
        $unset: PLAINTEXT_REFRESH_TOKEN_FIELD,
      },
      { returnDocument: "after" },
    );
    return result ? OauthRefreshCredentialRecordSchema.parse(result) : null;
  }

  // Store or replace a password credential. OAuth fields from a prior kind
  // are unset so the document cannot mix kinds. The caller seals the secret
  // before this write; the repository never sees plaintext.
  async storePassword(
    input: PasswordCredentialUpsert,
  ): Promise<PasswordCredentialRecord> {
    const fields = PasswordCredentialUpsertSchema.parse(input);
    const now = new Date();

    const result = await this.collection.findOneAndUpdate(
      { _id: fields.connectionId },
      {
        $set: {
          credentialKind: "password",
          provider: fields.provider,
          username: fields.username,
          secretCiphertext: fields.secretCiphertext,
          secretIv: fields.secretIv,
          secretTag: fields.secretTag,
          keyVersion: fields.keyVersion,
          updatedAt: now,
        },
        $unset: OAUTH_FIELDS,
        $setOnInsert: { createdAt: now },
      },
      { upsert: true, returnDocument: "after" },
    );

    if (!result) {
      throw new Error("Password credential store did not return a record");
    }
    return PasswordCredentialRecordSchema.parse(result);
  }

  async findByConnection(
    connectionId: ConnectionId,
  ): Promise<CredentialRecord | null> {
    const record = await this.collection.findOne({ _id: connectionId });
    return record ? CredentialRecordSchema.parse(record) : null;
  }

  // Cache a freshly-minted access token and its expiry. Returns null if the
  // credential was deleted concurrently (e.g. a disconnect landed mid-refresh)
  // or is a password credential, so a caller never resurrects a revoked
  // credential or writes an access-token cache onto a password row.
  async cacheAccessToken(
    connectionId: ConnectionId,
    accessToken: string,
    expiresAt: Date,
  ): Promise<OauthRefreshCredentialRecord | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: connectionId, ...OAUTH_ONLY_FILTER },
      {
        $set: {
          accessToken,
          accessTokenExpiresAt: expiresAt,
          refreshFailureCount: 0,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" },
    );
    return result ? OauthRefreshCredentialRecordSchema.parse(result) : null;
  }

  // Clear a cached access token without touching the refresh token, so the
  // next getValidAccessToken call is forced to mint a fresh one. Used when a
  // provider rejects the cached token with a 401 mid-job. A no-op for
  // password credentials (they have no access-token cache).
  async clearCachedAccessToken(connectionId: ConnectionId): Promise<void> {
    await this.collection.updateOne(
      { _id: connectionId, ...OAUTH_ONLY_FILTER },
      {
        $set: {
          accessToken: null,
          accessTokenExpiresAt: null,
          updatedAt: new Date(),
        },
      },
    );
  }

  // Count a transient token-endpoint failure against the consecutive budget.
  // Returns the new count, or 0 if the credential was deleted concurrently or is
  // a password credential (which has no refresh budget).
  async incrementRefreshFailure(connectionId: ConnectionId): Promise<number> {
    const result = await this.collection.findOneAndUpdate(
      { _id: connectionId, ...OAUTH_ONLY_FILTER },
      {
        $inc: { refreshFailureCount: 1 },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: "after" },
    );
    if (!result) return 0;
    return OauthRefreshCredentialRecordSchema.parse(result).refreshFailureCount;
  }

  // Remove a connection's credential (disconnect / account deletion). Returns
  // whether a credential existed to delete.
  async deleteByConnection(connectionId: ConnectionId): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: connectionId });
    return result.deletedCount > 0;
  }
}
