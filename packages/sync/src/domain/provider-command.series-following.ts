import { type ProviderEventVersion } from "@core/types/sync/event.contracts";
import {
  type ConnectionId,
  type ProviderEventId,
} from "@core/types/sync/identity.contracts";
import {
  isFollowingSplitAtSeriesStart,
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
  confirmCommand,
  failCommand,
  requireLinkedSeriesAt,
  resolveCommandAccessToken,
  resolveCurrentProviderEvent,
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
import {
  type InvitationIntent,
  type ProviderWriteRecurrence,
} from "@sync/providers/provider-event-writer.port";
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
  const { input, recurrenceId, connectionId, providerEventId, seriesRules } =
    requireLinkedSeriesAt(
      "executeProviderSeriesFollowingDelete",
      "delete",
      "thisAndFollowing",
      command,
      master,
    );
  const splitAt = new Date(recurrenceId);

  if (isFollowingSplitAtSeriesStart(master.schedule, splitAt)) {
    return executeProviderDelete(deps, command, master, calendar, now);
  }

  const token = await resolveCommandAccessToken(deps, command, connectionId);
  if (!token.ok) return token.command;

  const split = await splitProviderSeriesAt(
    deps,
    command,
    master,
    {
      connectionId,
      accessToken: token.accessToken,
      calendarId: calendar.providerCalendarId,
      providerEventId,
      seriesRules,
      invitation: input.invitation,
    },
    splitAt,
    now,
  );
  if (!split.ok) return split.command;

  return confirmCommand(deps, command, providerEventId, split.providerVersion);
}

// Split a provider-linked series at `splitAt`: drop the local exceptions at
// or after the split, truncate the master's rules at the provider so it ends
// before it, then land the truncated master locally at the version the
// provider now holds. Content and schedule are NOT part of this write — only
// recurrence changes — so both the replay check and the patch hold the
// master's own content/schedule fixed.
//
// Shared by the thisAndFollowing delete and the thisAndFollowing edit, which
// split identically and then diverge: the delete stops here, the edit goes on
// to create the remainder series at the provider.
//
// A not-ok result carries the command to return unchanged: either a stopped
// provider write already settled it, or the master vanished mid-flight and it
// stays pending rather than confirming a gone series.
async function splitProviderSeriesAt(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  master: EventRecord,
  target: {
    connectionId: ConnectionId;
    accessToken: string;
    calendarId: string;
    providerEventId: string;
    // The master's current rules, already narrowed by the caller's
    // seriesMaster guard.
    seriesRules: readonly string[];
    invitation: InvitationIntent;
  },
  splitAt: Date,
  now: () => Date,
): Promise<
  { ok: true; providerVersion: string } | { ok: false; command: CommandRecord }
> {
  const { connectionId } = target;
  const location = {
    accessToken: target.accessToken,
    calendarId: target.calendarId,
    providerEventId: target.providerEventId,
  };
  await deleteFollowingExceptions(deps, command, master._id, splitAt);
  const truncateRecurrence: ProviderWriteRecurrence = {
    kind: "series",
    rules: truncateRulesBefore(target.seriesRules, splitAt),
  };

  const fetched = await resolveCurrentProviderEvent(
    deps,
    command,
    connectionId,
    () => deps.writer.fetchEvent(location),
  );
  if (!fetched.ok) return fetched;
  const { current } = fetched;

  // Replay: a prior attempt already truncated the provider master, so take
  // its current version rather than writing again.
  let providerVersion: string;
  if (
    matchesIntendedEdit(
      current,
      master.content,
      master.schedule,
      truncateRecurrence,
    )
  ) {
    providerVersion = current.providerVersion;
  } else {
    const patchResult = await runProviderWrite(() =>
      deps.writer.patchEvent({
        ...location,
        expectedVersion: patchExpectedVersion(command, current, master),
        content: master.content,
        schedule: master.schedule,
        recurrence: truncateRecurrence,
        invitation: target.invitation,
      }),
    );
    if (!patchResult.ok) {
      return {
        ok: false,
        command: await stopCommand(
          deps,
          command,
          patchResult.stop,
          connectionId,
        ),
      };
    }
    providerVersion = patchResult.value.providerVersion;
  }

  const truncated: EventRecord = {
    ...truncatedSeriesMaster(master, splitAt, now()),
    providerVersion: providerVersion as ProviderEventVersion,
    providerUpdatedAt: null,
    deliveryState: "confirmed",
  };
  if (!(await deps.events.replaceExisting(truncated))) {
    return { ok: false, command };
  }
  await reprojectMaster(deps, command, truncated, now);
  return { ok: true, providerVersion };
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
  const { input, recurrenceId, connectionId, providerEventId, seriesRules } =
    requireLinkedSeriesAt(
      "executeProviderSeriesFollowingUpdate",
      "update",
      "thisAndFollowing",
      command,
      master,
    );
  const splitAt = new Date(recurrenceId);

  if (isFollowingSplitAtSeriesStart(master.schedule, splitAt)) {
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
  const split = await splitProviderSeriesAt(
    deps,
    command,
    master,
    {
      connectionId,
      accessToken,
      calendarId: calendar.providerCalendarId,
      providerEventId,
      seriesRules,
      invitation: input.invitation,
    },
    splitAt,
    now,
  );
  if (!split.ok) return split.command;

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

  return confirmCommand(
    deps,
    command,
    createResult.providerEventId,
    createResult.providerVersion,
  );
}
