import { type SyncCommandFailureReason } from "@core/types/sync/command.contracts";
import { type ProviderEventVersion } from "@core/types/sync/event.contracts";
import {
  type ConnectionId,
  type ProviderEventId,
} from "@core/types/sync/identity.contracts";
import { type ProviderMutationDeps } from "@sync/domain/provider-command.deps";
import {
  type ProviderWriteStop,
  resolveAccessToken,
  runProviderWrite,
} from "@sync/domain/provider-write-ladder";
import {
  type ProviderEvent,
  type ProviderEventRead,
} from "@sync/providers/provider-event.port";
import { type CommandRecord } from "@sync/storage/contracts/command.contracts";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";

// Transient refresh stays pending so the command can retry; a revoked or
// missing credential fails the command. Delete is the one caller that cannot
// use this: it must restore the event from deletionPending first.
export async function resolveCommandAccessToken(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  connectionId: ConnectionId,
): Promise<
  { ok: true; accessToken: string } | { ok: false; command: CommandRecord }
> {
  const tokenResult = await resolveAccessToken(deps.custody, connectionId);
  if (tokenResult.ok) return tokenResult;
  if (tokenResult.stop.kind === "pending") return { ok: false, command };
  return {
    ok: false,
    command: await failCommand(
      deps,
      command,
      tokenResult.stop.reason,
      connectionId,
    ),
  };
}

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

// The outcome every provider write shares once runProviderWrite stops it: a
// transient stop leaves the command pending so the next attempt retries it, a
// terminal one fails it with the typed reason. Callers that must undo local
// state before failing (delete's deletionPending revert) use revertAndFail
// instead; so does any caller whose reason depends on more than the stop.
export async function stopCommand(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  stop: ProviderWriteStop,
  connectionId: ConnectionId,
): Promise<CommandRecord> {
  if (stop.kind === "pending") return command;
  return failCommand(deps, command, stop.reason, connectionId);
}

// The read every replay check opens with: fetch the target's current provider
// state, so the caller can tell "this edit already landed" from "the provider
// moved on" and learn the version to commit at. A stopped read settles the
// command the shared way (pending or typed failure); a target that no longer
// reads back as a content event — a cancellation, or nothing at all — fails
// the command, because there is nothing left to write to.
//
// The read itself is the caller's: the target is a whole event (fetchEvent)
// for most paths and one resolved instance (fetchInstanceAt) for a
// per-occurrence rsvp. Mirrors resolveCommandAccessToken's result shape, so a
// caller forwards `command` on the not-ok branch and keeps going otherwise.
export async function resolveCurrentProviderEvent(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  connectionId: ConnectionId,
  read: () => Promise<ProviderEventRead | null>,
): Promise<
  { ok: true; current: ProviderEvent } | { ok: false; command: CommandRecord }
> {
  const fetchResult = await runProviderWrite(read);
  if (!fetchResult.ok) {
    return {
      ok: false,
      command: await stopCommand(deps, command, fetchResult.stop, connectionId),
    };
  }
  if (fetchResult.value?.kind !== "event") {
    return {
      ok: false,
      command: await failCommand(
        deps,
        command,
        "permanentProviderError",
        connectionId,
      ),
    };
  }
  return { ok: true, current: fetchResult.value };
}

// Confirm a provider-linked write at the identity it landed on. The twin of
// confirmDeletion, which settles with no identity to keep. A null from
// updateOutcome means another attempt already settled the command, so the
// caller's own record is returned unchanged.
export async function confirmCommand(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  providerEventId: string,
  providerVersion: string,
): Promise<CommandRecord> {
  const confirmed = await deps.commands.updateOutcome(
    command.tenantId,
    command.principalId,
    command._id,
    {
      state: "confirmed",
      providerEventId: providerEventId as ProviderEventId,
      providerVersion: providerVersion as ProviderEventVersion,
    },
    command.attemptCount,
  );
  return confirmed ?? command;
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
    return stopCommand(deps, command, fetchResult.stop, provider.connectionId);
  }
  if (fetchResult.value?.kind === "event") {
    return failCommand(deps, command, reason, provider.connectionId);
  }
  return null;
}

// Confirm a provider-linked delete: the adapter already treated the event as
// gone, so the command settles with no provider identity to keep.
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
