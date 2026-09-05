import { calendar } from "@googleapis/calendar";
import { OAuth2Client } from "google-auth-library";
import {
  type gCalendar,
  type gSchema$Calendar,
  type gSchema$CalendarListEntry,
} from "@core/types/gcal";
import { type CalendarAccessRole } from "@core/types/sync/connection.contracts";
import { capabilitiesForAccessRole } from "@sync/providers/calendar-role-capabilities";
import {
  googleFailureCause,
  googleStatus,
  isGoogleTransient,
} from "@sync/providers/google/google-error";
import { GOOGLE_REQUEST_TIMEOUT_MS } from "@sync/providers/google/google-http.constants";
import {
  type CalendarDiscovery,
  type DiscoveredCalendar,
  type ProviderCalendarAdapter,
  ProviderCalendarError,
} from "@sync/providers/provider-calendar.port";

// One page of a Google calendar-list read, narrowed to the fields discovery
// needs. Google returns `nextSyncToken` only on the final page; intermediate
// pages carry `nextPageToken` instead.
export interface GoogleCalendarListPage {
  readonly items: readonly gSchema$CalendarListEntry[];
  readonly nextPageToken: string | null;
  readonly nextSyncToken: string | null;
}

// One calendar's custom event-color labels, narrowed to what color resolution
// needs. An entry with no id or hex is unusable for lookup and is dropped.
export interface GoogleEventLabel {
  readonly id: string;
  readonly hex: string;
}

// The Google calls discovery makes. Depending on this narrow interface (not
// the concrete googleapis client) lets tests supply scripted pages without a
// network round-trip or module mocking.
export interface GoogleCalendarListApi {
  listPage(params: {
    pageToken?: string;
    syncToken?: string;
  }): Promise<GoogleCalendarListPage>;
  // Only calendars.get (not calendarList.list) carries labelProperties, so
  // discovery makes one extra call per calendar to resolve it. Never throws:
  // a calendar whose label fetch fails is treated as having none, since a
  // color lookup gap should never fail discovery.
  getEventLabels(calendarId: string): Promise<readonly GoogleEventLabel[]>;
}

// Built per-connection from a short-lived access token minted by credential
// custody; the token is set as the OAuth client's credential, never logged.
export type GoogleCalendarListApiFactory = (
  accessToken: string,
) => GoogleCalendarListApi;

const defaultApiFactory: GoogleCalendarListApiFactory = (accessToken) => {
  const auth = new OAuth2Client();
  auth.setCredentials({ access_token: accessToken });
  const gcal: gCalendar = calendar({
    version: "v3",
    auth,
    timeout: GOOGLE_REQUEST_TIMEOUT_MS,
  });
  return {
    async listPage({ pageToken, syncToken }) {
      const { data } = await gcal.calendarList.list({
        pageToken,
        syncToken,
        // Default false on a full list, which would silently omit hidden and
        // deleted calendars rather than let us report them inactive. Opt in so
        // discovery sees the same set an incremental (syncToken) list forces.
        showHidden: true,
        showDeleted: true,
      });
      return {
        items: data.items ?? [],
        nextPageToken: data.nextPageToken ?? null,
        nextSyncToken: data.nextSyncToken ?? null,
      };
    },
    async getEventLabels(calendarId) {
      let data: gSchema$Calendar;
      try {
        ({ data } = await gcal.calendars.get({ calendarId }));
      } catch {
        // A label-fetch failure (permissions, transient error) should never
        // fail calendar discovery — the calendar just discovers with no
        // custom colors resolvable this pass.
        return [];
      }
      return (data.labelProperties?.eventLabels ?? [])
        .filter((label): label is { id: string; backgroundColor: string } =>
          Boolean(label.id && label.backgroundColor),
        )
        .map((label) => ({ id: label.id, hex: label.backgroundColor }));
    },
  };
};

// Google implementation of the calendar-discovery port. Maps Google's calendar
// list to provider-neutral facts and follows pagination, surfacing an expired
// incremental cursor distinctly so the caller can re-list in full.
export class GoogleCalendarAdapter implements ProviderCalendarAdapter {
  #makeApi: GoogleCalendarListApiFactory;

  constructor(makeApi: GoogleCalendarListApiFactory = defaultApiFactory) {
    this.#makeApi = makeApi;
  }

