import {
  decodeCredentialAtRestKey,
  decryptCredentialAtRest,
  encryptCredentialAtRest,
} from "@core/security/credential-at-rest";
import {
  type ConnectionId,
  type ProviderKind,
} from "@core/types/sync/identity.contracts";
import {
  openOauthRefreshToken,
  sealOauthRefreshToken,
} from "@sync/credentials/oauth-refresh-at-rest";
import {
  ProviderNotConfiguredError,
  type ResolveProviderAuth,
} from "@sync/providers/provider-adapters";
import {
  type ProviderAuthAdapter,
  ProviderAuthError,
} from "@sync/providers/provider-auth.port";
import {
  type CredentialRecord,
  type CredentialUpsert,
  isPasswordCredential,
  type PasswordCredentialRecord,
} from "@sync/storage/contracts/credential.contracts";
import { type CredentialRepository } from "@sync/storage/repositories/credential.repository";

// Refresh a cached access token this many ms before its stated expiry, to
// absorb clock skew and request latency rather than serving a token that
// expires in flight.
const DEFAULT_REFRESH_SKEW_MS = 60_000;

const MISSING_AT_REST_KEY =
  "stored credentials require sync.credentialEncryptionKey";

// Owns the credential lifecycle for one provider: store the durable refresh
// token (or sealed password), serve valid access tokens (refreshing on demand),
// and revoke + delete on disconnect. It is the only component that touches raw
// credentials, and it never logs their values.
export class CredentialCustody {
  // In-process coalescing: concurrent access-token requests for the same
  // connection share a single refresh instead of each hitting the provider.
  // Cross-replica refreshes are NOT coalesced — Google tolerates concurrent
  // refresh-token use, so this only de-duplicates within a process.
  readonly #inflight = new Map<ConnectionId, Promise<string>>();
  readonly #credentialEncryptionKey: string | null;

