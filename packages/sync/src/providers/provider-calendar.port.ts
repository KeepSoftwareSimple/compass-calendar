import {
  type CalendarAccessRole,
  type SyncCalendarCapabilities,
} from "@core/types/sync/connection.contracts";
import { ProviderError } from "@sync/providers/provider-error";

// One calendar as the provider currently reports it, normalized to
// provider-neutral facts. These map directly onto a persisted provider-calendar
// record minus the Compass-owned ids; the discovery slice produces them, and a
// later slice reconciles them into storage.
export interface DiscoveredCalendar {
  // The provider's own id for the calendar (opaque, scoped to the connection).
  readonly providerCalendarId: string;
  readonly displayName: string;
  readonly color: string | null;
  // Custom event-color labels the calendar defines (id -> hex), for providers
  // that support per-event custom colors beyond a fixed palette (e.g. Google's
  // post-June-2026 event labels). Empty for a provider or calendar with none.
  readonly eventLabels: readonly {
    readonly id: string;
    readonly hex: string;
  }[];
  // The provider designates this as the account's default calendar.
  readonly primary: boolean;
  // The calendar is present in the provider's UI for the account. Deleted and
  // hidden-from-list calendars are both inactive.
  readonly active: boolean;
  readonly accessRole: CalendarAccessRole;
  readonly capabilities: SyncCalendarCapabilities;
  // Whether this calendar can mint a Google Meet URL. Missing conference
  // types from Google keep the current Meet promise (true). An advertised
  // list that omits hangoutsMeet is false.
  readonly createsGoogleMeet: boolean;
  /** Popup offsets from the provider calendar's default reminders. */
  readonly defaultPopupReminderMinutes: readonly number[];
}

// The result of one discovery pass: the full set of calendars the provider
// returned across every page, plus the opaque cursor to resume incrementally.
export interface CalendarDiscovery {
  readonly calendars: readonly DiscoveredCalendar[];
  // Opaque provider incremental cursor (Google's calendar-list nextSyncToken)
  // for the next discovery. Null when the provider returned none.
  readonly cursor: string | null;
}

// A provider-neutral calendar-discovery port. The domain lists an account's
// calendars without knowing the provider; pagination, capability derivation,
// and cursor handling stay inside the adapter.
export interface ProviderCalendarAdapter {
  // List every calendar the authorized account can see, following the
  // provider's pagination. Pass `cursor` to resume incrementally from a prior
  // pass; omit it for a full list. Rejects with a ProviderCalendarError.
  discoverCalendars(input: {
    readonly accessToken: string;
    readonly cursor?: string;
  }): Promise<CalendarDiscovery>;
}

// Why a discovery attempt could not complete. `cursorExpired` is distinct so the
// caller can drop the stale cursor and re-list in full instead of retrying with
// a token the provider will keep rejecting. `transient` is a retryable
// network/quota/server failure; `discoveryFailed` is a durable provider refusal
// (e.g. notACalendarUser) that dispatch must drop rather than burn the retry
// ladder on.
export type ProviderCalendarErrorReason =
  | "discoveryFailed" // durable: the provider rejected the calendar-list read
  | "transient" // retryable: network, rate limit, quota, or server error
  | "cursorExpired" // the incremental cursor is too old; a full re-list is required
  | "authExpired"; // 401: the access token was rejected; remint and retry once

export class ProviderCalendarError extends ProviderError<ProviderCalendarErrorReason> {}
