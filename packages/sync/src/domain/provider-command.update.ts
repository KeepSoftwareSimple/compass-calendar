import { type EventSchedule } from "@core/types/event.contracts";
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
  mergeUpdateContent,
  omitNullColor,
  resolveUpdateContent,
  resolveUpdateSchedule,
} from "@sync/domain/merge-update-content";
import { type ProviderMutationDeps } from "@sync/domain/provider-command.deps";
import {
  attendeesMatchIntent,
  deepEqual,
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
  stopCommand,
} from "@sync/domain/provider-command.internal";
import { runProviderWrite } from "@sync/domain/provider-write-ladder";
import { reprojectOccurrences } from "@sync/domain/reproject";
import { type ProviderEvent } from "@sync/providers/provider-event.port";
import { type ProviderWriteRecurrence } from "@sync/providers/provider-event-writer.port";
import { type CommandRecord } from "@sync/storage/contracts/command.contracts";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";

// Apply a Compass-initiated update to an existing provider-linked event.
//
// Replay safety is the hard part: a successful conditional patch changes the
// provider version, so a naive crash-then-retry would re-send the now-stale
// expected version and the provider would reject it as a conflict — misreporting
// an edit that actually landed. So we FETCH the provider's current state first:
// if it already carries this command's intended content, the edit landed on a
// prior attempt and we simply confirm at the current version (no second write).
// Otherwise we patch conditionally; the If-Match precondition turns a genuine
// concurrent external edit into a versionConflict. The content check only gates
// the replay shortcut, so a false miss falls through to the conditional patch
// (a spurious conflict at worst — never a lost external edit).
export async function executeProviderUpdate(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  event: EventRecord,
  calendar: ProviderCalendarRecord,
  now: () => Date,
): Promise<CommandRecord> {
  if (command.input.kind !== "update") {
    throw new Error("executeProviderUpdate requires an update command");
  }
  if (!event.connectionId || !event.providerEventId) {
    throw new Error("executeProviderUpdate requires a linked event");
  }
  const { input } = command;
  const providerEventId = event.providerEventId;
  const connectionId = event.connectionId;

  // A guest-list replace is only supported for the organizer; a non-organizer
  // replace fails typed before any provider call.
  if (input.attendeesEdit === "replace") {
    const guardFailure = await organizerGuardFailure(
      deps,
      command,
      event,
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

  // Fetch current provider state to detect a replay (our edit already landed)
  // and to learn the version to commit. A cancellation read means the event no
  // longer exists as a content event — there is nothing to update.
  const fetched = await resolveCurrentProviderEvent(
    deps,
    command,
    connectionId,
    () => deps.writer.fetchEvent(location),
  );
  if (!fetched.ok) return fetched.command;
  const { current } = fetched;

  // Merge so a title/description edit cannot wipe provider-sourced attendees.
  // Omitting content or schedule keeps the freshly fetched provider values so
  // a content-only booking patch cannot restore a host's concurrent move.
  let content = resolveUpdateContent(
    event.content,
    input.content,
    current.content,
  );
  const schedule = resolveUpdateSchedule(input.schedule, current.schedule);
  // A "replace" merges the intended membership against the FRESHLY FETCHED
  // provider list (current.content), never sync's stored record: the Google
  // patch replaces the whole attendees array, and merging against a stale
  // stored copy would clobber a concurrent RSVP made between syncs. The
  // merged list also lands on the local record at commit, so reads reflect
  // the edit before the next provider round-trip.
  const intendedAttendees =
    input.attendeesEdit === "replace" && input.content
      ? mergeAttendees(input.content.attendees, current.content.attendees)
      : undefined;
  if (intendedAttendees) {
    content = { ...content, attendees: intendedAttendees };
  }
  // Almost always "single" (event.recurrence.kind is single here, so
  // "preserve" resolves to single via intendedSeriesRecurrence's own
  // fallback) — except a single→series conversion, which writes real rules.
  const intendedRecurrence = intendedSeriesRecurrence(input.recurrence, event);

  if (current.providerManaged) {
    return executeProviderManagedUpdate(
      deps,
      command,
      event,
      current,
      content,
      input,
      intendedRecurrence,
      intendedAttendees,
      location,
      connectionId,
      now,
    );
  }

  // Replay: the provider already holds this edit, so confirm at its version
  // rather than writing again.
  if (
    matchesIntendedEdit(
      current,
      content,
      schedule,
      intendedRecurrence,
      intendedAttendees,
    )
  ) {
    return commitProviderUpdate(
      deps,
      command,
      event,
      content,
      current.providerVersion,
      now,
    );
  }

  const patchResult = await runProviderWrite(() =>
    deps.writer.patchEvent({
      ...location,
      expectedVersion: patchExpectedVersion(
        command,
        current,
        event,
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

  return commitProviderUpdate(
    deps,
    command,
    event,
    content,
    result.providerVersion,
    now,
  );
}

// Commit an updated provider event: write the new content/version to the
// canonical record (owner-scoped, non-upsert so a concurrent delete is not
// resurrected), then confirm. A miss means the local event vanished mid-flight,
// so leave the command pending to re-evaluate rather than confirm a gone event.
// recurrence is recomputed (not left as event.recurrence) so a single→series
// conversion actually persists its new rules locally, not just at the provider.
async function commitProviderUpdate(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  event: EventRecord,
  content: SyncEventContent,
  providerVersion: string,
  now: () => Date,
  commitOptions?: {
    schedule?: EventSchedule;
    customizations?: EventRecord["customizations"];
  },
): Promise<CommandRecord> {
  if (command.input.kind !== "update") {
    throw new Error("commitProviderUpdate requires an update command");
  }
  const { input } = command;
  const updated: EventRecord = {
    ...event,
    content,
    schedule: commitOptions?.schedule ?? input.schedule ?? event.schedule,
    recurrence: storedSeriesRecurrence(input.recurrence, event),
    providerVersion: providerVersion as ProviderEventVersion,
    providerUpdatedAt: null,
    deliveryState: "confirmed",
    updatedAt: now(),
  };
  if (commitOptions && "customizations" in commitOptions) {
    updated.customizations = commitOptions.customizations;
  }
  const applied = await deps.events.replaceExisting(updated);
  if (!applied) return command;
  await reprojectOccurrences(deps.occurrences, updated, now);

  return confirmCommand(
    deps,
    command,
    event.providerEventId as ProviderEventId,
    providerVersion,
  );
}

// Provider-managed events keep syncing from the provider; Compass overlays
// title, description, and location as customizations and writes only color and
// guest-list changes the provider accepts.
async function executeProviderManagedUpdate(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  event: EventRecord,
  current: ProviderEvent,
  mergedContent: SyncEventContent,
  input: Extract<CommandRecord["input"], { kind: "update" }>,
  intendedRecurrence: ProviderWriteRecurrence,
  intendedAttendees: readonly Attendee[] | undefined,
  location: {
    accessToken: string;
    calendarId: string;
    providerEventId: string;
  },
  connectionId: ConnectionId,
  now: () => Date,
): Promise<CommandRecord> {
  if (
    !deepEqual(
      resolveUpdateSchedule(input.schedule, current.schedule),
      current.schedule,
    ) ||
    intendedRecurrence.kind !== "single"
  ) {
    return failCommand(deps, command, "unsupportedCapability", connectionId);
  }

  const customizations = computeEventCustomizations(
    current.content,
    mergedContent,
  );
  const storedContent = managedStoredContent(
    current.content,
    mergedContent,
    intendedAttendees,
  );
  const commitOptions = {
    schedule: current.schedule,
    customizations,
  };

  if (
    matchesManagedIntendedEdit(
      current,
      event,
      mergedContent,
      customizations,
      intendedAttendees,
    )
  ) {
    return commitProviderUpdate(
      deps,
      command,
      event,
      storedContent,
      current.providerVersion,
      now,
      commitOptions,
    );
  }

  if (!managedProviderSideChange(current, mergedContent, intendedAttendees)) {
    return commitProviderUpdate(
      deps,
      command,
      event,
      storedContent,
      current.providerVersion,
      now,
      commitOptions,
    );
  }

  const patchResult = await runProviderWrite(() =>
    deps.writer.patchEvent({
      ...location,
      expectedVersion: patchExpectedVersion(
        command,
        current,
        event,
        intendedAttendees !== undefined,
      ),
      providerManaged: true,
      content: mergedContent,
      schedule: current.schedule,
      recurrence: { kind: "single" },
      invitation: input.invitation,
      ...(intendedAttendees ? { attendees: intendedAttendees } : {}),
    }),
  );
  if (!patchResult.ok) {
    return stopCommand(deps, command, patchResult.stop, connectionId);
  }

  return commitProviderUpdate(
    deps,
    command,
    event,
    storedContent,
    patchResult.value.providerVersion,
    now,
    commitOptions,
  );
}

function computeEventCustomizations(
  providerContent: SyncEventContent,
  intended: SyncEventContent,
): EventRecord["customizations"] {
  const customizations: {
    title?: string;
    description?: string;
    location?: string | null;
  } = {};
  if (intended.title !== providerContent.title) {
    customizations.title = intended.title;
  }
  if (intended.description !== providerContent.description) {
    customizations.description = intended.description;
  }
  if (intended.location !== providerContent.location) {
    customizations.location = intended.location;
  }
  return Object.keys(customizations).length === 0 ? null : customizations;
}

function managedStoredContent(
  providerContent: SyncEventContent,
  intended: SyncEventContent,
  intendedAttendees: readonly Attendee[] | undefined,
): SyncEventContent {
  let stored = omitNullColor(
    mergeUpdateContent(providerContent, {
      ...providerContent,
      color: intended.color,
    }),
  );
  if (intendedAttendees) {
    stored = { ...stored, attendees: intendedAttendees };
  }
  return stored;
}

function customizationsEqual(
  left: EventRecord["customizations"],
  right: EventRecord["customizations"],
): boolean {
  const normalize = (value: EventRecord["customizations"]) =>
    value === undefined || value === null ? null : value;
  return deepEqual(normalize(left), normalize(right));
}

function managedProviderSideChange(
  current: ProviderEvent,
  content: SyncEventContent,
  intendedAttendees: readonly Attendee[] | undefined,
): boolean {
  const intendedColor = content.color === null ? undefined : content.color;
  const currentColor =
    current.content.color === null ? undefined : current.content.color;
  if (intendedColor !== currentColor) return true;
  if (intendedAttendees === undefined) return false;
  return !attendeesMatchIntent(current.content.attendees, intendedAttendees);
}

function matchesManagedIntendedEdit(
  current: ProviderEvent,
  event: EventRecord,
  mergedContent: SyncEventContent,
  customizations: EventRecord["customizations"],
  intendedAttendees: readonly Attendee[] | undefined,
): boolean {
  if (!customizationsEqual(event.customizations, customizations)) return false;
  return !managedProviderSideChange(current, mergedContent, intendedAttendees);
}
