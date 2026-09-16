import { type DateTime } from "@core/types/domain-primitives";
import { type EventSchedule } from "@core/types/event.contracts";
import { type Attendee } from "@core/types/event-attendance.contracts";
import {
  type ProviderEventVersion,
  type SyncEventContent,
} from "@core/types/sync/event.contracts";
import { type ProviderEventId } from "@core/types/sync/identity.contracts";
import { type ProviderMutationDeps } from "@sync/domain/provider-command.deps";
import { failCommand } from "@sync/domain/provider-command.internal";
import {
  resolveAccessToken,
  runProviderWrite,
} from "@sync/domain/provider-write-ladder";
import { reprojectOccurrences } from "@sync/domain/reproject";
import { reprojectMaster } from "@sync/domain/series-exception";
import { type ProviderEvent } from "@sync/providers/provider-event.port";
import { type ProviderWriteRecurrence } from "@sync/providers/provider-event-writer.port";
import { type CommandRecord } from "@sync/storage/contracts/command.contracts";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";

function findSelfAttendee(
  attendees: readonly Attendee[],
  accountEmail: string,
): Attendee | undefined {
  const email = accountEmail.toLowerCase();
  return attendees.find((attendee) => attendee.email.toLowerCase() === email);
}

// Execute a Compass-initiated rsvp command against the owning provider.
//
// Targeting: scope "all" (and any single event) addresses the event itself —
// for a recurring series that is the SERIES MASTER, so the answer covers
// every occurrence. Scope "this" addresses ONE occurrence: the Google
// instance is resolved via the writer's fetchInstanceAt (the same
// occurrence-id decode update/delete use — an instance id is never
// hand-built here) and IT is patched, leaving the master and every sibling
// instance untouched.
//
// Replay safety: the freshly fetched self entry already holding the intended
// status means a prior attempt landed (or the user answered from another
// client) — confirm at the current provider version without a second write.
// The patch itself is UNCONDITIONAL (no If-Match): any other guest's
// concurrent RSVP bumps the provider version, and RSVP drift must never
// block an RSVP. The fetch→patch window this leaves open is the pack's
// named clobber-window wart, same as attendeesEdit "replace".
//
// Guards, all typed unsupportedCapability: an unverifiable connection
// (missing row / no account email) and a stored attendee list without the
// self entry both fail closed BEFORE any provider call; a fetched list
// without the self entry (removed provider-side since the last pull) fails
// after the fetch, without a write. There is deliberately NO organizer
// guard: the organizer RSVPing their own event is allowed — Google lists
// the organizer as an attendee of their own event.
export async function executeProviderRsvp(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  event: EventRecord,
  calendar: ProviderCalendarRecord,
  now: () => Date,
): Promise<CommandRecord> {
  if (command.input.kind !== "rsvp") {
    throw new Error("executeProviderRsvp requires an rsvp command");
  }
  if (!event.connectionId || !event.providerEventId) {
    throw new Error("executeProviderRsvp requires a linked event");
  }
  const { input } = command;
  const connectionId = event.connectionId;
  const seriesProviderEventId = event.providerEventId;

  const connection = await deps.connections.findById(
    command.tenantId,
    command.principalId,
    connectionId,
  );
  const accountEmail = connection?.account.email ?? null;
  if (accountEmail === null) {
    return failCommand(deps, command, "unsupportedCapability", connectionId);
  }
  if (!findSelfAttendee(event.content.attendees, accountEmail)) {
    return failCommand(deps, command, "unsupportedCapability", connectionId);
  }

  const tokenResult = await resolveAccessToken(deps.custody, connectionId);
  if (!tokenResult.ok) {
    if (tokenResult.stop.kind === "pending") return command;
    return failCommand(deps, command, tokenResult.stop.reason, connectionId);
  }
  const { accessToken } = tokenResult;

  const perOccurrence =
    input.scope === "this" &&
    input.recurrenceId !== null &&
    event.recurrence.kind === "seriesMaster";

  // Fetch the target's current provider state: the master (or single event)
  // itself, or the ONE resolved instance for a per-occurrence answer.
  const fetchResult = await runProviderWrite(() =>
    perOccurrence
      ? deps.writer.fetchInstanceAt({
          accessToken,
          calendarId: calendar.providerCalendarId,
          seriesProviderEventId,
          originalStartAt: input.recurrenceId as DateTime,
          scheduleKind: event.schedule.kind,
        })
      : deps.writer.fetchEvent({
          accessToken,
          calendarId: calendar.providerCalendarId,
          providerEventId: seriesProviderEventId,
        }),
  );
  if (!fetchResult.ok) {
    if (fetchResult.stop.kind === "pending") return command;
    return failCommand(deps, command, fetchResult.stop.reason, connectionId);
  }
  const current =
    fetchResult.value?.kind === "event" ? fetchResult.value : null;
  // Nothing live to answer: the event (or that one instance) no longer
  // exists as a content event at the provider.
  if (!current) {
    return failCommand(deps, command, "permanentProviderError", connectionId);
  }

  const selfIndex = current.content.attendees.findIndex(
    (attendee) => attendee.email.toLowerCase() === accountEmail.toLowerCase(),
  );
  // Removed from the guest list provider-side since the last pull: there is
  // no self entry to rewrite (same typed refusal as the stored-list guard,
  // just discovered one step later — after the fetch, before any write).
  if (selfIndex === -1) {
    return failCommand(deps, command, "unsupportedCapability", connectionId);
  }
  const currentSelf = current.content.attendees[selfIndex] as Attendee;
  const alreadyAnswered = currentSelf.responseStatus === input.responseStatus;

  const intendedAttendees = alreadyAnswered
    ? current.content.attendees
    : current.content.attendees.map((attendee, index) =>
        index === selfIndex
          ? { ...attendee, responseStatus: input.responseStatus }
          : attendee,
      );

  let providerVersion = current.providerVersion;
  if (!alreadyAnswered) {
    const patchResult = await runProviderWrite(() =>
      deps.writer.patchEvent({
        accessToken,
        calendarId: calendar.providerCalendarId,
        providerEventId: current.providerEventId,
        // Unconditional on purpose: another guest's concurrent RSVP bumps
        // the provider version, and RSVP drift must never block an RSVP.
        expectedVersion: null,
        content: rsvpEchoContent(current.content),
        schedule: current.schedule,
        recurrence: rsvpWriteRecurrence(current.recurrence),
        // Answering an invitation never emails anyone.
        invitation: "none",
        attendees: intendedAttendees,
      }),
    );
    if (!patchResult.ok) {
      if (patchResult.stop.kind === "pending") return command;
      return failCommand(deps, command, patchResult.stop.reason, connectionId);
    }
    providerVersion = patchResult.value.providerVersion;
  }

  if (perOccurrence) {
    return commitProviderOccurrenceRsvp(
      deps,
      command,
      event,
      input.recurrenceId as DateTime,
      { ...current.content, attendees: intendedAttendees },
      current.schedule,
      current.providerEventId,
      providerVersion,
      now,
    );
  }
  return commitProviderRsvp(
    deps,
    command,
    event,
    intendedAttendees,
    providerVersion,
    now,
  );
}

