import {
  type CommandSubmitRequest,
  type SyncCommand,
  type SyncCommandFailureReason,
} from "@core/types/sync/command.contracts";
import { toSyncPrincipal } from "@backend/common/services/sync-service/sync-principal";
import { throwSyncCommandSubmitFailure } from "@backend/common/services/sync-service/sync-proxy-error";
import { type SyncServiceClient } from "@backend/common/services/sync-service/sync-service.client";
import { eventMutationError } from "@backend/event/event.error";

const mapSyncFailure = (reason: SyncCommandFailureReason) => {
  switch (reason) {
    case "readOnlyCalendar":
      return eventMutationError("CALENDAR_READ_ONLY", "Calendar is read-only");
    case "versionConflict":
      return eventMutationError(
        "RECURRENCE_CONFLICT",
        "Event was modified elsewhere",
      );
    case "authorizationRevoked":
      return eventMutationError(
        "CONNECTION_REVOKED",
        "Calendar access expired or was revoked. Reconnect your calendar in Compass to resume syncing.",
      );
    case "unsupportedCapability":
      // The provider declined the operation for this specific event (e.g.
      // Google rejects deleting one occurrence of a contact-linked birthday
      // event). Retrying can never succeed, so this must not share
      // PROVIDER_FAILURE's retryable 502.
      return eventMutationError(
        "UNSUPPORTED_OPERATION",
        "This calendar doesn't allow this change for this event (for example birthday or holiday events). Try deleting the entire series, or manage it in your calendar.",
      );
    case "permanentProviderError":
      return eventMutationError(
        "PROVIDER_FAILURE",
        `Sync command failed (${reason})`,
      );
  }
};

// Submit one command and require a confirmed provider outcome. Never falls
// back to the legacy store: a timeout or unavailable response may already
// have been accepted by Sync, so retrying via eventService would duplicate
// the write. Booking and event mutations share this boundary so HTTP 200
// with a failed/cancelled/nonterminal command cannot look like success.
export const submitCommandOrThrow = async (
  client: SyncServiceClient,
  userId: string,
  request: CommandSubmitRequest,
): Promise<SyncCommand> => {
  const result = await client.submitCommand(toSyncPrincipal(userId), request);
  if (!result.ok) {
    // Timeout/unavailable can mean Sync already accepted (or finished) the
    // mutation — especially provider deletes, which run inline. Do not fall
    // back to legacy; surface a retryable provider failure instead.
    throwSyncCommandSubmitFailure(result.error.kind);
  }

  const { outcome } = result.value.command;
  if (outcome.state === "failed") {
    throw mapSyncFailure(outcome.failureReason);
  }
  if (outcome.state === "cancelled") {
    throw eventMutationError("PROVIDER_FAILURE", "Sync command was cancelled");
  }
  // Backstop for invariant 1 ("every write resolves definitively"): a
  // command that is still pending/applying/reconciling has NOT actually
  // applied anywhere. Sync's stale-command retry sweep revisits
  // create/update/delete after the stale window, but this request must not
  // report success while the command is still non-terminal — the client
  // would optimistically apply the change, then a later refetch could
  // revert it with no error ever shown. Every known path that could leave a
  // command non-terminal already throws explicitly instead
  // (ProviderWriteUnavailableError, failCloud); this is the safety net for
  // any path that doesn't, today or in the future.
  if (outcome.state !== "confirmed") {
    throw eventMutationError(
      "PROVIDER_FAILURE",
      `Sync command did not resolve (${outcome.state})`,
    );
  }
  return result.value.command;
};
