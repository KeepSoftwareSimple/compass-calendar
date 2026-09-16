import { type SyncCommandFailureReason } from "@core/types/sync/command.contracts";
import {
  type ConnectionId,
  type ProviderEventId,
} from "@core/types/sync/identity.contracts";
import { type ProviderMutationDeps } from "@sync/domain/provider-command.deps";
import { runProviderWrite } from "@sync/domain/provider-write-ladder";
import { type CommandRecord } from "@sync/storage/contracts/command.contracts";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";

export async function failCommand(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  reason: SyncCommandFailureReason,
  connectionId: ConnectionId,
): Promise<CommandRecord> {
  const failed = await deps.commands.updateOutcome(
    command.tenantId,
    command.principalId,
    command._id,
    { state: "failed", failureReason: reason },
    command.attemptCount,
  );
  if (reason === "authorizationRevoked") {
    await deps.custody.discardRevoked(connectionId);
  }
  return failed ?? command;
}

// Gate for a guest-list replace: only the organizer's copy of an event
// supports rewriting the attendee array, and v1 rejects non-organizer guest
// editing outright (`guestsCanModify` is a documented follow-up). The STORED
// organizer is compared case-insensitively against the connection's account
// email so a non-organizer replace fails typed (unsupportedCapability) BEFORE
// any provider call, fetch included. A null stored organizer passes — it
// means no organizer has ever been read back (e.g. a Compass-created event
// with no guests yet), so the connection's own account organizes it.
// Unverifiable states (missing connection row, or a connection without an
// account email while an organizer exists) fail closed with the same typed
// reason rather than guessing. Returns the failed command, or null when the
// replace may proceed.
export async function organizerGuardFailure(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  event: EventRecord,
  connectionId: ConnectionId,
): Promise<CommandRecord | null> {
  const organizerEmail = event.content.organizer?.email;
  if (organizerEmail === undefined) return null;
  const connection = await deps.connections.findById(
    command.tenantId,
    command.principalId,
    connectionId,
  );
  const accountEmail = connection?.account.email;
  if (
    accountEmail != null &&
    accountEmail.toLowerCase() === organizerEmail.toLowerCase()
  ) {
    return null;
  }
  return failCommand(deps, command, "unsupportedCapability", connectionId);
}

// After a failed override-align patch, continue when the instance is already
// gone (matching deleteEvent's 404-OK). Return a command to stop on; null means
// local cleanup may proceed. The master write may already have landed, so a
// hard fail on a missing override would leave Google mutated and Compass not.
export async function resolveFailedOverrideAlign(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  provider: {
    accessToken: string;
    calendarId: string;
    connectionId: ConnectionId;
  },
  providerEventId: string,
  reason: SyncCommandFailureReason,
): Promise<CommandRecord | null> {
  if (reason !== "permanentProviderError") {
    return failCommand(deps, command, reason, provider.connectionId);
  }
  const fetchResult = await runProviderWrite(() =>
    deps.writer.fetchEvent({
      accessToken: provider.accessToken,
      calendarId: provider.calendarId,
      providerEventId: providerEventId as ProviderEventId,
    }),
  );
  if (!fetchResult.ok) {
    if (fetchResult.stop.kind === "pending") return command;
    return failCommand(
      deps,
      command,
      fetchResult.stop.reason,
      provider.connectionId,
    );
  }
  if (fetchResult.value?.kind === "event") {
    return failCommand(deps, command, reason, provider.connectionId);
  }
  return null;
}

// Build the canonical event for a provider-linked create: same shape as a cloud
// event but with the provider identity the write returned. calendarId stays the
// Sync provider-calendar id (how the command addressed it); the raw provider
// calendar id is only used for the API call.
export async function confirmDeletion(
  deps: ProviderMutationDeps,
  command: CommandRecord,
): Promise<CommandRecord> {
  const confirmed = await deps.commands.updateOutcome(
    command.tenantId,
    command.principalId,
    command._id,
    { state: "confirmed", providerEventId: null, providerVersion: null },
    command.attemptCount,
  );
  return confirmed ?? command;
}

// Restore a deletionPending event to active, then fail the command. A failed
// delete must not leave the event stuck reading as "deleting". The revert write
// is NOT wrapped in a catch: replaceExisting signals the benign "already gone"
// case with a resolved false (not a throw), so a throw here is a real error —
// letting it propagate keeps the command pending (not falsely failed) and
// retryable, rather than marking it terminally failed with a stuck event.
export async function revertAndFail(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  event: EventRecord,
  reason: SyncCommandFailureReason,
  connectionId: ConnectionId,
  now: () => Date,
): Promise<CommandRecord> {
  await deps.events.replaceExisting({
    ...event,
    lifecycleState: "active",
    updatedAt: now(),
  });
  return failCommand(deps, command, reason, connectionId);
}