// The non-attendee body an rsvp patch sends. The write port requires a full
// body, so the freshly fetched provider state is echoed back — re-writing
// the provider's own current values is self-describing (mirroring how a
// "preserve" series edit re-writes the current rules) and the only field
// that actually changes is the self entry riding the separate `attendees`
// input. color/colorHex are STRIPPED rather than echoed: colorHex is
// read-only, and a slot color in the body would trigger the writer's
// label-clearing pre-patch (an extra provider round-trip that could clear a
// label Compass never meant to touch) — an omitted color leaves Google's
// color state entirely alone under patch merge-by-key semantics.
function rsvpEchoContent(content: SyncEventContent): SyncEventContent {
  const { color: _color, colorHex: _colorHex, ...rest } = content;
  return rest;
}

// The recurrence an rsvp patch re-writes, mapped from the fetched read: a
// series master re-writes its own current rules (harmless, self-describing);
// a resolved instance must OMIT the recurrence key entirely (Google rejects
// one on an instance — see ProviderWriteRecurrence); a single event stays
// single.
function rsvpWriteRecurrence(
  current: ProviderEvent["recurrence"],
): ProviderWriteRecurrence {
  if (current.kind === "seriesMaster") {
    return { kind: "series", rules: current.rules };
  }
  if (current.kind === "instance") return { kind: "instance" };
  return { kind: "single" };
}

// Commit a confirmed whole-event (or whole-series) rsvp locally: rewrite the
// stored record's attendee list — only that; pulls own every other field —
// bump the provider version, and reproject through reprojectMaster so a
// series' exception instants stay excluded (a cancelled occurrence must not
// be resurrected by an RSVP). A miss from replaceExisting means the event
// vanished mid-flight — leave the command pending rather than confirm
// against a gone event.
async function commitProviderRsvp(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  event: EventRecord,
  attendees: readonly Attendee[],
  providerVersion: string,
  now: () => Date,
): Promise<CommandRecord> {
  const updated: EventRecord = {
    ...event,
    content: { ...event.content, attendees },
    providerVersion: providerVersion as ProviderEventVersion,
    providerUpdatedAt: null,
    deliveryState: "confirmed",
    updatedAt: now(),
  };
  const applied = await deps.events.replaceExisting(updated);
  if (!applied) return command;
  await reprojectMaster(deps, command, updated, now);

  const confirmed = await deps.commands.updateOutcome(
    command.tenantId,
    command.principalId,
    command._id,
    {
      state: "confirmed",
      providerEventId: event.providerEventId as ProviderEventId,
      providerVersion: providerVersion as ProviderEventVersion,
    },
    command.attemptCount,
  );
  return confirmed ?? command;
}

// Commit a confirmed per-occurrence rsvp locally: upsert the exception
// carrying the INSTANCE's own provider identity and its fetched content with
// the rewritten self entry (what a pull of that instance would store),
// reproject the master to exclude that instant, then project the exception's
// own occurrence — the same local-commit shape a scope-"this" edit uses, so
// the next backend read reflects the answer before Google round-trips.
async function commitProviderOccurrenceRsvp(
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

// The provider recurrence a series edit-all writes. "series" sets new rules;
// "single" removes recurrence (converting the series to one event); "preserve"
// re-writes the master's current rules unchanged (harmless, keeps the write
// self-describing).
