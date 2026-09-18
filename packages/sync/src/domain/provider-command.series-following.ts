import { type DateTime } from "@core/types/domain-primitives";
import { type ProviderEventVersion } from "@core/types/sync/event.contracts";
import { type ProviderEventId } from "@core/types/sync/identity.contracts";
import {
  scheduleStartAt,
  truncateRulesBefore,
} from "@sync/domain/occurrence-projection";
import { executeProviderDelete } from "@sync/domain/provider-command.delete";
import {
  type ProviderDeleteDeps,
  type ProviderMutationDeps,
} from "@sync/domain/provider-command.deps";
import {
  matchesIntendedEdit,
  patchExpectedVersion,
} from "@sync/domain/provider-command.intent-match";
import {
  failCommand,
  resolveCommandAccessToken,
  stopCommand,
} from "@sync/domain/provider-command.internal";
import { executeProviderSeriesUpdate } from "@sync/domain/provider-command.series-update";
import { runProviderWrite } from "@sync/domain/provider-write-ladder";
import { reprojectOccurrences } from "@sync/domain/reproject";
import {
  buildRemainderMaster,
  deleteFollowingExceptions,
  reprojectMaster,
  truncatedSeriesMaster,
} from "@sync/domain/series-exception";
import { type ProviderWriteRecurrence } from "@sync/providers/provider-event-writer.port";
import { type CommandRecord } from "@sync/storage/contracts/command.contracts";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";

// Apply a Compass-initiated scope-"thisAndFollowing" delete to a
// provider-linked series: truncate the provider master's rules to end before
// the split (Google removes every instance from that point on), drop the
// local exceptions at/after it, and reproject. A split at the series' own
// first occurrence removes the whole series, so it collapses to the existing
// whole-series provider delete. Content/schedule are NOT part of this write —
// only recurrence changes — so the replay check and patch both hold the
// master's own content/schedule fixed.
export async function executeProviderSeriesFollowingDelete(
  deps: ProviderDeleteDeps,
  command: CommandRecord,
  master: EventRecord,
  calendar: ProviderCalendarRecord,
  now: () => Date,
): Promise<CommandRecord> {
  if (command.input.kind !== "delete" || command.input.recurrenceId === null) {
    throw new Error(
      "executeProviderSeriesFollowingDelete requires a thisAndFollowing-scope delete command",
    );
  }
  if (!master.connectionId || !master.providerEventId) {
    throw new Error(
      "executeProviderSeriesFollowingDelete requires a linked series master",
    );
  }
  if (master.recurrence.kind !== "seriesMaster") {
    throw new Error(
      "executeProviderSeriesFollowingDelete requires a series master",
    );
  }
  const { input } = command;
  const connectionId = master.connectionId;
  const providerEventId = master.providerEventId;
  const splitAt = new Date(input.recurrenceId as DateTime);

  if (splitAt.getTime() <= scheduleStartAt(master.schedule).getTime()) {
    return executeProviderDelete(deps, command, master, calendar, now);
  }

  const token = await resolveCommandAccessToken(deps, command, connectionId);
  if (!token.ok) return token.command;
  const { accessToken } = token;

  await deleteFollowingExceptions(deps, command, master._id, splitAt);
  const truncatedRules = truncateRulesBefore(master.recurrence.rules, splitAt);
  const location = {
    accessToken,
    calendarId: calendar.providerCalendarId,
    providerEventId,
  };

  const fetchResult = await runProviderWrite(() =>
    deps.writer.fetchEvent(location),
  );
  if (!fetchResult.ok) {
    return stopCommand(deps, command, fetchResult.stop, connectionId);
  }
  const current =
    fetchResult.value?.kind === "event" ? fetchResult.value : null;
  if (!current) {
    return failCommand(deps, command, "permanentProviderError", connectionId);
  }

  const truncateRecurrence: ProviderWriteRecurrence = {
    kind: "series",
    rules: truncatedRules,
  };
  if (
    matchesIntendedEdit(
      current,
      master.content,
      master.schedule,
      truncateRecurrence,
    )
  ) {
    return commitProviderSeriesFollowingDelete(
      deps,
      command,
      master,
      splitAt,
      current.providerVersion,
      now,
    );
  }

  const patchResult = await runProviderWrite(() =>
    deps.writer.patchEvent({
      ...location,
      expectedVersion: patchExpectedVersion(command, current, master),
      content: master.content,
      schedule: master.schedule,
      recurrence: truncateRecurrence,
      invitation: input.invitation,
    }),
  );
  if (!patchResult.ok) {
    return stopCommand(deps, command, patchResult.stop, connectionId);
  }
  const result = patchResult.value;

  return commitProviderSeriesFollowingDelete(
    deps,
    command,
    master,
    splitAt,
    result.providerVersion,
    now,
  );
}