  async discoverCalendars(input: {
    accessToken: string;
    cursor?: string;
  }): Promise<CalendarDiscovery> {
    const api = this.#makeApi(input.accessToken);
    const calendars: DiscoveredCalendar[] = [];

    // The incremental cursor applies only to the first request of a list; once
    // paging begins Google identifies the sequence by pageToken alone.
    let syncToken = input.cursor;
    let pageToken: string | undefined;
    let nextCursor: string | null = null;

    do {
      const page = await this.#listPage(api, { pageToken, syncToken });
      // Label resolution is a per-calendar network call; run a page's calendars
      // concurrently rather than paying N sequential round-trips.
      const mapped = await Promise.all(
        page.items.map((item) => mapCalendar(item, api)),
      );
      for (const calendar of mapped) {
        if (calendar) calendars.push(calendar);
      }
      pageToken = page.nextPageToken ?? undefined;
      // Only the final page carries the token; keep the newest non-null one.
      nextCursor = page.nextSyncToken ?? nextCursor;
      syncToken = undefined;
    } while (pageToken);

    return { calendars, cursor: nextCursor };
  }

  async #listPage(
    api: GoogleCalendarListApi,
    params: { pageToken?: string; syncToken?: string },
  ): Promise<GoogleCalendarListPage> {
    try {
      return await api.listPage(params);
    } catch (error) {
      // An expired syncToken (410 Gone) is not retryable with the same token:
      // the caller must drop it and re-list in full. Transient failures stay
      // retryable; durable refusals (notACalendarUser, etc.) surface as
      // discoveryFailed so dispatch can drop instead of burning the ladder.
      throw new ProviderCalendarError(
        classifyDiscoveryError(error),
        "Google rejected the calendar list read",
        { cause: googleFailureCause(error) },
      );
    }
  }
}

// Google's per-calendar access role, collapsed onto the provider-neutral role.
// An unknown or absent role falls back to the least authority we can assume.
const ACCESS_ROLE_BY_GOOGLE: Record<string, CalendarAccessRole> = {
  owner: "owner",
  writer: "editor",
  reader: "viewer",
  freeBusyReader: "busyOnly",
};

// Map one Google calendar-list entry to provider-neutral facts. An entry
// without an id is unusable (it cannot be keyed or persisted), so it is dropped.
async function mapCalendar(
  item: gSchema$CalendarListEntry,
  api: GoogleCalendarListApi,
): Promise<DiscoveredCalendar | null> {
  if (!item.id) return null;

  const accessRole = mapAccessRole(item.accessRole);
  return {
    providerCalendarId: item.id,
    // summaryOverride is the user's rename; fall back to the shared summary,
    // then the id so the required non-empty name always holds.
    displayName: item.summaryOverride || item.summary || item.id,
    color: item.backgroundColor || null,
    eventLabels: await api.getEventLabels(item.id),
    primary: item.primary === true,
    // Deleted calendars are gone, and hidden ones are too: hiding a calendar
    // removes it (and its events) from the Calendar UI without clearing the
    // API's `selected` flag, so `selected` on a hidden calendar is a fossil
    // from before the hide, not a signal Google is still showing it.
    active: item.deleted !== true && item.hidden !== true,
    accessRole,
    capabilities: capabilitiesForAccessRole(accessRole),
    createsGoogleMeet: calendarCreatesGoogleMeet(
      item.conferenceProperties?.allowedConferenceSolutionTypes,
    ),
  };
}

// Missing types keep the current Meet promise. An advertised list that does
// not include hangoutsMeet cannot mint a Meet URL.
function calendarCreatesGoogleMeet(
  allowedTypes: readonly string[] | null | undefined,
): boolean {
  if (allowedTypes == null) return true;
  return allowedTypes.includes("hangoutsMeet");
}

function mapAccessRole(
  googleRole: string | null | undefined,
): CalendarAccessRole {
  return (googleRole && ACCESS_ROLE_BY_GOOGLE[googleRole]) || "busyOnly";
}

// Map a Google calendarList.list failure to a discovery-error reason. An
// expired syncToken (410 Gone) forces a full re-list. A 401 means the access
// token was rejected — remint in-process rather than treating it as a durable
// discoveryFailed (which would stamp lastReadFailureAt and ask the user to
// Refresh instead of Reconnect). Network / rate-limit / quota / server errors
// are retryable; other 4xx (notACalendarUser, etc.) are durable refusals.
function classifyDiscoveryError(
  error: unknown,
): "cursorExpired" | "authExpired" | "transient" | "discoveryFailed" {
  const status = googleStatus(error);
  if (status === 410) return "cursorExpired";
  if (status === 401) return "authExpired";
  if (isGoogleTransient(error, status)) return "transient";
  return "discoveryFailed";
}
