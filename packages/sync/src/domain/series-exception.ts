import { type DateTime, type EventId } from "@core/types/domain-primitives";
import { type SyncEventRecurrence } from "@core/types/sync/event.contracts";
import {
  resolveUpdateContent,
  resolveUpdateSchedule,
} from "@sync/domain/merge-update-content";
import {
  stripRuleBounds,
  truncateRulesBefore,
} from "@sync/domain/occurrence-projection";
import { reprojectOccurrences } from "@sync/domain/reproject";
import { type CommandRecord } from "@sync/storage/contracts/command.contracts";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type EventRepository } from "@sync/storage/repositories/event.repository";
import { type EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { createHash } from "node:crypto";

type SeriesMasterRecurrence = Extract<
  SyncEventRecurrence,
  { kind: "seriesMaster" }
>;

// Whether a series exception is a cancelled tombstone (a per-instance deletion)
// rather than a content override. Shared by the cloud and provider command
// paths — both need to tell "cancelled" exceptions apart from "overridden"
// ones when reprojecting a series.
export function isCancelledException(event: EventRecord): boolean {
  return event.recurrence.kind === "exception" && event.recurrence.cancelled;
}

// The original instant a series exception overrides — its recurrence identity.
export function exceptionInstant(event: EventRecord): DateTime {
  if (event.recurrence.kind !== "exception") {
    throw new Error("exceptionInstant requires an exception event");
  }
  return event.recurrence.recurrenceId;
}

// The subset of dependencies every helper below needs — narrow so both
// CloudCommandDeps and ProviderMutationDeps (structurally different: one has
// calendars/markers/execution/provider, the other has writer/custody)
// satisfy it without an adapter object.
export interface EventReprojectionDeps {
  events: EventRepository;
  occurrences: EventOccurrenceRepository;
}

// Reproject a series master excluding every instant one of its exceptions
// owns, so the master never projects an occurrence at an excepted instant.
// Fetches the exceptions fresh, so it picks up the one a scope-"this" edit
// just wrote.
export async function reprojectMaster(
  deps: EventReprojectionDeps,
  command: Pick<CommandRecord, "tenantId" | "principalId">,
  master: EventRecord,
  now: () => Date,
): Promise<void> {
  const exceptions = await deps.events.findSeriesExceptions(
    command.tenantId,
    command.principalId,
    master._id,
  );
  await reprojectOccurrences(
    deps.occurrences,
    master,
    now,
    exceptions.map(exceptionInstant),
  );
}

// Remove the given exception events and clear each one's occurrences.
export async function deleteExceptions(
  deps: EventReprojectionDeps,
  command: Pick<CommandRecord, "tenantId" | "principalId">,
  exceptions: readonly EventRecord[],
): Promise<void> {
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

// Delete every exception at or after the split instant and clear its
// occurrences — shared by a cloud and a provider-linked thisAndFollowing
// split, which both discard the same local exception rows.
export async function deleteFollowingExceptions(
  deps: EventReprojectionDeps,
  command: Pick<CommandRecord, "tenantId" | "principalId">,
  seriesId: EventRecord["_id"],
  splitAt: Date,
): Promise<void> {
  const exceptions = await deps.events.findSeriesExceptions(
    command.tenantId,
    command.principalId,
    seriesId,
  );
  const following = exceptions.filter(
    (exception) =>
      new Date(exceptionInstant(exception)).getTime() >= splitAt.getTime(),
  );
  await deleteExceptions(deps, command, following);
}

// A deterministic event id for the remainder series of a thisAndFollowing
// split, so the same split always resolves to the same master and a retry
// never duplicates it. A 24-hex prefix of a SHA-256 over (seriesId, split) is
// a valid Compass event id and collision-safe. Lowercase hex is a strict
// subset of Google's base32hex event-id charset, so a provider-linked split
// reuses this SAME id as the provider event id too — one deterministic
// identity, not two independently derived ones.
export function remainderMasterId(
  seriesId: EventId,
  splitAt: DateTime,
): EventId {
  return createHash("sha256")
    .update(`${seriesId}:${splitAt}`)
    .digest("hex")
    .slice(0, 24) as EventId;
}

// Split an edit-all's exceptions into kept cancelled tombstones versus
// discarded content/time overrides. Converting the series to a single event
// drops every exception, cancellations included.
export function partitionEditAllExceptions(
  exceptions: readonly EventRecord[],
  convertsToSingle: boolean,
): { kept: EventRecord[]; discarded: EventRecord[] } {
  if (convertsToSingle) {
    return { kept: [], discarded: [...exceptions] };
  }
  return {
    kept: exceptions.filter(isCancelledException),
    discarded: exceptions.filter((event) => !isCancelledException(event)),
  };
}

// Local truncated master for a this-and-following split: same identity,
// rules bounded strictly before the split instant. Callers overlay
// provider version fields after a write.
export function truncatedSeriesMaster(
  master: EventRecord,
  splitAt: Date,
  now: Date,
): EventRecord & { recurrence: SeriesMasterRecurrence } {
  if (master.recurrence.kind !== "seriesMaster") {
    throw new Error("truncatedSeriesMaster requires a series master");
  }
  return {
    ...master,
    recurrence: {
      kind: "seriesMaster",
      rules: truncateRulesBefore(master.recurrence.rules, splitAt),
    },
    updatedAt: now,
  };
}

// Remainder series of a this-and-following edit: a fresh master at the
// edit's schedule, carrying the edited content and recurrence, with a
// deterministic id so a retry converges on one series. "preserve" continues
// the original cadence (bounds stripped, so it runs open-ended from the split).
export function buildRemainderMaster(
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
    content: resolveUpdateContent(
      master.content,
      input.content,
      master.content,
    ),
    schedule: resolveUpdateSchedule(input.schedule, master.schedule),
    recurrence,
    createdAt: now,
    updatedAt: now,
    confirmedAt: now,
  };
}
