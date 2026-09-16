import { type EditableRecurrence } from "@core/types/event.contracts";
import { type Attendee } from "@core/types/event-attendance.contracts";
import { type ProviderEventVersion } from "@core/types/sync/event.contracts";
import { type ProviderEventId } from "@core/types/sync/identity.contracts";
import {
  mergeAttendees,
  omitNullColor,
} from "@sync/domain/merge-update-content";
import { type ProviderMutationDeps } from "@sync/domain/provider-command.deps";
import { failCommand } from "@sync/domain/provider-command.internal";
import {
  resolveAccessToken,
  runProviderWrite,
} from "@sync/domain/provider-write-ladder";
import { reprojectOccurrences } from "@sync/domain/reproject";
import {
  type ProviderWriteRecurrence,
  type ProviderWriteResult,
} from "@sync/providers/provider-event-writer.port";
import { type CommandRecord } from "@sync/storage/contracts/command.contracts";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";

export async function executeProviderCreate(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  calendar: ProviderCalendarRecord,
  now: () => Date,
): Promise<CommandRecord> {
  if (command.input.kind !== "create") {
    throw new Error("executeProviderCreate requires a create command");
  }
  const { input } = command;

  const tokenResult = await resolveAccessToken(
    deps.custody,
    calendar.connectionId,
  );
  if (!tokenResult.ok) {
    // A transient refresh failure is retryable, so leave the command pending; a
    // revoked or missing credential is terminal.
    if (tokenResult.stop.kind === "pending") return command;
    return failCommand(
      deps,
      command,
      tokenResult.stop.reason,
      calendar.connectionId,
    );
  }
  const { accessToken } = tokenResult;

  // A create with intended guests (attendeesEdit "replace") merges against an
  // EMPTY provider list — the event does not exist yet — so every intended
  // guest enters as needsAction. The organizer is not synthesized: Google
  // adds the creating account as an accepted organizer-attendee itself, so a
  // create body must never be compared to its readback.
  const intendedAttendees =
    input.attendeesEdit === "replace"
      ? mergeAttendees(input.content.attendees, [])
      : undefined;

  // Transient failures are safe to retry — the deterministic id keeps the
  // eventual retry idempotent. Every other reason is terminal and maps
  // straight to a command failure class.
  const writeResult = await runProviderWrite(() =>
    deps.writer.createEvent({
      accessToken,
      calendarId: calendar.providerCalendarId,
      providerEventId: command.eventId,
      content: input.content,
      schedule: input.schedule,
      recurrence: toProviderWriteRecurrence(input.recurrence),
      invitation: input.invitation,
      ...(intendedAttendees ? { attendees: intendedAttendees } : {}),
      ...(input.createConference ? { createConference: true } : {}),
      ...(input.guestsCanInviteOthers !== undefined
        ? { guestsCanInviteOthers: input.guestsCanInviteOthers }
        : {}),
    }),
  );
  if (!writeResult.ok) {
    if (writeResult.stop.kind === "pending") return command;
    return failCommand(
      deps,
      command,
      writeResult.stop.reason,
      calendar.connectionId,
    );
  }
  const result = writeResult.value;

  // Commit the provider identity to the canonical event and project its
  // occurrences, then confirm. Both run before confirmation, so a crash leaves
  // the command pending and a retry re-runs them idempotently.
  // Ask which generation reads will serve this calendar before projecting, so
  // a create onto a repaired calendar is visible immediately rather than
  // waiting for a pull to reproject it.
  const generations = await deps.resources.activeGenerationByCalendar(
    command.tenantId,
    command.principalId,
    [input.calendarId],
  );
  const record = buildLinkedEventRecord(
    command,
    calendar,
    result,
    now(),
    generations.get(input.calendarId) ?? 0,
    intendedAttendees,
  );
  await deps.events.put(record);
  await reprojectOccurrences(deps.occurrences, record, now);

  const confirmed = await deps.commands.updateOutcome(
    command.tenantId,
    command.principalId,
    command._id,
    {
      state: "confirmed",
      providerEventId: result.providerEventId as ProviderEventId,
      providerVersion: result.providerVersion as ProviderEventVersion,
    },
    command.attemptCount,
  );
  return confirmed ?? command;
}

function buildLinkedEventRecord(
  command: CommandRecord,
  calendar: ProviderCalendarRecord,
  result: ProviderWriteResult,
  now: Date,
  generation: number,
  // The guest list the create actually wrote (merged, all needsAction), so
  // the stored record reflects it before the next Google round-trip; absent
  // for "preserve"/legacy creates, which store the command content verbatim.
  intendedAttendees?: readonly Attendee[],
): EventRecord {
  if (command.input.kind !== "create") {
    throw new Error("buildLinkedEventRecord requires a create command");
  }
  const { input } = command;
  const withAttendees = intendedAttendees
    ? { ...input.content, attendees: intendedAttendees }
    : input.content;
  const content = result.conference
    ? { ...withAttendees, conference: result.conference }
    : withAttendees;
  return {
    _id: command.eventId,
    tenantId: command.tenantId,
    principalId: command.principalId,
    origin: "compass",
    calendarId: input.calendarId,
    clientEventId: input.clientEventId,
    connectionId: calendar.connectionId,
    providerEventId: result.providerEventId as ProviderEventId,
    providerVersion: result.providerVersion as ProviderEventVersion,
    // The write result carries no provider update time; a later read sets it.
    providerUpdatedAt: null,
    deliveryState: "confirmed",
    providerMetadata: result.icalUid ? { iCalUID: result.icalUid } : null,
    content: omitNullColor(content),
    schedule: input.schedule,
    recurrence:
      input.recurrence.kind === "series"
        ? { kind: "seriesMaster", rules: input.recurrence.rules }
        : { kind: "single" },
    lifecycleState: "active",
    // The calendar's active generation, resolved by the caller — NOT a
    // hardcoded 0. Reads serve the active generation, so on a calendar a
    // repair has already advanced, generation-0 occurrences are invisible.
    // That gap used to be left to "the next incremental pull will reproject
    // it", which holds only while pulls are running: when the sweeps froze on
    // 2026-07-31 the window stayed open for a day and users watched their new
    // events save successfully to Google and then vanish from Compass.
    generation,
    createdAt: now,
    updatedAt: now,
    confirmedAt: now,
  };
}

// The provider write port takes the same single|series shape the editable
// recurrence already carries (unlike the stored form, which renames series to
// seriesMaster), so this is a near-identity mapping kept explicit for clarity.
function toProviderWriteRecurrence(
  recurrence: EditableRecurrence,
): ProviderWriteRecurrence {
  return recurrence.kind === "series"
    ? { kind: "series", rules: recurrence.rules }
    : { kind: "single" };
}

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
