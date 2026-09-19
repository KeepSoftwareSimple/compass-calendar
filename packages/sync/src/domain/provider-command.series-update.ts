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
  confirmCommand,
  failCommand,
  organizerGuardFailure,
  resolveCommandAccessToken,
  resolveCurrentProviderEvent,
  resolveFailedOverrideAlign,
  stopCommand,
} from "@sync/domain/provider-command.internal";
import { runProviderWrite } from "@sync/domain/provider-write-ladder";
import { reprojectOccurrences } from "@sync/domain/reproject";
import {
  exceptionInstant,
  partitionEditAllExceptions,
} from "@sync/domain/series-exception";
import { type CommandRecord } from "@sync/storage/contracts/command.contracts";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";

// Apply a Compass-initiated scope-"all" edit to a provider-linked recurring
// series — Google's "edit all events in the series". The master is patched with
// the new content, schedule, AND recurrence rules, and its per-instance
// overrides fall away. Kept separate from executeProviderUpdate because the
// local commit is series-aware: it discards override exceptions but preserves
// cancelled tombstones (a deletion must survive an edit) and reprojects the
// master excluding their instants.
//
// Provider-managed events are single-only today (Google Gmail events), so this
// path is unreachable for them; managed customizations live in the single-event
// update path instead.
//
// Replay safety mirrors the single-event path: fetch the provider's current
// master first; if it already carries this edit (content, schedule, and rules),
// a prior attempt landed, so confirm at the current version without re-writing.
// Otherwise patch conditionally on the command's expected version, turning a
// genuine concurrent external edit into a versionConflict.
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

  const token = await resolveCommandAccessToken(deps, command, connectionId);
  if (!token.ok) return token.command;
  const { accessToken } = token;

  const location = {
    accessToken,
    calendarId: calendar.providerCalendarId,
    providerEventId,
  };

  // Fetch the master's current provider state to detect a replay and learn the
  // version to commit. A cancellation read means the series no longer exists.
  const fetched = await resolveCurrentProviderEvent(
    deps,
    command,
    connectionId,
    () => deps.writer.fetchEvent(location),
  );
  if (!fetched.ok) return fetched.command;
  const { current } = fetched;

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
    return stopCommand(deps, command, patchResult.stop, connectionId);
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

  return confirmCommand(
    deps,
    command,
    master.providerEventId as ProviderEventId,
    providerVersion,
  );
}
