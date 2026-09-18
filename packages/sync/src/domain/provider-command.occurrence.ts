import { type DateTime } from "@core/types/domain-primitives";
import { type EventSchedule } from "@core/types/event.contracts";
import {
  type ProviderEventVersion,
  type SyncEventContent,
} from "@core/types/sync/event.contracts";
import { type ProviderEventId } from "@core/types/sync/identity.contracts";
import {
  resolveUpdateContent,
  resolveUpdateSchedule,
} from "@sync/domain/merge-update-content";
import { occurrenceScheduleAt } from "@sync/domain/occurrence-projection";
import { type ProviderMutationDeps } from "@sync/domain/provider-command.deps";
import { matchesIntendedEdit } from "@sync/domain/provider-command.intent-match";
import {
  failCommand,
  resolveCommandAccessToken,
  stopCommand,
} from "@sync/domain/provider-command.internal";
import { runProviderWrite } from "@sync/domain/provider-write-ladder";
import { reprojectOccurrences } from "@sync/domain/reproject";
import { reprojectMaster } from "@sync/domain/series-exception";
import { type CommandRecord } from "@sync/storage/contracts/command.contracts";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";

// Provider-linked recurring scopes "this" and "thisAndFollowing".
//
// A this/thisAndFollowing scope operates on ONE instance of a provider series,
// which — unlike a cloud series exception — has no id of its own until
// resolved via writer.fetchInstanceAt. Every executor in this file and in
// provider-command.series-following.ts: resolves the instance (or, for a
// split, patches the master directly), applies the same replay-safe
// fetch-then-compare pattern executeProviderUpdate/executeProviderSeriesUpdate
// already use, and commits locally through upsertException/reprojectMaster —
// the exact local-commit shape the cloud path's
// updateCloudOccurrence/deleteCloudOccurrence/*SeriesFollowing already use
// (series-exception.ts), so a provider-linked and a cloud-only series
// converge to the same on-disk shape.
//
// Known deferred gap: un-cancelling a provider instance (a scope-"this" edit
// of an instance the provider already reports as cancelled) is not
// implemented — it fails with permanentProviderError rather than silently
// no-op'ing. Restoring a cancelled Google instance to "confirmed" is a
// distinct provider operation this slice does not need for the common
// edit/delete-a-live-instance path.

// Apply a Compass-initiated scope-"this" edit to one occurrence of a
// provider-linked series: resolve the instance's own provider identity, then
// patch IT (never the master) — mirrors executeProviderUpdate's replay-safe
// fetch-then-compare, but against the resolved instance's location.
//
// Provider-managed events are single-only today, so this occurrence path is
// unreachable for them; managed customizations live in the single-event update
// path instead.
export async function executeProviderOccurrenceUpdate(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  master: EventRecord,
  calendar: ProviderCalendarRecord,
  now: () => Date,
): Promise<CommandRecord> {
  if (command.input.kind !== "update" || command.input.recurrenceId === null) {
    throw new Error(
      "executeProviderOccurrenceUpdate requires a this-scope update command",
    );
  }
  if (!master.connectionId || !master.providerEventId) {
    throw new Error(
      "executeProviderOccurrenceUpdate requires a linked series master",
    );
  }
  if (master.recurrence.kind !== "seriesMaster") {
    throw new Error("executeProviderOccurrenceUpdate requires a series master");
  }
  const { input } = command;
  const recurrenceId = input.recurrenceId as DateTime;
  const connectionId = master.connectionId;
  const seriesProviderEventId = master.providerEventId;

  // Guest-list editing is whole-event/whole-series only in v1: a replace on a
  // "this" scope has no defined per-occurrence semantics yet, so refuse typed
  // rather than silently preserving — dropped intent would read as a
  // successful guest edit that never happened.
  if (input.attendeesEdit === "replace") {
    return failCommand(deps, command, "unsupportedCapability", connectionId);
  }

  const token = await resolveCommandAccessToken(deps, command, connectionId);
  if (!token.ok) return token.command;
  const { accessToken } = token;

  const fetchInstanceResult = await runProviderWrite(() =>
    deps.writer.fetchInstanceAt({
      accessToken,
      calendarId: calendar.providerCalendarId,
      seriesProviderEventId,
      originalStartAt: recurrenceId,
      scheduleKind: master.schedule.kind,
    }),
  );
  if (!fetchInstanceResult.ok) {
    return stopCommand(deps, command, fetchInstanceResult.stop, connectionId);
  }
  const instance =
    fetchInstanceResult.value?.kind === "event"
      ? fetchInstanceResult.value
      : null;
  // No live instance to override: never materialized at that instant, or
  // already cancelled at the provider (see the deferred-gap note above).
  if (!instance) {
    return failCommand(deps, command, "permanentProviderError", connectionId);
  }

  const content = resolveUpdateContent(
    master.content,
    input.content,
    instance.content,
  );
  const schedule = resolveUpdateSchedule(input.schedule, instance.schedule);
  const providerEventId = instance.providerEventId;
  const location = {
    accessToken,
    calendarId: calendar.providerCalendarId,
    providerEventId,
  };

  // An occurrence override is always a standalone provider event, resolved
  // off the series by fetchInstanceAt — "instance", not "single": Google
  // rejects a `recurrence` key at all on that kind of event (see
  // ProviderWriteRecurrence).
  if (
    matchesIntendedEdit(instance, content, schedule, {
      kind: "instance",
    })
  ) {
    return commitProviderOccurrenceUpdate(
      deps,
      command,
      master,
      recurrenceId,
      content,
      schedule,
      providerEventId,
      instance.providerVersion,
      now,
    );
  }

  const patchResult = await runProviderWrite(() =>
    deps.writer.patchEvent({
      ...location,
      expectedVersion: command.expectedVersion,
      content,
      schedule,
      recurrence: { kind: "instance" },
      invitation: input.invitation,
    }),
  );
  if (!patchResult.ok) {
    return stopCommand(deps, command, patchResult.stop, connectionId);
  }
  const result = patchResult.value;

  return commitProviderOccurrenceUpdate(
    deps,
    command,
    master,
    recurrenceId,
    content,
    schedule,
    providerEventId,
    result.providerVersion,
    now,
  );
}

