import { type DateTime, type EventId } from "@core/types/domain-primitives";
import {
  type EditableRecurrence,
  type EventSchedule,
} from "@core/types/event.contracts";
import { type Attendee } from "@core/types/event-attendance.contracts";
import { type RecurrenceEdit } from "@core/types/event-command.contracts";
import { type SyncCommandFailureReason } from "@core/types/sync/command.contracts";
import {
  type ProviderEventVersion,
  type SyncEventContent,
  type SyncEventRecurrence,
} from "@core/types/sync/event.contracts";
import {
  type ConnectionId,
  type PrincipalId,
  type ProviderEventId,
  type ProviderKind,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import {
  mergeAttendees,
  mergeUpdateContent,
  omitNullColor,
} from "@sync/domain/merge-update-content";
import {
  occurrenceScheduleAfterSeriesEdit,
  occurrenceScheduleAt,
  scheduleStartAt,
  truncateRulesBefore,
} from "@sync/domain/occurrence-projection";
import {
  type AccessTokenSource,
  resolveAccessToken,
  runProviderWrite,
} from "@sync/domain/provider-write-ladder";
import { reprojectOccurrences } from "@sync/domain/reproject";
import {
  buildRemainderMaster,
  deleteFollowingExceptions,
  exceptionInstant,
  partitionEditAllExceptions,
  reprojectMaster,
  truncatedSeriesMaster,
} from "@sync/domain/series-exception";
import { type ProviderEvent } from "@sync/providers/provider-event.port";
import {
  type ProviderEventWriter,
  type ProviderWriteRecurrence,
  type ProviderWriteResult,
} from "@sync/providers/provider-event-writer.port";
import { type CommandRecord } from "@sync/storage/contracts/command.contracts";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";
import { type CommandRepository } from "@sync/storage/repositories/command.repository";
import { type DeletionMarkerRepository } from "@sync/storage/repositories/deletion-marker.repository";
import { type EventRepository } from "@sync/storage/repositories/event.repository";
import { type EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { type SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

// The single connection fact the attendee organizer guard needs, narrowed
// from ProviderConnectionRepository so tests can fake it without a database.
export interface ProviderConnectionLookup {
  findById(
    tenantId: TenantId,
    principalId: PrincipalId,
    id: ConnectionId,
  ): Promise<{
    readonly account: { readonly email: string | null };
    readonly provider: ProviderKind;
  } | null>;
}

export interface ProviderMutationDeps {
  commands: CommandRepository;
  events: EventRepository;
  // The derived occurrence projection, rebuilt (or cleared, on delete) so a
  // provider-linked event appears in range queries.
  occurrences: EventOccurrenceRepository;
  // Reads serve a calendar's active generation, so a create has to ask which
  // generation that is rather than assume the calendar has never been repaired.
  resources: SyncResourceRepository;
  // Which account the write acts as — a guest-list replace is only valid on
  // an event that account organizes (see organizerGuardFailure).
  connections: ProviderConnectionLookup;
  writer: ProviderEventWriter;
  custody: AccessTokenSource;
}

// Delete also needs the deletion-marker store for the tombstone.
export interface ProviderDeleteDeps extends ProviderMutationDeps {
  markers: DeletionMarkerRepository;
}

// Execute a Compass-initiated create against the owning provider, then commit.
// The deterministic providerEventId (= the command's event id) makes the
// provider create idempotent: a replay finds the id already present and the
// adapter reads it back, so a retry after a crash converges without a separate
// reconciliation step. Provider identity is committed to the canonical event
// BEFORE the command is confirmed, so a crash between the two re-runs harmlessly
// and the command is never confirmed from a write we didn't record — the
// executor confirms only from a definitive provider result.
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

async function failCommand(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  reason: SyncCommandFailureReason,
  connectionId: ConnectionId,
): Promise<CommandRecord> {
  const failed = await deps.commands.updateOutcome(
    command.tenantId,
    command.principalId,
    command._id,
    { state: "failed", failureReason: reason },
    command.attemptCount,
  );
  if (reason === "authorizationRevoked") {
    await deps.custody.discardRevoked(connectionId);
  }
  return failed ?? command;
}

// Gate for a guest-list replace: only the organizer's copy of an event
// supports rewriting the attendee array, and v1 rejects non-organizer guest
// editing outright (`guestsCanModify` is a documented follow-up). The STORED
// organizer is compared case-insensitively against the connection's account
// email so a non-organizer replace fails typed (unsupportedCapability) BEFORE
// any provider call, fetch included. A null stored organizer passes — it
// means no organizer has ever been read back (e.g. a Compass-created event
// with no guests yet), so the connection's own account organizes it.
// Unverifiable states (missing connection row, or a connection without an
// account email while an organizer exists) fail closed with the same typed
// reason rather than guessing. Returns the failed command, or null when the
// replace may proceed.
async function organizerGuardFailure(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  event: EventRecord,
  connectionId: ConnectionId,
): Promise<CommandRecord | null> {
  const organizerEmail = event.content.organizer?.email;
  if (organizerEmail === undefined) return null;
  const connection = await deps.connections.findById(
    command.tenantId,
    command.principalId,
    connectionId,
  );
  const accountEmail = connection?.account.email;
  if (
    accountEmail != null &&
    accountEmail.toLowerCase() === organizerEmail.toLowerCase()
  ) {
    return null;
  }
  return failCommand(deps, command, "unsupportedCapability", connectionId);
}

// After a failed override-align patch, continue when the instance is already
// gone (matching deleteEvent's 404-OK). Return a command to stop on; null means
// local cleanup may proceed. The master write may already have landed, so a
// hard fail on a missing override would leave Google mutated and Compass not.
async function resolveFailedOverrideAlign(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  provider: {
    accessToken: string;
    calendarId: string;
    connectionId: ConnectionId;
  },
  providerEventId: string,
  reason: SyncCommandFailureReason,
): Promise<CommandRecord | null> {
  if (reason !== "permanentProviderError") {
    return failCommand(deps, command, reason, provider.connectionId);
  }
  const fetchResult = await runProviderWrite(() =>
    deps.writer.fetchEvent({
      accessToken: provider.accessToken,
      calendarId: provider.calendarId,
      providerEventId: providerEventId as ProviderEventId,
    }),
  );
  if (!fetchResult.ok) {
    if (fetchResult.stop.kind === "pending") return command;
    return failCommand(
      deps,
      command,
      fetchResult.stop.reason,
      provider.connectionId,
    );
  }
  if (fetchResult.value?.kind === "event") {
    return failCommand(deps, command, reason, provider.connectionId);
  }
  return null;
}

// Build the canonical event for a provider-linked create: same shape as a cloud
// event but with the provider identity the write returned. calendarId stays the
// Sync provider-calendar id (how the command addressed it); the raw provider
// calendar id is only used for the API call.
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

  // Fetch current provider state to detect a replay (our edit already landed)
  // and to learn the version to commit.
  // A cancellation read means the event no longer exists as a content event —
  // there is nothing to update.
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

  // Merge so a title/description edit cannot wipe provider-sourced attendees.
  let content = mergeUpdateContent(event.content, input.content);
  // A "replace" merges the intended membership against the FRESHLY FETCHED
  // provider list (current.content), never sync's stored record: the Google
  // patch replaces the whole attendees array, and merging against a stale
  // stored copy would clobber a concurrent RSVP made between syncs. The
  // merged list also lands on the local record at commit, so reads reflect
  // the edit before the next provider round-trip.
  const intendedAttendees =
    input.attendeesEdit === "replace"
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
      input.schedule,
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
      schedule: input.schedule,
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
    schedule: commitOptions?.schedule ?? input.schedule,
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
    !deepEqual(input.schedule, current.schedule) ||
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
    if (patchResult.stop.kind === "pending") return command;
    return failCommand(deps, command, patchResult.stop.reason, connectionId);
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

  let content = mergeUpdateContent(master.content, input.content);
  // Guest membership merges against the freshly fetched master, mirroring the
  // single-event path (see executeProviderUpdate).
  const intendedAttendees =
    input.attendeesEdit === "replace"
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
      input.schedule,
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
      schedule: input.schedule,
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
            input.schedule,
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
    schedule: input.schedule,
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

  const tokenResult = await resolveAccessToken(deps.custody, connectionId);
  if (!tokenResult.ok) {
    if (tokenResult.stop.kind === "pending") return command;
    return failCommand(deps, command, tokenResult.stop.reason, connectionId);
  }
  const { accessToken } = tokenResult;

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
    if (fetchInstanceResult.stop.kind === "pending") return command;
    return failCommand(
      deps,
      command,
      fetchInstanceResult.stop.reason,
      connectionId,
    );
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

  const content = mergeUpdateContent(master.content, input.content);
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
    matchesIntendedEdit(instance, content, input.schedule, {
      kind: "instance",
    })
  ) {
    return commitProviderOccurrenceUpdate(
      deps,
      command,
      master,
      recurrenceId,
      content,
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
      schedule: input.schedule,
      recurrence: { kind: "instance" },
      invitation: input.invitation,
    }),
  );
  if (!patchResult.ok) {
    if (patchResult.stop.kind === "pending") return command;
    return failCommand(deps, command, patchResult.stop.reason, connectionId);
  }
  const result = patchResult.value;

  return commitProviderOccurrenceUpdate(
    deps,
    command,
    master,
    recurrenceId,
    content,
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
      schedule: command.input.schedule,
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

  const tokenResult = await resolveAccessToken(deps.custody, connectionId);
  if (!tokenResult.ok) {
    if (tokenResult.stop.kind === "pending") return command;
    return failCommand(deps, command, tokenResult.stop.reason, connectionId);
  }
  const { accessToken } = tokenResult;

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
    if (fetchInstanceResult.stop.kind === "pending") return command;
    return failCommand(
      deps,
      command,
      fetchInstanceResult.stop.reason,
      connectionId,
    );
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
      if (deleteResult.stop.kind === "pending") return command;
      return failCommand(deps, command, deleteResult.stop.reason, connectionId);
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

  const tokenResult = await resolveAccessToken(deps.custody, connectionId);
  if (!tokenResult.ok) {
    if (tokenResult.stop.kind === "pending") return command;
    return failCommand(deps, command, tokenResult.stop.reason, connectionId);
  }
  const { accessToken } = tokenResult;

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
    if (fetchResult.stop.kind === "pending") return command;
    return failCommand(deps, command, fetchResult.stop.reason, connectionId);
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
    if (patchResult.stop.kind === "pending") return command;
    return failCommand(deps, command, patchResult.stop.reason, connectionId);
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

  const tokenResult = await resolveAccessToken(deps.custody, connectionId);
  if (!tokenResult.ok) {
    if (tokenResult.stop.kind === "pending") return command;
    return failCommand(deps, command, tokenResult.stop.reason, connectionId);
  }
  const { accessToken } = tokenResult;

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
    if (fetchResult.stop.kind === "pending") return command;
    return failCommand(deps, command, fetchResult.stop.reason, connectionId);
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
      if (truncateResult.stop.kind === "pending") return command;
      return failCommand(
        deps,
        command,
        truncateResult.stop.reason,
        connectionId,
      );
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
    if (createResultAttempt.stop.kind === "pending") return command;
    return failCommand(
      deps,
      command,
      createResultAttempt.stop.reason,
      connectionId,
    );
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

// ---------------------------------------------------------------------------
// RSVP.
//
// An RSVP is not a content edit: it rewrites exactly ONE attendee entry — the
// connection account's own, matched case-insensitively by email — and leaves
// every other entry byte-identical to the freshly fetched provider state.
// Because a Google patch replaces the WHOLE attendees array, the write sends
// the full merged list, and sendUpdates is always "none": answering an
// invitation must never email the guest list.
// ---------------------------------------------------------------------------

// The caller's own attendee entry, matched case-insensitively by the
// connection's account email. Alias emails not matching is a named wart.
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
function intendedSeriesRecurrence(
  recurrence: RecurrenceEdit,
  master: EventRecord,
): ProviderWriteRecurrence {
  if (recurrence.kind === "series") {
    return { kind: "series", rules: recurrence.rules };
  }
  if (recurrence.kind === "single") return { kind: "single" };
  return master.recurrence.kind === "seriesMaster"
    ? { kind: "series", rules: master.recurrence.rules }
    : { kind: "single" };
}

// The stored recurrence a series edit-all applies to the local master, mirroring
// intendedSeriesRecurrence in the canonical event's own union.
function storedSeriesRecurrence(
  recurrence: RecurrenceEdit,
  master: EventRecord,
): SyncEventRecurrence {
  if (recurrence.kind === "series") {
    return { kind: "seriesMaster", rules: recurrence.rules };
  }
  if (recurrence.kind === "single") return { kind: "single" };
  return master.recurrence;
}

// Whether the provider's current event already carries this command's intended
// edit — the signal that a prior attempt landed and this is a safe replay.
// Compares ONLY the fields a patch actually writes (title, description,
// location, color, schedule, recurrence — and the guest membership, but only
// when the command intends a guest-list replace). organizer/conference are
// read-reflected, never written by the provider adapter, so they drift
// independently — comparing them would turn a landed edit into a false miss,
// then a stale-version patch, then a spurious versionConflict on a write that
// already succeeded. Attendees are the same by default (an attendee RSVPs
// whenever they like), so they stay out of the comparison for every
// "preserve"/legacy command; a "replace" command DOES write them, so its
// replay check compares membership — as email sets, order-insensitive and
// responseStatus-ignored, because RSVP drift must never block replay (see
// attendeesMatchIntent). Recurrence IS written (a series edit-all changes the
// rules), so it must be compared: a rules-only edit leaves content and
// schedule identical, and without this a false replay would confirm the
// command without ever writing the new rules. A false negative on the
// compared fields is still safe: the replay check falls through to the
// conditional patch, and patchExpectedVersion keeps the submitter's version.
function matchesIntendedEdit(
  current: ProviderEvent,
  content: SyncEventContent,
  schedule: EventSchedule,
  recurrence: ProviderWriteRecurrence,
  intendedAttendees?: readonly Attendee[],
): boolean {
  // Null on the command means "no color"; treat it like an absent color on
  // the provider read so a clear that already landed counts as a replay.
  const intendedColor = content.color === null ? undefined : content.color;
  return (
    current.content.title === content.title &&
    current.content.description === content.description &&
    current.content.location === content.location &&
    current.content.color === intendedColor &&
    deepEqual(current.schedule, schedule) &&
    recurrenceMatches(current.recurrence, recurrence) &&
    attendeesMatchIntent(current.content.attendees, intendedAttendees)
  );
}

// The If-Match version for a conditional patch on a fetched provider event.
// The command's expectedVersion is the version its submitter last saw, so a
// patch conditioned on it refuses to overwrite an edit made elsewhere since.
// But a provider can rotate an event's version on its own (Exchange rewrites
// an item's change key seconds after a create; see #3208 and the
// live-provider-smoke), and until the next pull refreshes the stored version
// every conditional edit would fail as a spurious versionConflict. When the
// fetched event still carries exactly what Compass has stored for it (the
// written fields, per matchesIntendedEdit; guest membership only when this
// command replaces it), nobody edited it elsewhere, so the drift is the
// provider's own rotation and the patch conditions on the fresh version. Any
// difference keeps the submitter's version, so a genuine external edit still
// fails as versionConflict. An unconditional command (null) stays
// unconditional. Occurrence patches have no stored instance to compare
// against, so they keep the submitter's version as before.
function patchExpectedVersion(
  command: CommandRecord,
  current: ProviderEvent,
  stored: EventRecord,
  compareAttendees = false,
): string | null {
  if (command.expectedVersion === null) return null;
  const unchanged = matchesIntendedEdit(
    current,
    stored.content,
    stored.schedule,
    storedWriteRecurrence(stored.recurrence),
    compareAttendees ? stored.content.attendees : undefined,
  );
  return unchanged ? current.providerVersion : command.expectedVersion;
}

// The recurrence a patch would write for a stored record as it stands: a
// series master carries its rules, an exception addresses one instance, and
// anything else is a single event.
function storedWriteRecurrence(
  recurrence: EventRecord["recurrence"],
): ProviderWriteRecurrence {
  if (recurrence.kind === "seriesMaster") {
    return { kind: "series", rules: recurrence.rules };
  }
  if (recurrence.kind === "exception") return { kind: "instance" };
  return { kind: "single" };
}

// Membership comparison for the replay check, entered ONLY when the command
// intends a guest-list replace (undefined = attendees are not part of this
// write; always a match). Email sets, case-insensitive, order-insensitive,
// responseStatus-ignored: a guest RSVPing (or Google reordering the list)
// between a landed patch and its retry must still read as a replay — RSVP
// drift never blocks replay.
function attendeesMatchIntent(
  current: readonly Attendee[],
  intended: readonly Attendee[] | undefined,
): boolean {
  if (intended === undefined) return true;
  const currentEmails = new Set(
    current.map(({ email }) => email.toLowerCase()),
  );
  const intendedEmails = new Set(
    intended.map(({ email }) => email.toLowerCase()),
  );
  return (
    currentEmails.size === intendedEmails.size &&
    [...intendedEmails].every((email) => currentEmails.has(email))
  );
}

// Whether the provider's reported recurrence matches the recurrence a write
// would set. A single write expects a non-recurring event; a series write
// expects the same rules the provider now reports on its master.
//
// Rules are compared canonically, not byte-for-byte. A provider can echo a rule
// it stored in a reformatted-but-equivalent form (reordered components,
// different casing), so an exact compare would false-miss a landed edit — and
// because this gates a replay, that miss would re-patch with a now-stale
// expected version and fail a write that already succeeded, leaving the local
// event diverged from the provider. Canonicalizing absorbs that cosmetic drift;
// genuinely different rules still differ, so this never widens a real change
// into a false match. Named wart: an exotic reformatting the canonicalization
// misses (e.g. a provider injecting a non-default WKST we never sent) can still
// false-miss — acceptable because Compass emits simple rules and the only
// consequence is a spurious conflict in the narrow landed-then-retried window.
function recurrenceMatches(
  current: ProviderEvent["recurrence"],
  intended: ProviderWriteRecurrence,
): boolean {
  // "single" and "instance" both address a non-recurring event; only "series"
  // carries rules to compare, so anything else is a bare kind match.
  if (intended.kind !== "series") return current.kind === intended.kind;
  if (current.kind !== "seriesMaster") return false;
  if (current.rules.length !== intended.rules.length) return false;
  const currentCanonical = current.rules.map(canonicalRule).sort();
  const intendedCanonical = intended.rules.map(canonicalRule).sort();
  return currentCanonical.every(
    (rule, index) => rule === intendedCanonical[index],
  );
}

// A rule normalized for equality: uppercased, its optional RRULE: prefix
// dropped, and its ;-separated components sorted. This makes the comparison
// order- and case-insensitive without a full RRULE parse (which would drag in
// dtstart defaulting and reformatting of its own).
function canonicalRule(rule: string): string {
  return rule
    .trim()
    .toUpperCase()
    .replace(/^RRULE:/, "")
    .split(";")
    .filter((part) => part.length > 0)
    .sort()
    .join(";");
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) =>
    deepEqual(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
    ),
  );
}

