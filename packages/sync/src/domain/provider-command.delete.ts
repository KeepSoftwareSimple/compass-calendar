import { type EventId } from "@core/types/domain-primitives";
import { type ProviderDeleteDeps } from "@sync/domain/provider-command.deps";
import {
  confirmDeletion,
  revertAndFail,
} from "@sync/domain/provider-command.internal";
import {
  resolveAccessToken,
  runProviderWrite,
} from "@sync/domain/provider-write-ladder";
import { type CommandRecord } from "@sync/storage/contracts/command.contracts";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";

export async function executeProviderDelete(
  deps: ProviderDeleteDeps,
  command: CommandRecord,
  event: EventRecord,
  calendar: ProviderCalendarRecord,
  now: () => Date,
): Promise<CommandRecord> {
  if (command.input.kind !== "delete") {
    throw new Error("executeProviderDelete requires a delete command");
  }
  if (!event.connectionId || !event.providerEventId) {
    throw new Error("executeProviderDelete requires a linked event");
  }
  const { input } = command;
  const connectionId = event.connectionId;
  const providerEventId = event.providerEventId;

  // Mark the event as being deleted. If it is already gone locally, a prior
  // attempt removed it (the marker was written first) — the delete converged.
  // Still cascade any leftover series exceptions: older builds removed the
  // master without clearing overrides, and a crash between exception cleanup
  // and confirm can leave the same residue.
  const marked = await deps.events.replaceExisting({
    ...event,
    lifecycleState: "deletionPending",
    updatedAt: now(),
  });
  if (!marked) {
    await clearSeriesExceptions(deps, command, command.eventId);
    return confirmDeletion(deps, command);
  }

  const tokenResult = await resolveAccessToken(deps.custody, connectionId);
  if (!tokenResult.ok) {
    if (tokenResult.stop.kind === "pending") return command;
    return revertAndFail(
      deps,
      command,
      event,
      tokenResult.stop.reason,
      connectionId,
      now,
    );
  }
  const { accessToken } = tokenResult;

  // Transient: keep the event deletionPending (visibly deleting) and retry.
  // Terminal: the delete failed, so restore the event to active rather than
  // leaving it stuck showing "deleting".
  const deleteResult = await runProviderWrite(() =>
    deps.writer.deleteEvent({
      accessToken,
      calendarId: calendar.providerCalendarId,
      providerEventId,
      // Unconditional: a cancellation is not conditioned on the version, so an
      // unrelated external change never blocks it.
      expectedVersion: null,
      invitation: input.invitation,
    }),
  );
  if (!deleteResult.ok) {
    if (deleteResult.stop.kind === "pending") return command;
    return revertAndFail(
      deps,
      command,
      event,
      deleteResult.stop.reason,
      connectionId,
      now,
    );
  }

  // The provider confirmed the deletion. Write the content-free tombstone first
  // (so no window exists where the event is gone with no marker), clear the
  // master's occurrences, cascade local series exceptions (Google-side instance
  // overrides), then remove the master LAST — same crash-safety as the cloud
  // series delete / pull cascade. Clearing before deleteById matters: a crash
  // after deleteById would otherwise strand occurrence rows, since the retry's
  // already-gone (`!marked`) branch confirms without ever clearing them.
  await deps.markers.record({
    tenantId: event.tenantId,
    principalId: event.principalId,
    connectionId,
    calendarId: event.calendarId,
    providerEventId,
    providerVersion: event.providerVersion,
    deletionSource: "compass",
    deletedAt: now(),
  });
  await deps.occurrences.replaceForEvent(event._id, event.generation, []);
  await clearSeriesExceptions(deps, command, event._id);
  await deps.events.deleteById(event.tenantId, event.principalId, event._id);
  return confirmDeletion(deps, command);
}

// Remove every local exception of a series (occurrences first). Idempotent:
// findSeriesExceptions is empty when the target was a single event or when a
// prior attempt already cleared overrides. Does not call the provider — Google
// series delete already discarded the instances with the master.
async function clearSeriesExceptions(
  deps: ProviderDeleteDeps,
  command: CommandRecord,
  seriesId: EventId,
): Promise<void> {
  const exceptions = await deps.events.findSeriesExceptions(
    command.tenantId,
    command.principalId,
    seriesId,
  );
  for (const exception of exceptions) {
    await deps.occurrences.replaceForEvent(
      exception._id,
      exception.generation,
      [],
    );
    await deps.events.deleteById(
      command.tenantId,
      command.principalId,
      exception._id,
    );
  }
}

// Confirm a completed deletion: the event has no live provider target anymore,
// so the confirmed outcome carries no provider identity.