  constructor(
    private readonly credentials: CredentialRepository,
    private readonly resolveAuth: ResolveProviderAuth,
    private readonly now: () => Date = () => new Date(),
    private readonly refreshSkewMs: number = DEFAULT_REFRESH_SKEW_MS,
    credentialEncryptionKey: string | null = null,
  ) {
    this.#credentialEncryptionKey = credentialEncryptionKey;
    if (this.#credentialEncryptionKey) {
      decodeCredentialAtRestKey(this.#credentialEncryptionKey);
    }
  }

  // Persist a freshly authorized OAuth credential (or replace an existing one).
  async store(input: CredentialUpsert): Promise<CredentialRecord> {
    const key = this.#requireAtRestKey();
    const sealed = sealOauthRefreshToken(key, input.refreshToken);
    return this.credentials.store({
      connectionId: input.connectionId,
      provider: input.provider,
      scopes: input.scopes,
      refreshTokenCiphertext: sealed.ciphertext,
      refreshTokenIv: sealed.iv,
      refreshTokenTag: sealed.tag,
      keyVersion: sealed.keyVersion,
    });
  }

  // Seal and persist an app-specific password. The plaintext secret never
  // leaves this method except as the AES-256-GCM payload written to storage.
  async storePassword(
    connectionId: ConnectionId,
    provider: ProviderKind,
    username: string,
    secret: string,
  ): Promise<PasswordCredentialRecord> {
    const key = this.#requireAtRestKey();
    const sealed = encryptCredentialAtRest(key, secret);
    return this.credentials.storePassword({
      connectionId,
      provider,
      username,
      secretCiphertext: sealed.ciphertext,
      secretIv: sealed.iv,
      secretTag: sealed.tag,
      keyVersion: sealed.keyVersion,
    });
  }

  // Return a currently-valid access token for the connection, refreshing from
  // the stored refresh token when the cached one is absent or near expiry.
  // For password credentials, decrypts the sealed secret (the "access token"
  // adapters receive is the password) and never calls refresh.
  // Rejects with a ProviderAuthError: `missingRefreshToken` if no credential
  // exists, or `authorizationRevoked` if the refresh token is no longer valid.
  getValidAccessToken(connectionId: ConnectionId): Promise<string> {
    // No `await` between the get and set, so a concurrent caller always sees
    // the in-flight promise instead of starting a second refresh.
    const inflight = this.#inflight.get(connectionId);
    if (inflight) return inflight;

    const resolved = this.#resolveAccessToken(connectionId).finally(() => {
      this.#inflight.delete(connectionId);
    });
    this.#inflight.set(connectionId, resolved);
    return resolved;
  }

  // Delete the stored credential and best-effort revoke it at the provider.
  // The delete happens regardless of whether revocation succeeds, so a broken
  // provider endpoint can never leave a credential stranded. Password
  // credentials have no revoke endpoint, so revoke is skipped.
  async disconnect(connectionId: ConnectionId): Promise<void> {
    const credential = await this.credentials.findByConnection(connectionId);
    await this.credentials.deleteByConnection(connectionId);
    if (credential && !isPasswordCredential(credential)) {
      let auth: ProviderAuthAdapter;
      try {
        auth = this.resolveAuth(credential.provider);
      } catch (error) {
        // Account deletion and mixed-provider deploys still wipe the local
        // row when this kind is not registered (for example Apple-only).
        if (error instanceof ProviderNotConfiguredError) return;
        throw error;
      }
      await auth.revoke({
        token: openOauthRefreshToken(this.#credentialEncryptionKey, credential),
      });
    }
  }

  // Delete a credential whose grant the provider has already invalidated.
  // Unlike disconnect, this does not call provider revoke. Idempotent.
  async discardRevoked(connectionId: ConnectionId): Promise<void> {
    await this.credentials.deleteByConnection(connectionId);
  }

  // Clear a cached access token the provider just rejected (401), so the next
  // getValidAccessToken call is forced to refresh instead of replaying the
  // same dead token. Without this, every retry of a job that hit a stale
  // cached token reuses it, burning the whole retry ladder for nothing.
  // Password credentials have no access-token cache; this is a no-op.
  async invalidateAccessToken(connectionId: ConnectionId): Promise<void> {
    const credential = await this.credentials.findByConnection(connectionId);
    if (credential && isPasswordCredential(credential)) return;
    await this.credentials.clearCachedAccessToken(connectionId);
  }

  async #resolveAccessToken(connectionId: ConnectionId): Promise<string> {
    const credential = await this.credentials.findByConnection(connectionId);
    if (!credential) {
      throw new ProviderAuthError(
        "missingRefreshToken",
        "No stored credential for this connection",
      );
    }

    if (isPasswordCredential(credential)) {
      return decryptCredentialAtRest(this.#requireAtRestKey(), {
        ciphertext: credential.secretCiphertext,
        iv: credential.secretIv,
        tag: credential.secretTag,
        keyVersion: credential.keyVersion,
      });
    }

    const refreshToken = openOauthRefreshToken(
      this.#credentialEncryptionKey,
      credential,
    );

    if (
      credential.accessToken &&
      credential.accessTokenExpiresAt &&
      !this.#isExpiring(credential.accessTokenExpiresAt)
    ) {
      return credential.accessToken;
    }

    // Refresh; on authorizationRevoked, delete the dead credential then rethrow.
    let refreshed: Awaited<
      ReturnType<ProviderAuthAdapter["refreshAccessToken"]>
    >;
    try {
      refreshed = await this.resolveAuth(
        credential.provider,
      ).refreshAccessToken({
        refreshToken,
      });
    } catch (error) {
      if (
        error instanceof ProviderAuthError &&
        error.reason === "authorizationRevoked"
      ) {
        await this.discardRevoked(connectionId);
      }
      if (
        error instanceof ProviderAuthError &&
        error.reason === "refreshFailed"
      ) {
        await this.credentials.incrementRefreshFailure(connectionId);
      }
      throw error;
    }
    const cached = await this.credentials.cacheAccessToken(
      connectionId,
      refreshed.accessToken,
      refreshed.expiresAt,
    );
    // A concurrent disconnect deleted the credential mid-refresh. The store
    // already refused to resurrect it; refuse to hand the caller a live token
    // for a connection that no longer has one, so the token is never used.
    if (!cached) {
      throw new ProviderAuthError(
        "missingRefreshToken",
        "Credential was removed during refresh",
      );
    }
    return refreshed.accessToken;
  }

  #isExpiring(expiresAt: Date): boolean {
    return expiresAt.getTime() - this.now().getTime() <= this.refreshSkewMs;
  }

  #requireAtRestKey(): string {
    if (!this.#credentialEncryptionKey) {
      throw new Error(MISSING_AT_REST_KEY);
    }
    return this.#credentialEncryptionKey;
  }
}
