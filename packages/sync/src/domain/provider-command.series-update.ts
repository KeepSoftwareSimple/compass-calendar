import { type Attendee } from "@core/types/event-attendance.contracts";
import {
  type ProviderEventVersion,
  type SyncEventContent,
} from "@core/types/sync/event.contracts";
import {
  type ConnectionId,
  type ProviderEventId,
} from "@core/types/sync/identity.contracts";
import {
  mergeAttendees,
  resolveUpdateContent,
  resolveUpdateSchedule,
} from "@sync/domain/merge-update-content";
import { occurrenceScheduleAfterSeriesEdit } from "@sync/domain/occurrence-projection";
import { type ProviderMutationDeps } from "@sync/domain/provider-command.deps";
import {
  intendedSeriesRecurrence,
  matchesIntendedEdit,
  patchExpectedVersion,
  storedSeriesRecurrence,
} from "@sync/domain/provider-command.intent-match";
import {
  failCommand,
  organizerGuardFailure,
  resolveFailedOverrideAlign,
} from "@sync/domain/provider-command.internal";
import {
  resolveAccessToken,
  runProviderWrite,
} from "@sync/domain/provider-write-ladder";
import { reprojectOccurrences } from "@sync/domain/reproject";
import {
  exceptionInstant,
  partitionEditAllExceptions,
} from "@sync/domain/series-exception";
import { type CommandRecord } from "@sync/storage/contracts/command.contracts";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";

export async function executeProviderSeriesUpdate(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  master: EventRecord,
  calendar: ProviderCalendarRecord,
  now: () => Date,
): Promise<CommandRecord> {
  if (command.input.kind !== "update") {
    throw new Error("executeProviderSeriesUpdate requires an update command");
  }
  if (!master.connectionId || !master.providerEventId) {
    throw new Error("executeProviderSeriesUpdate requires a linked event");
  }
  if (master.recurrence.kind !== "seriesMaster") {
    throw new Error("executeProviderSeriesUpdate requires a series master");
  }
  const { input } = command;
  const connectionId = master.connectionId;
  const providerEventId = master.providerEventId;
  const intendedRecurrence = intendedSeriesRecurrence(input.recurrence, master);

  // Same organizer gate as the single-event path: a non-organizer guest-list
  // replace fails typed before any provider call.
  if (input.attendeesEdit === "replace") {
    const guardFailure = await organizerGuardFailure(
      deps,
      command,
      master,
      connectionId,
    );
    if (guardFailure) return guardFailure;
  }

  const tokenResult = await resolveAccessToken(deps.custody, connectionId);
  if (!tokenResult.ok) {
    if (tokenResult.stop.kind === "pending") return command;
    return failCommand(deps, command, tokenResult.stop.reason, connectionId);
  }
  const { accessToken } = tokenResult;

  const location = {
    accessToken,
    calendarId: calendar.providerCalendarId,
    providerEventId,
  };

  // Fetch the master's current provider state to detect a replay and learn the
  // version to commit. A cancellation read means the series no longer exists.
  const fetchResult = await runProviderWrite(() =>
    deps.writer.fetchEvent(location),
  );
  if (!fetchResult.ok) {
    if (fetchResult.stop.kind === "pending") return command;
    return failCommand(deps, command, fetchResult.stop.reason, connectionId);
  }
  const current =
    fetchResult.value?.kind === "event" ? fetchResult.value : null;
  if (!current) {
    return failCommand(deps, command, "permanentProviderError", connectionId);
  }

  let content = resolveUpdateContent(
    master.content,
    input.content,
    current.content,
  );
  const schedule = resolveUpdateSchedule(input.schedule, current.schedule);
  // Guest membership merges against the freshly fetched master, mirroring the
  // single-event path (see executeProviderUpdate).
  const intendedAttendees =
    input.attendeesEdit === "replace" && input.content
      ? mergeAttendees(input.content.attendees, current.content.attendees)
      : undefined;
  if (intendedAttendees) {
    content = { ...content, attendees: intendedAttendees };
  }

  // Replay: the provider already holds this series edit (rules included), so
  // confirm at its version rather than writing again.
  if (
    matchesIntendedEdit(
      current,
      content,
      schedule,
      intendedRecurrence,
      intendedAttendees,
    )
  ) {
    return commitProviderSeriesUpdate(
      deps,
      command,
      master,
      content,
      intendedAttendees,
      current.providerVersion,
      now,
      {
        accessToken,
        calendarId: calendar.providerCalendarId,
        connectionId,
      },
    );
  }

  const patchResult = await runProviderWrite(() =>
    deps.writer.patchEvent({
      ...location,
      expectedVersion: patchExpectedVersion(
        command,
        current,
        master,
        intendedAttendees !== undefined,
      ),
      content,
      schedule,
      recurrence: intendedRecurrence,
      invitation: input.invitation,
      ...(intendedAttendees ? { attendees: intendedAttendees } : {}),
    }),
  );
  if (!patchResult.ok) {
    if (patchResult.stop.kind === "pending") return command;
    return failCommand(deps, command, patchResult.stop.reason, connectionId);
  }
  const result = patchResult.value;

  return commitProviderSeriesUpdate(
    deps,
    command,
    master,
    content,
    intendedAttendees,
    result.providerVersion,
    now,
    {
      accessToken,
      calendarId: calendar.providerCalendarId,
      connectionId,
    },
  );
}