// Delete a Compass-initiated provider event. The event is marked deletionPending
// (so it reads as "deleting" while the command is in flight or retrying) BEFORE
// the provider is asked, and its local content is removed only AFTER the
// provider confirms — never delete content before provider confirmation. The
// delete is unconditional: the user's intent to cancel does not hinge on a
// version, and a routine attendee RSVP must not block it. Idempotent: the
// adapter treats an already-absent event as deleted, and the marker + local
// delete are both idempotent, so a retry after a crash converges.
export async function executeProviderDelete(
  deps: ProviderDeleteDeps,
  command: CommandRecord,
  event: EventRecord,
  calendar: ProviderCalendarRecord,
  now: () => Date,
): Promise<CommandRecord> {
  if (command.input.kind !== "delete") {
    throw new Error("executeProviderDelete requires a delete command");
  }
  if (!event.connectionId || !event.providerEventId) {
    throw new Error("executeProviderDelete requires a linked event");
  }
  const { input } = command;
  const connectionId = event.connectionId;
  const providerEventId = event.providerEventId;

  // Mark the event as being deleted. If it is already gone locally, a prior
  // attempt removed it (the marker was written first) — the delete converged.
  // Still cascade any leftover series exceptions: older builds removed the
  // master without clearing overrides, and a crash between exception cleanup
  // and confirm can leave the same residue.
  const marked = await deps.events.replaceExisting({
    ...event,
    lifecycleState: "deletionPending",
    updatedAt: now(),
  });
  if (!marked) {
    await clearSeriesExceptions(deps, command, command.eventId);
    return confirmDeletion(deps, command);
  }

  const tokenResult = await resolveAccessToken(deps.custody, connectionId);
  if (!tokenResult.ok) {
    if (tokenResult.stop.kind === "pending") return command;
    return revertAndFail(
      deps,
      command,
      event,
      tokenResult.stop.reason,
      connectionId,
      now,
    );
  }
  const { accessToken } = tokenResult;

  // Transient: keep the event deletionPending (visibly deleting) and retry.
  // Terminal: the delete failed, so restore the event to active rather than
  // leaving it stuck showing "deleting".
  const deleteResult = await runProviderWrite(() =>
    deps.writer.deleteEvent({
      accessToken,
      calendarId: calendar.providerCalendarId,
      providerEventId,
      // Unconditional: a cancellation is not conditioned on the version, so an
      // unrelated external change never blocks it.
      expectedVersion: null,
      invitation: input.invitation,
    }),
  );
  if (!deleteResult.ok) {
    if (deleteResult.stop.kind === "pending") return command;
    return revertAndFail(
      deps,
      command,
      event,
      deleteResult.stop.reason,
      connectionId,
      now,
    );
  }

  // The provider confirmed the deletion. Write the content-free tombstone first
  // (so no window exists where the event is gone with no marker), clear the
  // master's occurrences, cascade local series exceptions (Google-side instance
  // overrides), then remove the master LAST — same crash-safety as the cloud
  // series delete / pull cascade. Clearing before deleteById matters: a crash
  // after deleteById would otherwise strand occurrence rows, since the retry's
  // already-gone (`!marked`) branch confirms without ever clearing them.
  await deps.markers.record({
    tenantId: event.tenantId,
    principalId: event.principalId,
    connectionId,
    calendarId: event.calendarId,
    providerEventId,
    providerVersion: event.providerVersion,
    deletionSource: "compass",
    deletedAt: now(),
  });
  await deps.occurrences.replaceForEvent(event._id, event.generation, []);
  await clearSeriesExceptions(deps, command, event._id);
  await deps.events.deleteById(event.tenantId, event.principalId, event._id);
  return confirmDeletion(deps, command);
}