// Commit a provider occurrence override locally: upsert the exception
// carrying the INSTANCE's own provider identity (never the master's — see
// upsertException's providerIdentity param), reproject the master to exclude
// that instant, then project the exception's own occurrence.
async function commitProviderOccurrenceUpdate(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  master: EventRecord,
  recurrenceId: DateTime,
  content: SyncEventContent,
  schedule: EventSchedule,
  providerEventId: string,
  providerVersion: string,
  now: () => Date,
): Promise<CommandRecord> {
  if (command.input.kind !== "update") {
    throw new Error(
      "commitProviderOccurrenceUpdate requires an update command",
    );
  }
  const exception = await deps.events.upsertException(
    master,
    recurrenceId,
    {
      content,
      schedule,
      cancelled: false,
      providerIdentity: {
        providerEventId: providerEventId as ProviderEventId,
        providerVersion: providerVersion as ProviderEventVersion,
      },
    },
    now(),
  );
  await reprojectMaster(deps, command, master, now);
  await reprojectOccurrences(deps.occurrences, exception, now);

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

// Apply a Compass-initiated scope-"this" delete to one occurrence of a
// provider-linked series: resolve the instance, delete IT at the provider
// (Google represents this as cancelling that one instance — the series and
// every other instance are untouched), then cancel the local tombstone.
// Idempotent: an already-cancelled or never-materialized instance converges
// to the same local tombstone without a second provider call, mirroring how
// a whole-event delete treats an already-absent target as success.
export async function executeProviderOccurrenceDelete(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  master: EventRecord,
  calendar: ProviderCalendarRecord,
  now: () => Date,
): Promise<CommandRecord> {
  if (command.input.kind !== "delete" || command.input.recurrenceId === null) {
    throw new Error(
      "executeProviderOccurrenceDelete requires a this-scope delete command",
    );
  }
  if (!master.connectionId || !master.providerEventId) {
    throw new Error(
      "executeProviderOccurrenceDelete requires a linked series master",
    );
  }
  if (master.recurrence.kind !== "seriesMaster") {
    throw new Error("executeProviderOccurrenceDelete requires a series master");
  }
  const { input } = command;
  const recurrenceId = input.recurrenceId as DateTime;
  const connectionId = master.connectionId;
  const seriesProviderEventId = master.providerEventId;

  const token = await resolveCommandAccessToken(deps, command, connectionId);
  if (!token.ok) return token.command;
  const { accessToken } = token;

  const fetchInstanceResult = await runProviderWrite(() =>
    deps.writer.fetchInstanceAt({
      accessToken,
      calendarId: calendar.providerCalendarId,
      seriesProviderEventId,
      originalStartAt: recurrenceId,
      scheduleKind: master.schedule.kind,
    }),
  );
  if (!fetchInstanceResult.ok) {
    return stopCommand(deps, command, fetchInstanceResult.stop, connectionId);
  }
  const instance =
    fetchInstanceResult.value?.kind === "event" &&
    fetchInstanceResult.value.providerEventId !== seriesProviderEventId
      ? fetchInstanceResult.value
      : null;

  if (instance) {
    const deleteResult = await runProviderWrite(() =>
      deps.writer.deleteEvent({
        accessToken,
        calendarId: calendar.providerCalendarId,
        providerEventId: instance.providerEventId,
        // Unconditional, same rationale as the whole-event delete: cancelling
        // one instance is not conditioned on its version.
        expectedVersion: null,
        invitation: input.invitation,
      }),
    );
    if (!deleteResult.ok) {
      return stopCommand(deps, command, deleteResult.stop, connectionId);
    }
  }

  const exception = await deps.events.upsertException(
    master,
    recurrenceId,
    {
      content: master.content,
      schedule: occurrenceScheduleAt(master.schedule, recurrenceId),
      cancelled: true,
      // `null`, not omitted: this exception is provider-linked (master is),
      // and omitting would fall back to the master's own providerEventId —
      // colliding the provider_event_identity unique index the master
      // already occupies. When the instance is already gone at the provider
      // there is no live counterpart to record.
      providerIdentity: instance
        ? {
            providerEventId: instance.providerEventId as ProviderEventId,
            providerVersion: instance.providerVersion as ProviderEventVersion,
          }
        : null,
    },
    now(),
  );
  await reprojectMaster(deps, command, master, now);
  await reprojectOccurrences(deps.occurrences, exception, now);

  const confirmed = await deps.commands.updateOutcome(
    command.tenantId,
    command.principalId,
    command._id,
    // No live provider target for this command once the instance is
    // cancelled — same shape confirmDeletion uses for a whole-event delete.
    { state: "confirmed", providerEventId: null, providerVersion: null },
    command.attemptCount,
  );
  return confirmed ?? command;
}
