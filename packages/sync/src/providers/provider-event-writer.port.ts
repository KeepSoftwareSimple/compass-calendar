import { type EventSchedule } from "@core/types/event.contracts";
import {
  type Attendee,
  type Conference,
} from "@core/types/event-attendance.contracts";
import { type SyncEventContent } from "@core/types/sync/event.contracts";
import { ProviderError } from "@sync/providers/provider-error";
import { type ProviderEventRead } from "@sync/providers/provider-event.port";

// Whether the provider should notify attendees of a mutation.
export type InvitationIntent = "all" | "externalOnly" | "none";

// Recurrence to write: a standalone single event, one materialized occurrence
// override, or a series carrying its rules. "this and following" is not a
// primitive — the caller composes it from a series truncation plus a new
// create — so it is deliberately absent.
//
// "single" and "instance" both address a non-recurring provider event, but
// only "single" may clear an existing series (writing an explicit null
// `recurrence` key, which converts a series master to a standalone event).
// An "instance" addresses an occurrence Google already resolved off a series
// master (fetchInstanceAt); Google rejects a `recurrence` key on that kind of
// event at all, so the adapter must omit the key entirely rather than send
// null.
export type ProviderWriteRecurrence =
  | { readonly kind: "single" }
  | { readonly kind: "instance" }
  | { readonly kind: "series"; readonly rules: readonly string[] };

interface ProviderWriteBody {
  readonly content: SyncEventContent;
  readonly schedule: EventSchedule;
  readonly recurrence: ProviderWriteRecurrence;
  readonly invitation: InvitationIntent;
  // The guest membership this write sets, already merged by the caller
  // against freshly fetched provider state (see mergeAttendees). Present —
  // including an empty list — replaces the provider's whole attendee array;
  // absent leaves the provider's guest list untouched (the behavior every
  // attendeesEdit "preserve" / legacy command keeps). content.attendees is
  // read-reflected state and is never written; only this field reaches the
  // provider.
  readonly attendees?: readonly Attendee[];
  // Booking-only create flags. Omitted/false keeps legacy calendar creates
  // byte-identical on the provider insert path.
  readonly createConference?: boolean;
  readonly guestsCanInviteOthers?: boolean;
}

export interface ProviderCreateInput extends ProviderWriteBody {
  readonly accessToken: string;
  readonly calendarId: string;
  // Caller-supplied deterministic id — makes create idempotent across retries:
  // a replay hits the same id and the provider reports it already exists.
  readonly providerEventId: string;
}

export interface ProviderPatchInput extends ProviderWriteBody {
  readonly accessToken: string;
  readonly calendarId: string;
  readonly providerEventId: string;
  // When true, a slot colorId write must first clear a custom Google event
  // label (eventLabelVersion=1). Omit/false when the event has no label.
  readonly usesEventLabelColor?: true;
  // When true, the writer must send only the fields its provider accepts on
  // a provider-managed event (Google: color and attendees; others ignore).
  readonly providerManaged?: true;
  // When false, schedule must not be written (metadata-only edits).
  readonly writeSchedule?: boolean;
  // When true, send only per-user color fields (Google colorId / Outlook categories).
  readonly colorOnly?: true;
  // The version to condition the write on. Non-null sends an If-Match
  // precondition, so a stale caller loses to a concurrent change instead of
  // overwriting it. Null writes unconditionally (no known prior version).
  readonly expectedVersion: string | null;
}

export interface ProviderDeleteInput {
  readonly accessToken: string;
  readonly calendarId: string;
  readonly providerEventId: string;
  readonly expectedVersion: string | null;
  readonly invitation: InvitationIntent;
}

export interface ProviderFetchInput {
  readonly accessToken: string;
  readonly calendarId: string;
  readonly providerEventId: string;
}

export interface ProviderInstanceFetchInput {
  readonly accessToken: string;
  readonly calendarId: string;
  // The RECURRING master's provider id — an instance has no id of its own
  // until resolved by this call.
  readonly seriesProviderEventId: string;
  // The instance's original scheduled start (its recurrence identity) — the
  // same instant a this/thisAndFollowing scope's recurrenceId names. An
  // instance that was itself rescheduled keeps this original identity, so it
  // still resolves correctly even after being moved. Always full ISO datetime
  // form (Compass mints every recurrenceId via Date#toISOString(), timed or
  // all-day alike) — the adapter reshapes it to match how the provider itself
  // reports that instant, per `scheduleKind`.
  readonly originalStartAt: string;
  // The series master's schedule kind. Google reports an all-day instance's
  // original start as a bare date, not a dateTime — the adapter needs this to
  // send a matching lookup key, or the instance resolves to nothing.
  readonly scheduleKind: "timed" | "allDay";
}

export interface ProviderWriteResult {
  readonly providerEventId: string;
  readonly providerVersion: string;
  // CalDAV resource href for sync-collection deletion mapping and later writes.
  readonly resourceHref?: string;
  // Google's cross-copy correlation key when the write response includes it.
  // Optional so non-Google writers and older fixtures stay valid.
  readonly icalUid?: string;
  // Meet URL Google minted on create (or echoed on a later write). Omitted
  // when the response has none. Create records overlay this onto command
  // content, which sends `conference: null`.
  readonly conference?: Conference;
}

// A provider-neutral event mutation port. Neutral inputs in, provider identity
// out; Google request/response shapes never cross this boundary.
export interface ProviderEventWriter {
  // Create at a caller-chosen id. A replay that finds the id already present
  // returns the existing identity rather than failing, so retries are safe.
  createEvent(input: ProviderCreateInput): Promise<ProviderWriteResult>;

  // Merge-patch an existing event, optionally conditioned on its version.
  patchEvent(input: ProviderPatchInput): Promise<ProviderWriteResult>;

  // Delete an event, optionally conditioned on its version. Idempotent: a
  // delete of an already-absent event resolves rather than failing.
  deleteEvent(input: ProviderDeleteInput): Promise<void>;

  // Read one event back — the reconciliation step after an ambiguous create,
  // to learn whether the write actually landed. Null when no such event exists.
  fetchEvent(input: ProviderFetchInput): Promise<ProviderEventRead | null>;

  // Resolve one occurrence of a recurring series to its own addressable
  // provider event, by the instance's original scheduled start. A this/
  // thisAndFollowing scope operates on ONE instance, which (unlike a cloud
  // series exception) has no id of its own on the provider side until
  // resolved this way; the caller then patches/deletes/fetches it with the
  // returned identity exactly like any other provider event. Null when no
  // instance exists at that instant (already cancelled, or the recurrenceId
  // does not name a real occurrence of the series).
  fetchInstanceAt(
    input: ProviderInstanceFetchInput,
  ): Promise<ProviderEventRead | null>;
}

// Why a mutation could not be applied. The terminal reasons mirror the sync
// command failure classes so a caller maps them straight to an outcome;
// `transient` is a retryable network/provider failure that is not terminal.
export type ProviderWriteErrorReason =
  | "versionConflict" // precondition failed — the caller's version is stale
  | "readOnlyCalendar" // the target calendar cannot be written
  | "authorizationRevoked" // the credential is no longer valid
  | "transient" // network / 5xx / rate limit — safe to retry
  | "unsupportedCapability" // the provider declines this operation for this event
  | "providerRejectedChange" // a well-formed write the provider rejected (generic 400)
  | "permanentProviderError"; // an unrecoverable provider rejection

export class ProviderWriteError extends ProviderError<ProviderWriteErrorReason> {}