async function commitProviderSeriesFollowingDelete(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  master: EventRecord,
  splitAt: Date,
  providerVersion: string,
  now: () => Date,
): Promise<CommandRecord> {
  const truncated: EventRecord = {
    ...truncatedSeriesMaster(master, splitAt, now()),
    providerVersion: providerVersion as ProviderEventVersion,
    providerUpdatedAt: null,
    deliveryState: "confirmed",
  };
  const applied = await deps.events.replaceExisting(truncated);
  if (!applied) return command;
  await reprojectMaster(deps, command, truncated, now);

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

// Apply a Compass-initiated scope-"thisAndFollowing" EDIT to a provider-linked
// series by SPLITTING it, mirroring updateCloudSeriesFollowing: truncate the
// original master's rules at the provider (same as the delete twin above),
// then CREATE a new remainder series at the provider carrying the edit, at a
// deterministic provider event id so a retry converges on one remainder
// instead of duplicating it. A split at the series' own first occurrence
// edits the whole series, so it collapses to the existing provider edit-all.
export async function executeProviderSeriesFollowingUpdate(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  master: EventRecord,
  calendar: ProviderCalendarRecord,
  now: () => Date,
): Promise<CommandRecord> {
  if (command.input.kind !== "update" || command.input.recurrenceId === null) {
    throw new Error(
      "executeProviderSeriesFollowingUpdate requires a thisAndFollowing-scope update command",
    );
  }
  if (!master.connectionId || !master.providerEventId) {
    throw new Error(
      "executeProviderSeriesFollowingUpdate requires a linked series master",
    );
  }
  if (master.recurrence.kind !== "seriesMaster") {
    throw new Error(
      "executeProviderSeriesFollowingUpdate requires a series master",
    );
  }
  const { input } = command;
  const connectionId = master.connectionId;
  const providerEventId = master.providerEventId;
  const splitAt = new Date(input.recurrenceId as DateTime);

  if (splitAt.getTime() <= scheduleStartAt(master.schedule).getTime()) {
    return executeProviderSeriesUpdate(deps, command, master, calendar, now);
  }

  // Same v1 rule as the occurrence path: a guest-list replace has no defined
  // semantics on a thisAndFollowing split (which guest list would the
  // truncated original keep?), so refuse typed rather than silently
  // preserving.
  if (input.attendeesEdit === "replace") {
    return failCommand(deps, command, "unsupportedCapability", connectionId);
  }

  const token = await resolveCommandAccessToken(deps, command, connectionId);
  if (!token.ok) return token.command;
  const { accessToken } = token;

  // Truncate the original master first — same ordering as the cloud path:
  // the worst transient state between this step and the remainder create
  // below is a momentary gap at the split, never a duplicate series.
  await deleteFollowingExceptions(deps, command, master._id, splitAt);
  const truncatedRules = truncateRulesBefore(master.recurrence.rules, splitAt);
  const originalLocation = {
    accessToken,
    calendarId: calendar.providerCalendarId,
    providerEventId,
  };

  const fetchResult = await runProviderWrite(() =>
    deps.writer.fetchEvent(originalLocation),
  );
  if (!fetchResult.ok) {
    return stopCommand(deps, command, fetchResult.stop, connectionId);
  }
  const current =
    fetchResult.value?.kind === "event" ? fetchResult.value : null;
  if (!current) {
    return failCommand(deps, command, "permanentProviderError", connectionId);
  }

  const truncateRecurrence: ProviderWriteRecurrence = {
    kind: "series",
    rules: truncatedRules,
  };
  let originalVersion: string;
  if (
    matchesIntendedEdit(
      current,
      master.content,
      master.schedule,
      truncateRecurrence,
    )
  ) {
    originalVersion = current.providerVersion;
  } else {
    const truncateResult = await runProviderWrite(() =>
      deps.writer.patchEvent({
        ...originalLocation,
        expectedVersion: patchExpectedVersion(command, current, master),
        content: master.content,
        schedule: master.schedule,
        recurrence: truncateRecurrence,
        invitation: input.invitation,
      }),
    );
    if (!truncateResult.ok) {
      return stopCommand(deps, command, truncateResult.stop, connectionId);
    }
    originalVersion = truncateResult.value.providerVersion;
  }

  const truncated: EventRecord = {
    ...truncatedSeriesMaster(master, splitAt, now()),
    providerVersion: originalVersion as ProviderEventVersion,
    providerUpdatedAt: null,
    deliveryState: "confirmed",
  };
  const appliedTruncate = await deps.events.replaceExisting(truncated);
  if (!appliedTruncate) return command;
  await reprojectMaster(deps, command, truncated, now);

  // Remainder comes from the original (pre-truncation) master. "preserve"
  // must not use intendedSeriesRecurrence, which would re-write the already
  // bounded rules the original just got truncated to.
  const remainderDraft = buildRemainderMaster(master, command, now());
  const remainderRecurrence: ProviderWriteRecurrence =
    remainderDraft.recurrence.kind === "seriesMaster"
      ? { kind: "series", rules: remainderDraft.recurrence.rules }
      : { kind: "single" };

  const createResultAttempt = await runProviderWrite(() =>
    deps.writer.createEvent({
      accessToken,
      calendarId: calendar.providerCalendarId,
      providerEventId: remainderDraft._id,
      content: remainderDraft.content,
      schedule: remainderDraft.schedule,
      recurrence: remainderRecurrence,
      invitation: input.invitation,
    }),
  );
  if (!createResultAttempt.ok) {
    return stopCommand(deps, command, createResultAttempt.stop, connectionId);
  }
  const createResult = createResultAttempt.value;

  const remainder: EventRecord = {
    ...remainderDraft,
    providerEventId: createResult.providerEventId as ProviderEventId,
    providerVersion: createResult.providerVersion as ProviderEventVersion,
    providerUpdatedAt: null,
    deliveryState: "confirmed",
  };
  await deps.events.put(remainder);
  await reprojectOccurrences(deps.occurrences, remainder, now);

  const confirmed = await deps.commands.updateOutcome(
    command.tenantId,
    command.principalId,
    command._id,
    {
      state: "confirmed",
      providerEventId: createResult.providerEventId as ProviderEventId,
      providerVersion: createResult.providerVersion as ProviderEventVersion,
    },
    command.attemptCount,
  );
  return confirmed ?? command;
}
