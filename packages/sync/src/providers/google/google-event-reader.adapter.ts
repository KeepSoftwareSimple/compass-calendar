import { calendar } from "@googleapis/calendar";
import { OAuth2Client } from "google-auth-library";
import { Logger } from "@core/logger/winston.logger";
import { type gCalendar, type gSchema$Event } from "@core/types/gcal";
import {
  GOOGLE_TRANSIENT_REASONS,
  googleErrorReasons,
  googleFailureCause,
  googleStatus,
} from "@sync/providers/google/google-error";
import { normalizeGoogleEvent } from "@sync/providers/google/google-event.normalizer";
import { GOOGLE_REQUEST_TIMEOUT_MS } from "@sync/providers/google/google-http.constants";
import { ProviderEventError } from "@sync/providers/provider-event.port";
import {
  type EventWindow,
  type ProviderEventPage,
  ProviderEventReadError,
  type ProviderEventReader,
  type ProviderEventReadInput,
} from "@sync/providers/provider-event-reader.port";

// One page of a Google events.list read, narrowed to the fields import needs.
// Google returns `nextSyncToken` only on the final page of a pass entitled to
// one; intermediate pages carry `nextPageToken` instead.
export interface GoogleEventListPage {
  readonly items: readonly gSchema$Event[];
  readonly nextPageToken: string | null;
  readonly nextSyncToken: string | null;
}

// The one Google call the reader makes. Depending on this narrow interface (not
// the concrete googleapis client) lets tests supply scripted pages without a
// network round-trip or module mocking.
export interface GoogleEventListApi {
  listPage(params: {
    calendarId: string;
    window?: EventWindow | null;
    syncToken?: string;
    pageToken?: string;
  }): Promise<GoogleEventListPage>;
}

// Built per-connection from a short-lived access token minted by credential
// custody; the token is set as the OAuth client's credential, never logged.
export type GoogleEventListApiFactory = (
  accessToken: string,
) => GoogleEventListApi;

const logger = Logger("sync:google-event-reader");

const defaultApiFactory: GoogleEventListApiFactory = (accessToken) => {
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: accessToken });
  const gcal: gCalendar = calendar({
    version: "v3",
    auth,
    timeout: GOOGLE_REQUEST_TIMEOUT_MS,
  });
  return {
    async listPage({ calendarId, window, syncToken, pageToken }) {
      const { data } = await gcal.events.list({
        calendarId,
        pageToken,
        syncToken,
        timeMin: window?.timeMin,
        timeMax: window?.timeMax,
        // Read masters and exceptions as distinct entities, not provider-
        // expanded instances — the canonical store keeps them separable and
        // projects occurrences itself.
        singleEvents: false,
        // Include cancellations so an incremental pass can carry deletions; an
        // initial import simply ignores them.
        showDeleted: true,
        // The largest page Google allows, to minimize round-trips on a large
        // calendar.
        maxResults: 2500,
      });
      return {
        items: data.items ?? [],
        nextPageToken: data.nextPageToken ?? null,
        nextSyncToken: data.nextSyncToken ?? null,
      };
    },
  };
};

// Google implementation of the event-read port. Reads one page of a calendar's
// events and normalizes each into a provider-neutral read, dropping (and
// counting) any that are structurally unusable rather than failing the page.
export class GoogleEventReaderAdapter implements ProviderEventReader {
  #makeApi: GoogleEventListApiFactory;

  #log: { warn: (message: string) => void };

  constructor(
    makeApi: GoogleEventListApiFactory = defaultApiFactory,
    log?: { warn: (message: string) => void },
  ) {
    this.#makeApi = makeApi;
    this.#log = log ?? logger;
  }

  async listEventPage(
    input: ProviderEventReadInput,
  ): Promise<ProviderEventPage> {
    const api = this.#makeApi(input.accessToken);
    const page = await this.#listPage(api, {
      calendarId: input.calendarId,
      window: input.window ?? null,
      syncToken: input.cursor ?? undefined,
      pageToken: input.pageToken ?? undefined,
    });

    const events = [];
    let skipped = 0;
    for (const item of page.items) {
      try {
        events.push(
          normalizeGoogleEvent(
            item,
            input.colorLabels,
            input.calendarDefaultPopupReminderMinutes ?? [],
          ),
        );
      } catch (error) {
        // A structurally unusable event (no id/etag, unmappable schedule) is
        // dropped so one bad row never fails the whole page or the import.
        if (error instanceof ProviderEventError) {
          skipped++;
          this.#log.warn(
            `Skipped unusable Google event ${item.id ?? "(no id)"} (${error.reason})`,
          );
          continue;
        }
        throw error;
      }
    }

    return {
      events,
      skipped,
      nextPageToken: page.nextPageToken,
      nextSyncToken: page.nextSyncToken,
    };
  }

  async #listPage(
    api: GoogleEventListApi,
    params: {
      calendarId: string;
      window: EventWindow | null;
      syncToken?: string;
      pageToken?: string;
    },
  ): Promise<GoogleEventListPage> {
    try {
      return await api.listPage(params);
    } catch (error) {
      throw new ProviderEventReadError(
        classifyReadError(error),
        "Google rejected the events list read",
        { cause: googleFailureCause(error) },
      );
    }
  }
}

// Map a Google events.list failure to a read-error reason. An expired syncToken
// (410 Gone) forces a full re-import. A 401 means the access token was rejected
// - it may have expired mid-job on a long-running import or repair, or the
// cached token may simply be stale - so the caller must invalidate the cached
// token and retry the same page with a fresh one in-process; otherwise every
// job retry replays the same rejected token, burns the retry ladder, and
// dead-letters the job (and logs a PostHog "Sync job engine failed" on each
// attempt). Also retryable: a rate limit or server/network error, or a
// quota-shaped 403. Anything else is an unrecoverable read failure.
function classifyReadError(
  error: unknown,
): "cursorExpired" | "authExpired" | "transient" | "readFailed" {
  const status = googleStatus(error);
  if (status === 410) return "cursorExpired";
  if (status === 401) return "authExpired";
  if (status === 429 || status === undefined || status >= 500) {
    return "transient";
  }
  // First reason only, as before the shared-triage refactor: a 403 whose
  // primary reason is durable stays durable even if a later errors[] entry
  // happens to be quota-shaped.
  if (
    status === 403 &&
    GOOGLE_TRANSIENT_REASONS.includes(googleErrorReasons(error)[0] ?? "")
  ) {
    return "transient";
  }
  return "readFailed";
}