// Commit a provider series edit-all locally after the provider write lands.
// An edit-all discards per-instance content/time OVERRIDES (they revert to the
// edited series) but KEEPS cancelled tombstones, whose instants are excluded
// from the reprojected master so a deleted occurrence is not resurrected. A
// conversion to a single event drops every exception.
//
// Content/time overrides are aligned at the provider (patched to the edited
// series), then deleted locally BEFORE the master is replaced — the same
// crash-safety ordering the cloud path uses. Google does not drop instance
// overrides when the master is patched, so a later pull would otherwise
// resurrect stale override fields. Patching (not deleting) keeps the
// occurrence confirmed: Google's events.delete on an instance cancels that
// date, and a later pull would tombstone it out of the series. A
// convert-to-single edit still deletes discarded exceptions at the provider
// (they are no longer series members). Clearing locals first also closes the
// convert-to-single retry hole: a retry that read the converted single master
// would take the single-event path, which never cleans exceptions. Gating the
// kept/discarded split on the command's immutable recurrence intent keeps a
// retry classifying identically. A false from replaceExisting means the
// master vanished mid-flight, so leave the command pending rather than
// confirm a gone series.
async function commitProviderSeriesUpdate(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  master: EventRecord,
  content: SyncEventContent,
  // Present when this edit-all replaced the guest list: the override-align
  // patches carry the same merged membership, so a reverted override does not
  // keep a stale guest list Google would otherwise leave on it.
  intendedAttendees: readonly Attendee[] | undefined,
  providerVersion: string,
  now: () => Date,
  provider: {
    accessToken: string;
    calendarId: string;
    connectionId: ConnectionId;
  },
): Promise<CommandRecord> {
  if (command.input.kind !== "update") {
    throw new Error("commitProviderSeriesUpdate requires an update command");
  }
  const { input } = command;
  const convertsToSingle = input.recurrence.kind === "single";
  const exceptions = await deps.events.findSeriesExceptions(
    command.tenantId,
    command.principalId,
    master._id,
  );
  const { kept, discarded } = partitionEditAllExceptions(
    exceptions,
    convertsToSingle,
  );

  // Align or remove discarded overrides at Google first, then clear local
  // copies. Kept cancelled tombstones are not touched at the provider.
  for (const exception of discarded) {
    const exceptionProviderEventId = exception.providerEventId;
    if (exceptionProviderEventId) {
      const alignResult = await runProviderWrite(async () => {
        if (convertsToSingle) {
          await deps.writer.deleteEvent({
            accessToken: provider.accessToken,
            calendarId: provider.calendarId,
            providerEventId: exceptionProviderEventId,
            expectedVersion: null,
            invitation: input.invitation,
          });
          return;
        }
        await deps.writer.patchEvent({
          // Revert the override into the edited series without cancelling
          // the occurrence. Delete would mark the instance cancelled at Google.
          accessToken: provider.accessToken,
          calendarId: provider.calendarId,
          providerEventId: exceptionProviderEventId,
          expectedVersion: null,
          content,
          schedule: occurrenceScheduleAfterSeriesEdit(
            master.schedule,
            resolveUpdateSchedule(input.schedule, master.schedule),
            exceptionInstant(exception),
          ),
          recurrence: { kind: "instance" },
          invitation: input.invitation,
          ...(intendedAttendees ? { attendees: intendedAttendees } : {}),
        });
      });
      if (!alignResult.ok) {
        if (alignResult.stop.kind === "pending") return command;
        if (convertsToSingle) {
          return failCommand(
            deps,
            command,
            alignResult.stop.reason,
            provider.connectionId,
          );
        }
        const stop = await resolveFailedOverrideAlign(
          deps,
          command,
          provider,
          exceptionProviderEventId,
          alignResult.stop.reason,
        );
        if (stop) return stop;
      }
    }

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

  const updated: EventRecord = {
    ...master,
    content,
    schedule: input.schedule ?? master.schedule,
    recurrence: storedSeriesRecurrence(input.recurrence, master),
    providerVersion: providerVersion as ProviderEventVersion,
    providerUpdatedAt: null,
    deliveryState: "confirmed",
    updatedAt: now(),
  };
  const applied = await deps.events.replaceExisting(updated);
  if (!applied) return command;
  await reprojectOccurrences(
    deps.occurrences,
    updated,
    now,
    kept.map(exceptionInstant),
  );

  const confirmed = await deps.commands.updateOutcome(
    command.tenantId,
    command.principalId,
    command._id,
    {
      state: "confirmed",
      providerEventId: master.providerEventId as ProviderEventId,
      providerVersion: providerVersion as ProviderEventVersion,
    },
    command.attemptCount,
  );
  return confirmed ?? command;
}

// ---------------------------------------------------------------------------
// Provider-linked recurring scopes "this" and "thisAndFollowing".
//
// A this/thisAndFollowing scope operates on ONE instance of a provider series,
// which — unlike a cloud series exception — has no id of its own until
// resolved via writer.fetchInstanceAt. Every executor below: resolves the
// instance (or, for a split, patches the master directly), applies the same
// replay-safe fetch-then-compare pattern executeProviderUpdate/
// executeProviderSeriesUpdate already use, and commits locally through
// upsertException/reprojectMaster — the exact local-commit shape the cloud
// path's updateCloudOccurrence/deleteCloudOccurrence/*SeriesFollowing already
// use (series-exception.ts), so a provider-linked and a cloud-only
// series converge to the same on-disk shape.
//
// Known deferred gap: un-cancelling a provider instance (a scope-"this" edit
// of an instance the provider already reports as cancelled) is not
// implemented — it fails with permanentProviderError rather than silently
// no-op'ing. Restoring a cancelled Google instance to "confirmed" is a
// distinct provider operation this slice does not need for the common
// edit/delete-a-live-instance path.
// ---------------------------------------------------------------------------

// Apply a Compass-initiated scope-"this" edit to one occurrence of a
// provider-linked series: resolve the instance's own provider identity, then
// patch IT (never the master) — mirrors executeProviderUpdate's replay-safe
// fetch-then-compare, but against the resolved instance's location.
//
// Provider-managed events are single-only today, so this occurrence path is
// unreachable for them; managed customizations live in the single-event update
// path instead.
