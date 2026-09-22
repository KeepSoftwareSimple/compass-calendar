/** Connection states that still have in-flight Sync work. */
export const TRANSIENT_SYNC_CONNECTION_STATES = new Set([
  "connecting",
  "importing",
  "catchingUp",
]);

export const hasTransientSyncConnection = (
  connections: ReadonlyArray<{ state: string }>,
): boolean =>
  connections.some((connection) =>
    TRANSIENT_SYNC_CONNECTION_STATES.has(connection.state),
  );