// Remove every local exception of a series (occurrences first). Idempotent:
// findSeriesExceptions is empty when the target was a single event or when a
// prior attempt already cleared overrides. Does not call the provider — Google
// series delete already discarded the instances with the master.
async function clearSeriesExceptions(
  deps: ProviderDeleteDeps,
  command: CommandRecord,
  seriesId: EventId,
): Promise<void> {
  const exceptions = await deps.events.findSeriesExceptions(
    command.tenantId,
    command.principalId,
    seriesId,
  );
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

// Confirm a completed deletion: the event has no live provider target anymore,
// so the confirmed outcome carries no provider identity.
async function confirmDeletion(
  deps: ProviderMutationDeps,
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

// Restore a deletionPending event to active, then fail the command. A failed
// delete must not leave the event stuck reading as "deleting". The revert write
// is NOT wrapped in a catch: replaceExisting signals the benign "already gone"
// case with a resolved false (not a throw), so a throw here is a real error —
// letting it propagate keeps the command pending (not falsely failed) and
// retryable, rather than marking it terminally failed with a stuck event.
async function revertAndFail(
  deps: ProviderMutationDeps,
  command: CommandRecord,
  event: EventRecord,
  reason: SyncCommandFailureReason,
  connectionId: ConnectionId,
  now: () => Date,
): Promise<CommandRecord> {
  await deps.events.replaceExisting({
    ...event,
    lifecycleState: "active",
    updatedAt: now(),
  });
  return failCommand(deps, command, reason, connectionId);
}
