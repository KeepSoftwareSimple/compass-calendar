import { ProviderError } from "@sync/providers/provider-error";
import { type ProviderEventRead } from "@sync/providers/provider-event.port";

// A half-open working window over an event's time, as RFC3339 timestamps. The
// first import pass windows to the user's current range so the useful part of a
// large calendar becomes available quickly; the full pass omits the window.
export interface EventWindow {
  readonly timeMin: string;
  readonly timeMax: string;
}

// One page of a calendar's events, normalized to provider-neutral reads.
// Cancellations are included (an incremental page reports deletions this way),
// so a caller that only wants live events filters them out. `skipped` counts
// raw events dropped as structurally unusable, for observability. A provider
// returns `nextSyncToken` only on the final page of a pass that is allowed to
// produce one (a windowed pass never is).
export interface ProviderEventPage {
  readonly events: readonly ProviderEventRead[];
  readonly skipped: number;
  readonly nextPageToken: string | null;
  readonly nextSyncToken: string | null;
}

export interface ProviderEventReadInput {
  readonly accessToken: string;
  readonly calendarId: string;
  // Bounds the fast first pass. Omit (or null) for the full pass that earns a
  // durable incremental cursor — providers forbid combining a window with a
  // cursor, and a windowed list cannot yield a sync token.
  readonly window?: EventWindow | null;
  // The stored incremental cursor (sync token). Applies only to the first
  // request of a pass; paging afterward is identified by pageToken alone.
  readonly cursor?: string | null;
  readonly pageToken?: string | null;
  // The owning calendar's custom event-color labels (id -> hex), for
  // providers that support them (e.g. Google's post-June-2026 event labels).
  // A provider with no such concept simply ignores this.
  readonly colorLabels?: ReadonlyMap<string, string>;
  /** Calendar default popup offsets for resolving `reminders.useDefault`. */
  readonly calendarDefaultPopupReminderMinutes?: readonly number[];
}

// A provider-neutral event read port. One call reads one page; the caller
// follows pagination and checkpoints between pages so a large import resumes
// where it left off. Reads masters and exceptions as distinct entities (never
// provider-expanded instances) so the canonical store keeps them separable.
export interface ProviderEventReader {
  listEventPage(input: ProviderEventReadInput): Promise<ProviderEventPage>;
}

// Why a page read could not complete. `cursorExpired` (the stored sync token is
// too old) is not retryable with the same token — the caller must re-import in
// full. `authExpired` is a rejected access token — retryable in-process after
// the caller invalidates the cached token and mints a fresh one. A second
// `authExpired` on that fresh token is treated as a dead grant. `transient` is
// a retryable network/provider failure; `readFailed` is an unrecoverable
// rejection. Distinct from ProviderEventError, which is a per-event
// normalization failure the reader absorbs into `skipped`.
export type ProviderEventReadErrorReason =
  | "cursorExpired"
  | "authExpired"
  | "transient"
  | "readFailed";

export class ProviderEventReadError extends ProviderError<ProviderEventReadErrorReason> {}
