import { type EventSchedule } from "@core/types/event.contracts";
import { type Attendee } from "@core/types/event-attendance.contracts";
import { type RecurrenceEdit } from "@core/types/event-command.contracts";
import {
  type SyncEventContent,
  type SyncEventRecurrence,
} from "@core/types/sync/event.contracts";
import { type ProviderEvent } from "@sync/providers/provider-event.port";
import { type ProviderWriteRecurrence } from "@sync/providers/provider-event-writer.port";
import { type CommandRecord } from "@sync/storage/contracts/command.contracts";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";

export function intendedSeriesRecurrence(
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
export function storedSeriesRecurrence(
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
export function matchesIntendedEdit(
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
export function patchExpectedVersion(
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
export function storedWriteRecurrence(
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
export function attendeesMatchIntent(
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
export function recurrenceMatches(
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

export function deepEqual(a: unknown, b: unknown): boolean {
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
