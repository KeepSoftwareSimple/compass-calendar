import { type EventSchedule } from "@core/types/event.contracts";
import { type SyncEventContent } from "@core/types/sync/event.contracts";
import { ProviderError } from "@sync/providers/provider-error";

// How one event read relates to a recurring series, in the PROVIDER's own id
// space. The provider's series id is resolved to a Compass event id later, at
// persistence — the normalizer cannot do it without a store lookup.
export type ProviderEventRecurrence =
  | { readonly kind: "single" }
  // A recurring master carrying the series' rules (e.g. RRULE strings).
  | { readonly kind: "seriesMaster"; readonly rules: readonly string[] }
  // One materialized occurrence (a modified/overridden instance). recurrenceId
  // is the occurrence's originally-scheduled start, the identity providers use
  // to address one instance of the series.
  | {
      readonly kind: "instance";
      readonly seriesProviderId: string;
      readonly recurrenceId: string;
    };

// An active event as the provider currently reports it, normalized to
// provider-neutral facts. content and schedule reuse the app-facing contracts,
// which are already provider-neutral; recurrence stays in provider-id space.
export interface ProviderEvent {
  readonly kind: "event";
  readonly providerEventId: string;
  // The provider's opaque version/concurrency token (Google's etag).
  readonly providerVersion: string;
  // The provider's own last-update time (ISO), or null if it reported none.
  readonly providerUpdatedAt: string | null;
  readonly content: SyncEventContent;
  readonly schedule: EventSchedule;
  // Whether the event marks its time as busy. Free/"transparent" events do not.
  readonly busy: boolean;
  // The provider's cross-copy correlation key (Google's iCalUID): copies of
  // the same meeting on different accounts share it, unlike providerEventId.
  // Absent when the provider reported none.
  readonly icalUid?: string;
  // The provider owns this event's details and schedule and refuses writes to
  // them; only presentation fields (color, attendees) may be written. Today
  // Google sets this for any eventType other than "default"; birthday's
  // slightly looser rules are ignored on purpose.
  readonly providerManaged?: true;
  // CalDAV resource href for resolving sync-collection deletions.
  readonly resourceHref?: string;
  readonly recurrence: ProviderEventRecurrence;
  /** Popup reminder offsets in minutes before start; empty when explicitly none. */
  readonly popupReminderMinutes?: readonly number[];
}

// A cancelled event or cancelled series occurrence. Providers report these with
// almost no data — no schedule or content survives — so a cancellation is a
// distinct read the caller turns into a deletion, never a content event.
export interface ProviderEventCancellation {
  readonly kind: "cancellation";
  readonly providerEventId: string;
  readonly providerVersion: string;
  // Set when the cancellation is for one occurrence of a series; null for a
  // standalone event's cancellation.
  readonly series: {
    readonly seriesProviderId: string;
    readonly recurrenceId: string;
  } | null;
}

// The result of normalizing one provider event read.
export type ProviderEventRead = ProviderEvent | ProviderEventCancellation;

// Why an event could not be normalized. The read is structurally unusable
// (e.g. a timed event with no start), not merely unusual.
export type ProviderEventErrorReason =
  | "missingIdentity" // the event carried no id/version to key it by
  | "unmappableSchedule" // start/end could not be resolved to a schedule
  | "unmappableContent"; // content failed the neutral contract (e.g. an
// out-of-bounds attendee/organizer field the provider does not cap)

export class ProviderEventError extends ProviderError<ProviderEventErrorReason> {}
