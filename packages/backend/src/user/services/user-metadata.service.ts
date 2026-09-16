import mergeWith from "lodash/mergeWith";
import { type UserMetadata } from "@core/types/user.types";
import { getUserMetadataStore } from "@backend/auth/ports/supertokens.registry";
import {
  type GoogleConnectionFromSync,
  resolveGoogleConnectionFromSync,
} from "@backend/common/services/sync-service/google-connection-status";
import { toSyncPrincipal } from "@backend/common/services/sync-service/sync-principal";
import { getSyncServiceClient } from "@backend/common/services/sync-service/sync-service.factory";
import { type GetUserMetadataResponse } from "@backend/user/types/user.types";

const legacyEmailUpdatesKey = "subscribeToUpdates";

function hasLegacyEmailUpdatesMetadata(
  metadata: Partial<UserMetadata>,
): boolean {
  return Object.hasOwn(metadata, legacyEmailUpdatesKey);
}

function removeLegacyEmailUpdatesMetadata<T extends Partial<UserMetadata>>(
  metadata: T,
): T {
  const { [legacyEmailUpdatesKey]: _, ...cleanMetadata } =
    metadata as UserMetadata & Record<string, unknown>;

  return cleanMetadata as T;
}

/** Untrusted request-body JSON: drop prototype-polluting keys at every depth. */
function stripUnsafeKeys<T>(data: T): T {
  return JSON.parse(JSON.stringify(data), (key, value) =>
    key === "__proto__" || key === "constructor" || key === "prototype"
      ? undefined
      : value,
  ) as T;
}

class UserMetadataService {
  private getStoredUserMetadata = async (
    userId: string,
    _userContext?: Record<string, unknown>,
  ): Promise<UserMetadata> => {
    const result = (await getUserMetadataStore().getUserMetadata(
      userId,
    )) as GetUserMetadataResponse;

    if (result.status !== "OK")
      throw new Error("Failed to fetch user metadata");

    return result.metadata;
  };

  assessGoogleMetadata = async (
    userId: string,
  ): Promise<GoogleConnectionFromSync> => {
    const client = getSyncServiceClient();
    return resolveGoogleConnectionFromSync(client, toSyncPrincipal(userId));
  };

  /*
   * updateUserMetadata
   *
   * Nested objects and all lower-level properties
   * will merge with existing ones.
   *
   * @memberOf UserMetadataService
   */
  updateUserMetadata = async ({
    userId,
    data,
  }: {
    userId: string;
    data: Partial<UserMetadata>;
  }): Promise<UserMetadata> => {
    // Read-modify-write is not atomic: two concurrent updates can each read
    // the same snapshot, and the later write silently drops the other's
    // fields. Out of scope here; a compare-and-swap at the SuperTokens store
    // would close it.
    const storedMetadata = await this.getStoredUserMetadata(userId);
    const value = hasLegacyEmailUpdatesMetadata(storedMetadata)
      ? removeLegacyEmailUpdatesMetadata(storedMetadata)
      : storedMetadata;
    // `data` comes straight off the request body, so strip prototype-polluting
    // keys before it reaches the recursive merge below.
    const cleanData = stripUnsafeKeys(
      hasLegacyEmailUpdatesMetadata(data)
        ? removeLegacyEmailUpdatesMetadata(data)
        : data,
    );

    const update = mergeWith(value, cleanData) as UserMetadata;

    const result = (await getUserMetadataStore().updateUserMetadata(
      userId,
      update,
    )) as GetUserMetadataResponse;

    if (result.status !== "OK")
      throw new Error("Failed to update user metadata");

    return hasLegacyEmailUpdatesMetadata(result.metadata)
      ? removeLegacyEmailUpdatesMetadata(result.metadata)
      : result.metadata;
  };

  fetchUserMetadata = async (
    userId: string,
    userContext?: Record<string, unknown>,
  ): Promise<UserMetadata> => {
    // SuperTokens metadata and the Sync connection list are independent
    // upstreams. Await them together so GET /api/user/metadata and the SSE
    // connect handshake pay one hop, not two in series.
    const [storedMetadata, { connectionState, connections }] =
      await Promise.all([
        this.getStoredUserMetadata(userId, userContext),
        this.assessGoogleMetadata(userId),
      ]);
    const metadata = hasLegacyEmailUpdatesMetadata(storedMetadata)
      ? removeLegacyEmailUpdatesMetadata(storedMetadata)
      : storedMetadata;

    const googleConnections = connections.filter(
      (connection) => connection.provider === "google",
    );

    return {
      ...metadata,
      connections,
      google: {
        connectionState,
        connections: googleConnections,
      },
    };
  };
}

export default new UserMetadataService();
