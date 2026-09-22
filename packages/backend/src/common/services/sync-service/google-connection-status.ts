import { Logger } from "@core/logger/winston.logger";
import {
  type GoogleConnectionState,
  type SyncConnectionSummary,
} from "@core/types/user.types";
import {
  toGoogleConnectionState,
  toSyncConnectionSummary,
} from "./connection-state.translation";
import {
  type SyncPrincipal,
  type SyncServiceClient,
} from "./sync-service.client";

const logger = Logger("app:google-connection-status");

export interface GoogleConnectionFromSync {
  connectionState: GoogleConnectionState;
  // Every connected account, in the order sync returned them (connection
  // order), so the browser can render one section per account. Empty on
  // none / outage. The browser derives the precedence-winning one from this
  // plus connectionState (selectPrimaryGoogleSyncConnection) rather than
  // receiving a second, redundant copy of it over the wire.
  connections: SyncConnectionSummary[];
}

/**
 * Resolve the browser-facing Google connection state from the sync service.
 *
 * On any client failure we cannot confirm the real state, so we surface
 * ATTENTION (a soft "needs a look") rather than a confidently-wrong value or a
 * failed metadata request. Wart: a sync outage flips every delegated user to
 * ATTENTION until it recovers. That is acceptable for the opt-in first cut of
 * status delegation, and a deployment that routes connections to sync is
 * expected to monitor sync availability.
 */
export async function resolveGoogleConnectionFromSync(
  client: Pick<SyncServiceClient, "listConnections">,
  principal: SyncPrincipal,
): Promise<GoogleConnectionFromSync> {
  const result = await client.listConnections(principal);
  if (result.ok) {
    // Disconnected rows (user-initiated soft-deletes, retained ~30 days) are not
    // product state. A sole disconnected account reads NOT_CONNECTED; a sibling
    // never drags a healthy account to RECONNECT_REQUIRED.
    const connections = result.value.connections.filter(
      (connection) => connection.state !== "disconnected",
    );
    return {
      connectionState: toGoogleConnectionState(connections),
      connections: connections.map(toSyncConnectionSummary),
    };
  }

  logger.warn(
    `Sync connection status unavailable (${result.error.kind}); reporting ATTENTION ` +
      `[correlationId=${result.error.correlationId}]`,
  );
  return { connectionState: "ATTENTION", connections: [] };
}
