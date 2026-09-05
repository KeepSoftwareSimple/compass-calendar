import { type DateTime } from "@core/types/domain-primitives";
import { type EditableRecurrence } from "@core/types/event.contracts";
import { type SyncEventRecurrence } from "@core/types/sync/event.contracts";
import { type ProviderCalendarId } from "@core/types/sync/identity.contracts";
import { type SyncExecutionMode } from "@sync/config/sync.config";
import { type CredentialCustody } from "@sync/credentials/credential-custody.service";
import { terminalReplayIsStale } from "@sync/domain/command-replay";
import {
  mergeAttendees,
  mergeUpdateContent,
  omitNullColor,
} from "@sync/domain/merge-update-content";
import {
  isFollowingSplitAtSeriesStart,
  occurrenceScheduleAt,
  stripRuleBounds,
  truncateRulesBefore,
} from "@sync/domain/occurrence-projection";
import {
  executeProviderCreate,
  executeProviderDelete,
  executeProviderOccurrenceDelete,
  executeProviderOccurrenceUpdate,
  executeProviderRsvp,
  executeProviderSeriesFollowingDelete,
  executeProviderSeriesFollowingUpdate,
  executeProviderSeriesUpdate,
  executeProviderUpdate,
  type ProviderConnectionLookup,
  type ProviderDeleteDeps,
} from "@sync/domain/provider-command.service";
import { reprojectOccurrences } from "@sync/domain/reproject";
import {
  deleteExceptions,
  deleteFollowingExceptions,
  exceptionInstant,
  isCancelledException,
  remainderMasterId,
  reprojectMaster,
} from "@sync/domain/series-exception";
import {
  ProviderNotConfiguredError,
  type ResolveProviderAdapters,
} from "@sync/providers/provider-adapters";
import { type ProviderEventWriter } from "@sync/providers/provider-event-writer.port";
import {
  type CommandRecord,
  type CommandSubmit,
} from "@sync/storage/contracts/command.contracts";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";
import { type CommandRepository } from "@sync/storage/repositories/command.repository";
import { type DeletionMarkerRepository } from "@sync/storage/repositories/deletion-marker.repository";
import { type EventRepository } from "@sync/storage/repositories/event.repository";
import { type EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { type ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { type SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

// A provider-targeted write arrived while provider work is unavailable
// (execution is passive, or no provider is configured). Accepting it as
// pending without a self-heal path would strand the write while the caller
// believes it succeeded — so the request is refused. The stale-command retry
// sweep revisits create/update/delete once provider work is available again.
//
// Production hit exactly that on 2026-07-29: routing was flipped to Sync while
// the sync process was still passive, and creates returned 200 with the event
// silently never reaching Google.
export class ProviderWriteUnavailableError extends Error {
  constructor() {
    super("Provider writes are unavailable; command not accepted");
    this.name = "ProviderWriteUnavailableError";
  }
}

export interface CloudCommandDeps {
  commands: CommandRepository;
  events: EventRepository;
  calendars: ProviderCalendarRepository;
  // The derived occurrence projection, rebuilt for an event's horizon whenever
  // a cloud command changes it so range queries stay current.
  occurrences: EventOccurrenceRepository;
  // Which generation reads serve per calendar, so a provider-linked create
  // projects where reads will look for it.
  resources: SyncResourceRepository;
  // Connection facts for the provider executors' attendee organizer guard —
  // a guest-list replace is only valid for the connection account that
  // organizes the event.
  connections: ProviderConnectionLookup;
  // The deletion-marker store, for the tombstone a provider delete leaves.
  markers: DeletionMarkerRepository;
  execution: SyncExecutionMode;
  // Provider write capability, present only when a provider is configured and
  // provider work is enabled. Absent means a provider-targeted command is
  // refused (see ProviderWriteUnavailableError) rather than left pending.
  provider?: {
    resolveAdapters: ResolveProviderAdapters;
    custody: CredentialCustody;
  };
}

// Durably record a command and, for a cloud-only create, apply it to the
// canonical event store and confirm it locally — no provider round-trip. The
// whole operation is idempotent: submit dedupes on the idempotency key, the
// event write is keyed by the client-supplied event id, and confirmation only
// runs while the command is still pending. So a retry after a crash at any
// point converges on one confirmed command and one event.
//
// A command with a provider target (its calendar is a connected provider
// calendar) is left pending here: confirming it locally would skip the provider
// write. The provider execution path applies and confirms it. A non-create
// command is likewise persisted as durable pending intent and returned
// unchanged; applying update/move/delete locally lands in a later slice.
//
// A terminal command replay is not automatically a no-op. A delete's
// idempotency key is identity-only (eventId/scope/recurrenceId), and an
// update's key hashes its full content, so a delete/undo/delete-again (or an
// edit replayed by undo/redo) can collide with an earlier terminal command on
// the same key. terminalReplayIsStale checks whether that collision is a
// genuine no-op or a fresh intent (a delete is checked against world state;
// a create/update only when the client marks the submission `restore: true`
// — see its docblock in command-replay.ts for why they differ). When stale,
// the command is reopened to pending and re-executed below rather than
// replayed as a no-op. Without this, a delete that once confirmed without
// truly deleting (or was undone and redone) becomes permanently unreachable —
// `commands` has no TTL.
export async function submitCloudCommand(
  deps: CloudCommandDeps,
  submit: CommandSubmit,
  now: () => Date,
): Promise<{ command: CommandRecord; changed: boolean }> {
  let { record: command, inserted } = await deps.commands.submit(submit);

  if (!inserted && command.outcome.state !== "pending") {
    if (!(await terminalReplayIsStale(deps, command, submit))) {
      return { command, changed: false };
    }
    // A restore reopen of a create refreshes the stored payload to the
    // client's current snapshot — see CommandRepository.reopen's docblock.
    const refreshedInput =
      submit.restore && command.input.kind === "create"
        ? submit.input
        : undefined;
    const reopened = await deps.commands.reopen(
      command.tenantId,
      command.principalId,
      command._id,
      command.outcome.state,
      refreshedInput,
    );
    // null means a concurrent submit already reopened (or re-terminated) this
    // command between our read and this write; that request owns execution.
    if (!reopened) return { command, changed: false };
    command = reopened;
  }

  // command.outcome.state is guaranteed "pending" here: freshly inserted,
  // already pending, or just reopened above — every other path returns early.
  const initialOutcomeState = command.outcome.state;
  const finish = (
    final: CommandRecord,
  ): { command: CommandRecord; changed: boolean } => ({
    command: final,
    changed: inserted || final.outcome.state !== initialOutcomeState,
  });

  // update/delete/rsvp apply to an existing event; move is not handled yet.
  if (
    command.input.kind === "update" ||
    command.input.kind === "delete" ||
    command.input.kind === "rsvp"
  ) {
    return finish(await applyCloudMutation(deps, command, now));
  }
  // A "move" command has no executor anywhere (no local apply, no provider
  // dispatch, no worker picks up a pending one) - leaving it pending would
  // strand the write forever while the caller sees success (submitCommandOrThrow
  // only rejects failed/cancelled). Fail it explicitly instead, the same way an
  // unsupported provider capability fails, so the caller gets a real error
  // rather than a silent no-op. Remove this branch once move has a real
  // executor.
  if (command.input.kind === "move") {
    return finish(await failCloud(deps, command, "unsupportedCapability"));
  }
  if (command.input.kind !== "create") return finish(command);

  // A create whose target calendar is a connected provider calendar must go to
  // the provider, not be confirmed as a local cloud event. Execute it now when
  // provider work is enabled; otherwise refuse (stale-command sweep retries
  // once execution is active). A calendar id that resolves to no provider
  // calendar is a Compass cloud calendar, so it is applied locally.
  return finish(await applyCloudCreateOrProvider(deps, command, now));
}

// Re-run an already-submitted, still-nonterminal create/update/delete/rsvp
// command through the same routing the original request used (dedupe by
// idempotencyKey does not apply here — the command already exists). For the
// stale-command retry sweep: a transient provider failure mid-execute leaves
// the command exactly as it was (see provider-command.service.ts's per-kind
// executors), and nothing else ever revisits it, so this is the only thing
// that gives it another attempt.
//
// Guards against reapplying stale content: applyCloudMutation's update path
// merges the COMMAND's own (possibly minutes-old) title/description onto
// whatever is currently stored (mergeUpdateContent), with no check that this
// is still the latest intent for the event. If a later command already
// touched the same event — succeeded on its own retry, or is itself
// mid-flight — blindly reapplying this one would silently revert that later
// edit with no error surfaced anywhere. When a newer command exists, this
// command is superseded: fail it (versionConflict) instead of retrying, so
// it stops being retried without ever overwriting newer intent.
export async function retryCloudMutation(
  deps: CloudCommandDeps,
  command: CommandRecord,
  now: () => Date,
): Promise<CommandRecord> {
  const superseded = await deps.commands.hasNewerCommandForEvent(
    command.tenantId,
    command.principalId,
    command.eventId,
    command._id,
  );
  if (superseded) {
    return failCloud(deps, command, "versionConflict");
  }
  if (command.input.kind === "create") {
    return applyCloudCreateOrProvider(deps, command, now);
  }
  return applyCloudMutation(deps, command, now);
}

async function resolveProviderWriter(
  deps: CloudCommandDeps,
  calendar: ProviderCalendarRecord,
): Promise<ProviderEventWriter | null> {
  if (!deps.provider) return null;
  const connection = await deps.connections.findById(
    calendar.tenantId,
    calendar.principalId,
    calendar.connectionId,
  );
  if (!connection) return null;
  try {
    return deps.provider.resolveAdapters(connection.provider, connection)
      .writer;
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) return null;
    throw error;
  }
}

async function applyCloudCreateOrProvider(
  deps: CloudCommandDeps,
  command: CommandRecord,
  now: () => Date,
): Promise<CommandRecord> {
  if (command.input.kind !== "create") {
    throw new Error("applyCloudCreateOrProvider requires a create command");
  }
  const providerCalendar = await deps.calendars.findById(
    command.tenantId,
    command.principalId,
    command.input.calendarId as ProviderCalendarId,
  );
  if (providerCalendar) {
    if (deps.execution === "active" && deps.provider) {
      const writer = await resolveProviderWriter(deps, providerCalendar);
      if (!writer) throw new ProviderWriteUnavailableError();
      return executeProviderCreate(
        {
          commands: deps.commands,
          events: deps.events,
          occurrences: deps.occurrences,
          resources: deps.resources,
          connections: deps.connections,
          writer,
          custody: deps.provider.custody,
        },
        command,
        providerCalendar,
        now,
      );
    }
    throw new ProviderWriteUnavailableError();
  }
  return applyCloudCreate(deps, command, now);
}

async function applyCloudCreate(
  deps: CloudCommandDeps,
  command: CommandRecord,
  now: () => Date,
): Promise<CommandRecord> {
  if (command.input.kind !== "create") {
    throw new Error("applyCloudCreate requires a create command");
  }
  // Idempotent: a crash after the event write (or after put but before
  // occurrence projection) leaves the command pending with the event already
  // present. Always reproject before confirm so a retry never confirms a
  // create that is invisible to range/busy reads.
  let record = await deps.events.findById(
    command.tenantId,
    command.principalId,
    command.eventId,
  );
  if (!record) {
    record = buildCloudEventRecord(command, now());
    await deps.events.put(record);
  }
  await reprojectOccurrences(deps.occurrences, record, now);
  return confirmCloud(deps, command);
}

// Apply a cloud-only update, delete, or rsvp to an existing event. Only
// single, unlinked events are handled here: a provider-linked event needs the
// provider mutation path, and a recurring series needs scope handling — both
// land in later slices, so those commands are left pending. Delete is
// idempotent (an already-absent event confirms), so a retry after a crash
// converges.
async function applyCloudMutation(
  deps: CloudCommandDeps,
  command: CommandRecord,
  now: () => Date,
): Promise<CommandRecord> {
  const existing = await deps.events.findById(
    command.tenantId,
    command.principalId,
    command.eventId,
  );

  // rsvp: rewrite the caller's own attendee entry at the provider. Only a
  // provider-linked event has a real invitation to answer in v1 — a
  // cloud-only (unlinked/local) event's attendee list has no provider
  // counterpart and Compass sends no email — so anything else is refused
  // typed (unsupportedCapability), never left pending and never guessed at.
  if (command.input.kind === "rsvp") {
    // The target vanished since the browser last saw it — an honest
    // conflict, mirroring the update path below.
    if (!existing) return failCloud(deps, command, "versionConflict");
    if (existing.connectionId === null) {
      return failCloud(deps, command, "unsupportedCapability");
    }
    // A bare exception addressed directly by its own id: unreachable from
    // the browser (see the matching update/delete comments below), but not
    // a coherent state to strand pending either.
    if (
      existing.recurrence.kind !== "single" &&
      existing.recurrence.kind !== "seriesMaster"
    ) {
      return failCloud(deps, command, "permanentProviderError");
    }
    // An RSVP answers "this event" (scope "this") or the whole series
    // (scope "all"); "from here on" has no v1 semantics — the browser
    // cannot send it — so a command carrying it is refused typed rather
    // than silently widened to one of the real scopes.
    if (command.input.scope === "thisAndFollowing") {
      return failCloud(deps, command, "unsupportedCapability");
    }
    return dispatchProviderMutation(
      deps,
      command,
      existing,
      now,
      executeProviderRsvp,
    );
  }

  if (command.input.kind === "delete") {
    // Absence is the desired end state, so a delete of an already-gone (or
    // never-created) event is confirmed rather than left hanging.
    if (!existing) return confirmCloud(deps, command);
    // A series master. For a cloud series, scope "all" removes the whole
    // series, "this" cancels one occurrence, thisAndFollowing splits it. For a
    // provider series, scope "all" deletes the whole series at the provider;
    // "this"/"thisAndFollowing" resolve and cancel/truncate the one addressed
    // provider instance.
    if (existing.recurrence.kind === "seriesMaster") {
      if (existing.connectionId !== null) {
        if (command.input.scope === "all") {
          return dispatchProviderMutation(
            deps,
            command,
            existing,
            now,
            executeProviderDelete,
          );
        }
        if (command.input.scope === "this") {
          return dispatchProviderMutation(
            deps,
            command,
            existing,
            now,
            executeProviderOccurrenceDelete,
          );
        }
        return dispatchProviderMutation(
          deps,
          command,
          existing,
          now,
          executeProviderSeriesFollowingDelete,
        );
      }
      if (command.input.scope === "all") {
        return deleteCloudSeries(deps, command, existing);
      }
      if (command.input.scope === "this") {
        return deleteCloudOccurrence(deps, command, existing, now);
      }
      return deleteCloudSeriesFollowing(deps, command, existing, now);
    }
    // A bare exception target addressed directly by its own id: unreachable
    // from the browser (resolveCommandTarget always resolves an occurrence id
    // to its series' real id, never a bare exception's own _id — see
    // event-command.translation.ts), but a command HERE naming one is not a
    // coherent state to strand pending forever either.
    if (existing.recurrence.kind !== "single") {
      return failCloud(deps, command, "permanentProviderError");
    }
    // A provider-linked event goes to the provider delete path; a cloud event is
    // removed locally below. Content is removed only after the provider confirms.
    if (existing.connectionId !== null) {
      return dispatchProviderMutation(
        deps,
        command,
        existing,
        now,
        executeProviderDelete,
      );
    }
    // Clear the derived occurrences BEFORE removing the event. If this crashes
    // before the delete, a retry still finds the event and re-runs both steps;
    // deleting first would let a crash in between orphan the occurrence rows,
    // since the retry's `!existing` branch confirms without ever clearing them.
    await deps.occurrences.replaceForEvent(
      command.eventId,
      existing.generation,
      [],
    );
    await deps.events.deleteById(
      command.tenantId,
      command.principalId,
      command.eventId,
    );
    return confirmCloud(deps, command);
  }

  // Only update remains (applyCloudMutation is called for update/delete).
  if (command.input.kind !== "update") return command;

  // update: the target must exist. A concurrent delete removed it since the
  // browser last saw it — an honest conflict, not a silently stranded write.
  if (!existing) {
    return failCloud(deps, command, "versionConflict");
  }
  // A series master. For a cloud series, scope "all" edits the whole series,
  // "this" overrides one occurrence, thisAndFollowing splits at the target. For
  // a provider series, scope "all" edits the whole series at the provider;
  // "this"/"thisAndFollowing" resolve and patch/split the one addressed
  // provider instance.
  if (existing.recurrence.kind === "seriesMaster") {
    if (existing.connectionId !== null) {
      if (command.input.scope === "all") {
        return dispatchProviderMutation(
          deps,
          command,
          existing,
          now,
          executeProviderSeriesUpdate,
        );
      }
      if (command.input.scope === "this") {
        return dispatchProviderMutation(
          deps,
          command,
          existing,
          now,
          executeProviderOccurrenceUpdate,
        );
      }
      return dispatchProviderMutation(
        deps,
        command,
        existing,
        now,
        executeProviderSeriesFollowingUpdate,
      );
    }
    if (command.input.scope === "all") {
      return updateCloudSeries(deps, command, existing, now);
    }
    if (command.input.scope === "this") {
      return updateCloudOccurrence(deps, command, existing, now);
    }
    return updateCloudSeriesFollowing(deps, command, existing, now);
  }
  // A bare exception target addressed directly by its own id: see the
  // matching delete-side comment above — unreachable from the browser, but
  // not left pending forever if it somehow arrives.
  if (existing.recurrence.kind !== "single") {
    return failCloud(deps, command, "permanentProviderError");
  }

  // A provider-linked event goes to the provider when provider work is enabled;
  // otherwise the write is refused rather than stranded pending (same rationale
  // as the create path above: nothing re-dispatches a pending command).
  if (existing.connectionId !== null) {
    return dispatchProviderMutation(
      deps,
      command,
      existing,
      now,
      executeProviderUpdate,
    );
  }

  // Cloud single event: conditional replace (no upsert), so a concurrent delete
  // is not resurrected — a miss leaves the command pending.
  const updated = applyCloudUpdate(existing, command, now());
  const applied = await deps.events.replaceExisting(updated);
  if (!applied) return command;
  await reprojectOccurrences(deps.occurrences, updated, now);
  return confirmCloud(deps, command);
}

type ProviderMutationExecutor = (
  deps: ProviderDeleteDeps,
  command: CommandRecord,
  event: EventRecord,
  calendar: ProviderCalendarRecord,
  now: () => Date,
) => Promise<CommandRecord>;

// Provider-linked writes all share the same boundary: provider execution must
// be active, the owning calendar must resolve, and executors receive the same
// repository slice. Keeping it here makes every recurrence scope follow the
// same refusal semantics rather than carrying six subtly different copies.
async function dispatchProviderMutation(
  deps: CloudCommandDeps,
  command: CommandRecord,
  event: EventRecord,
  now: () => Date,
  execute: ProviderMutationExecutor,
): Promise<CommandRecord> {
  if (deps.execution !== "active" || !deps.provider) {
    throw new ProviderWriteUnavailableError();
  }
  const calendar = await deps.calendars.findById(
    command.tenantId,
    command.principalId,
    event.calendarId as ProviderCalendarId,
  );
  if (!calendar) throw new ProviderWriteUnavailableError();
  const writer = await resolveProviderWriter(deps, calendar);
  if (!writer) throw new ProviderWriteUnavailableError();
  return execute(
    {
      commands: deps.commands,
      events: deps.events,
      occurrences: deps.occurrences,
      resources: deps.resources,
      connections: deps.connections,
      writer,
      custody: deps.provider.custody,
      markers: deps.markers,
    },
    command,
    event,
    calendar,
    now,
  );
}

// Apply a scope-"all" edit to a cloud series. An edit-all discards per-instance
// content/time OVERRIDES (they revert to the edited series), but a cancelled
// exception is a per-instance DELETION and must survive — those are kept and
// their instants excluded from the reprojected master, so a deleted occurrence
// is not resurrected by a later series edit. Converting the series to a single
// event drops every exception, cancellations included, since a single event has
// no instances.
//
// Exceptions are cleared BEFORE the master is replaced, on purpose. An edit-all
// can convert the series to a single event; if the replace ran first, a crash
// before the cleanup would make the retry read a single-kind event and take the
// single-event path, which never cleans exceptions — orphaning them. Clearing
// first means the discarded ones are gone before the master's recurrence kind
// can change, so a retry converges down either path. Gating the kept/discarded
// split on the command's immutable recurrence intent keeps that classification
// stable across retries. replaceExisting returns false only when the master is
// already gone, in which case discarding its overrides was still right.
async function updateCloudSeries(
  deps: CloudCommandDeps,
  command: CommandRecord,
  master: EventRecord,
  now: () => Date,
): Promise<CommandRecord> {
  const convertsToSingle =
    command.input.kind === "update" &&
    command.input.recurrence.kind === "single";
  const exceptions = await deps.events.findSeriesExceptions(
    command.tenantId,
    command.principalId,
    master._id,
  );
  const kept = convertsToSingle ? [] : exceptions.filter(isCancelledException);
  const discarded = convertsToSingle
    ? exceptions
    : exceptions.filter((exception) => !isCancelledException(exception));

  await deleteExceptions(deps, command, discarded);
  const updated = applyCloudUpdate(master, command, now());
  const applied = await deps.events.replaceExisting(updated);
  if (!applied) return command;
  await reprojectOccurrences(
    deps.occurrences,
    updated,
    now,
    kept.map(exceptionInstant),
  );
  return confirmCloud(deps, command);
}

// Delete a whole cloud series: clear the master's occurrences, remove every
// exception (occurrences first), then remove the master LAST. Deleting the
// master last keeps the delete branch's `!existing` short-circuit a valid
// "already fully deleted" signal — if the master is gone on a retry, its
// exceptions were removed before it. Every step is idempotent.
async function deleteCloudSeries(
  deps: CloudCommandDeps,
  command: CommandRecord,
  master: EventRecord,
): Promise<CommandRecord> {
  await deps.occurrences.replaceForEvent(master._id, master.generation, []);
  const exceptions = await deps.events.findSeriesExceptions(
    command.tenantId,
    command.principalId,
    master._id,
  );
  await deleteExceptions(deps, command, exceptions);
  await deps.events.deleteById(
    command.tenantId,
    command.principalId,
    master._id,
  );
  return confirmCloud(deps, command);
}

// deleteExceptions / isCancelledException / exceptionInstant now live in
// series-exception.ts, shared with the provider-linked executors below.

// Cancel one occurrence of a cloud series (scope "this"): upsert a cancelled
// exception tombstone at the target instant, reproject the master to exclude
// that instant, then project the tombstone's own (cancelled) row. The exception
// upsert is keyed on (series, recurrenceId), so a retry lands on the same
// tombstone instead of duplicating it.
async function deleteCloudOccurrence(
  deps: CloudCommandDeps,
  command: CommandRecord,
  master: EventRecord,
  now: () => Date,
): Promise<CommandRecord> {
  // The contract guarantees a this-scope delete carries a recurrenceId.
  if (command.input.kind !== "delete" || command.input.recurrenceId === null) {
    return command;
  }
  const recurrenceId = command.input.recurrenceId;
  const exception = await deps.events.upsertException(
    master,
    recurrenceId,
    {
      content: master.content,
      schedule: occurrenceScheduleAt(master.schedule, recurrenceId),
      cancelled: true,
    },
    now(),
  );
  await reprojectMaster(deps, command, master, now);
  await reprojectOccurrences(deps.occurrences, exception, now);
  return confirmCloud(deps, command);
}

// Override one occurrence of a cloud series (scope "this"): upsert an exception
// carrying the edit at the target instant, reproject the master to exclude that
// instant, then project the exception's own occurrence. Idempotent on the same
// (series, recurrenceId) key.
async function updateCloudOccurrence(
  deps: CloudCommandDeps,
  command: CommandRecord,
  master: EventRecord,
  now: () => Date,
): Promise<CommandRecord> {
  if (command.input.kind !== "update" || command.input.recurrenceId === null) {
    return command;
  }
  // Guest-list editing is whole-event/whole-series only in v1, matching the
  // provider executors: refuse a per-occurrence replace typed rather than
  // silently dropping the intent.
  if (command.input.attendeesEdit === "replace") {
    return failCloud(deps, command, "unsupportedCapability");
  }
  const exception = await deps.events.upsertException(
    master,
    command.input.recurrenceId,
    {
      content: mergeUpdateContent(master.content, command.input.content),
      schedule: command.input.schedule,
      cancelled: false,
    },
    now(),
  );
  await reprojectMaster(deps, command, master, now);
  await reprojectOccurrences(deps.occurrences, exception, now);
  return confirmCloud(deps, command);
}

// reprojectMaster now lives in series-exception.ts, shared with the
// provider-linked executors below.

// Delete one occurrence of a cloud series and every occurrence after it (scope
// "thisAndFollowing"): truncate the master's rule to end before the split point,
// drop the exceptions at or after it, and reproject the shortened master. A
// split at the series' first occurrence removes the whole series, so it collapses
// to delete-all. The master keeps its kind (still a series), so a retry re-enters
// here; truncation and the following-exception cleanup are both idempotent.
async function deleteCloudSeriesFollowing(
  deps: CloudCommandDeps,
  command: CommandRecord,
  master: EventRecord,
  now: () => Date,
): Promise<CommandRecord> {
  if (command.input.kind !== "delete" || command.input.recurrenceId === null) {
    return command;
  }
  if (master.recurrence.kind !== "seriesMaster") return command;
  const splitAt = new Date(command.input.recurrenceId);
  if (isFollowingSplitAtSeriesStart(master.schedule, splitAt)) {
    return deleteCloudSeries(deps, command, master);
  }

  await deleteFollowingExceptions(deps, command, master._id, splitAt);
  const truncated: EventRecord = {
    ...master,
    recurrence: {
      kind: "seriesMaster",
      rules: truncateRulesBefore(master.recurrence.rules, splitAt),
    },
    updatedAt: now(),
  };
  const applied = await deps.events.replaceExisting(truncated);
  if (!applied) return command;
  await reprojectMaster(deps, command, truncated, now);
  return confirmCloud(deps, command);
}

// deleteFollowingExceptions now lives in series-exception.ts, shared
// with the provider-linked executors below.

// Edit one occurrence of a cloud series and every occurrence after it (scope
// "thisAndFollowing") by SPLITTING the series: truncate the original master to
// end before the split, drop the exceptions at or after it, and stand up a new
// remainder master carrying the edit from the split point on. A split at the
// series' first occurrence edits the whole series, so it collapses to edit-all.
//
// The remainder master's id is derived deterministically from (originalMaster,
// split) so a retry upserts the SAME master instead of creating a second series.
// The original is truncated (and reprojected) before the remainder is created,
// so the worst transient state is a momentary gap at the split, never a
// duplicate; every step is idempotent, so a retry converges.
async function updateCloudSeriesFollowing(
  deps: CloudCommandDeps,
  command: CommandRecord,
  master: EventRecord,
  now: () => Date,
): Promise<CommandRecord> {
  if (command.input.kind !== "update" || command.input.recurrenceId === null) {
    return command;
  }
  if (master.recurrence.kind !== "seriesMaster") return command;
  const splitAt = new Date(command.input.recurrenceId);
  if (isFollowingSplitAtSeriesStart(master.schedule, splitAt)) {
    return updateCloudSeries(deps, command, master, now);
  }

  // Same v1 rule as the provider split path: a guest-list replace has no
  // defined semantics on a thisAndFollowing split, so refuse typed rather
  // than silently preserving.
  if (command.input.attendeesEdit === "replace") {
    return failCloud(deps, command, "unsupportedCapability");
  }

  await deleteFollowingExceptions(deps, command, master._id, splitAt);
  const truncated: EventRecord = {
    ...master,
    recurrence: {
      kind: "seriesMaster",
      rules: truncateRulesBefore(master.recurrence.rules, splitAt),
    },
    updatedAt: now(),
  };
  const applied = await deps.events.replaceExisting(truncated);
  if (!applied) return command;
  await reprojectMaster(deps, command, truncated, now);

  const remainder = buildRemainderMaster(master, command, now());
  await deps.events.put(remainder);
  await reprojectOccurrences(deps.occurrences, remainder, now);
  return confirmCloud(deps, command);
}

// Build the remainder series of a thisAndFollowing split: a fresh master at the
// edit's schedule, carrying the edited content and recurrence, with a
// deterministic id so a retry converges on one series. "preserve" continues the
// original cadence (bounds stripped, so it runs open-ended from the split).
function buildRemainderMaster(
  master: EventRecord,
  command: CommandRecord,
  now: Date,
): EventRecord {
  if (command.input.kind !== "update") {
    throw new Error("buildRemainderMaster requires an update command");
  }
  if (master.recurrence.kind !== "seriesMaster") {
    throw new Error("buildRemainderMaster requires a series master");
  }
  const { input } = command;
  const recurrence: SyncEventRecurrence =
    input.recurrence.kind === "series"
      ? { kind: "seriesMaster", rules: input.recurrence.rules }
      : input.recurrence.kind === "single"
        ? { kind: "single" }
        : {
            kind: "seriesMaster",
            rules: stripRuleBounds(master.recurrence.rules),
          };
  return {
    ...master,
    _id: remainderMasterId(master._id, command.input.recurrenceId as DateTime),
    clientEventId: null,
    content: mergeUpdateContent(master.content, input.content),
    schedule: input.schedule,
    recurrence,
    createdAt: now,
    updatedAt: now,
    confirmedAt: now,
  };
}

// remainderMasterId now lives in series-exception.ts, shared with the
// provider-linked split executors below.

// Confirm a cloud command with no provider identity — local persistence is the
// only durability it needs. updateOutcome only misses if the command vanished
// between submit and now (it cannot, within one request), so fall back to the
// pending record rather than inventing an outcome.
async function confirmCloud(
  deps: CloudCommandDeps,
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

async function failCloud(
  deps: CloudCommandDeps,
  command: CommandRecord,
  failureReason:
    | "unsupportedCapability"
    | "versionConflict"
    | "permanentProviderError",
): Promise<CommandRecord> {
  const failed = await deps.commands.updateOutcome(
    command.tenantId,
    command.principalId,
    command._id,
    { state: "failed", failureReason },
    command.attemptCount,
  );
  return failed ?? command;
}

// Apply an update command's content/schedule/recurrence to an existing cloud
// event, preserving its identity and provider fields. "preserve" keeps the
// current recurrence; "single"/"series" set it. Content merges so a
// title/description edit cannot wipe provider-sourced attendees/etc.
function applyCloudUpdate(
  existing: EventRecord,
  command: CommandRecord,
  now: Date,
): EventRecord {
  if (command.input.kind !== "update") {
    throw new Error("applyCloudUpdate requires an update command");
  }
  const { input } = command;
  const merged = mergeUpdateContent(existing.content, input.content);
  // A cloud-only event has no provider copy to fetch, so an attendeesEdit
  // "replace" merges the intended membership against the STORED list — the
  // closest "current" state — keeping any recorded status for retained
  // guests and entering new ones as needsAction. "preserve"/legacy commands
  // keep today's byte-identical merge (attendees untouched).
  const content =
    input.attendeesEdit === "replace"
      ? {
          ...merged,
          attendees: mergeAttendees(
            input.content.attendees,
            existing.content.attendees,
          ),
        }
      : merged;
  return {
    ...existing,
    content,
    schedule: input.schedule,
    recurrence:
      input.recurrence.kind === "preserve"
        ? existing.recurrence
        : input.recurrence.kind === "series"
          ? { kind: "seriesMaster", rules: input.recurrence.rules }
          : { kind: "single" },
    updatedAt: now,
  };
}

// Build the canonical event for a cloud-only create. All provider fields are
// null — this event has no provider target — and it is confirmed at creation
// because local persistence is the only durability it needs. The id is the
// client-supplied event id, so a retried create replaces rather than duplicates.
function buildCloudEventRecord(command: CommandRecord, now: Date): EventRecord {
  if (command.input.kind !== "create") {
    throw new Error("buildCloudEventRecord requires a create command");
  }
  const { input } = command;
  // A create with intended guests stores them normalized through the same
  // merge the provider path uses — against an empty list, since nothing
  // exists yet — so every guest enters as needsAction rather than trusting
  // the command's own responseStatus values.
  const content =
    input.attendeesEdit === "replace"
      ? {
          ...input.content,
          attendees: mergeAttendees(input.content.attendees, []),
        }
      : input.content;
  return {
    _id: command.eventId,
    tenantId: command.tenantId,
    principalId: command.principalId,
    origin: "compass",
    calendarId: input.calendarId,
    // Preserve the device-event identity when this create is a promotion of an
    // anonymous event; null for a plain cloud create.
    clientEventId: input.clientEventId,
    connectionId: null,
    providerEventId: null,
    providerVersion: null,
    providerUpdatedAt: null,
    deliveryState: null,
    providerMetadata: null,
    content: omitNullColor(content),
    schedule: input.schedule,
    recurrence: toStoredRecurrence(input.recurrence),
    lifecycleState: "active",
    // Always correct here: a cloud event lives on a calendar with no provider
    // sync resource, so nothing ever repairs it into a new generation and reads
    // serve generation 0 for it unconditionally. (The provider-linked create
    // path documents the one narrow, self-healing generation gap.)
    generation: 0,
    createdAt: now,
    updatedAt: now,
    confirmedAt: now,
  };
}

// The create wire input carries the editable recurrence (single | series); the
// stored form is the fuller union (single | seriesMaster | exception). A create
// can only ever produce a single event or a series master.
function toStoredRecurrence(
  recurrence: EditableRecurrence,
): SyncEventRecurrence {
  return recurrence.kind === "series"
    ? { kind: "seriesMaster", rules: recurrence.rules }
    : { kind: "single" };
}
