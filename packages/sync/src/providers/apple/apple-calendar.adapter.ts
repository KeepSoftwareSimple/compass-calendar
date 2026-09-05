import { type CalendarAccessRole } from "@core/types/sync/connection.contracts";
import {
  type CaldavClient,
  CaldavClientError,
  createCaldavClient,
  type DiscoveredCaldavCalendar,
  discoverCalendars as discoverCaldavCalendars,
} from "@sync/providers/apple/caldav-client";
import { capabilitiesForAccessRole } from "@sync/providers/calendar-role-capabilities";
import {
  type CalendarDiscovery,
  type DiscoveredCalendar,
  type ProviderCalendarAdapter,
  ProviderCalendarError,
} from "@sync/providers/provider-calendar.port";

export type AppleCalendarClientFactory = (
  username: string,
  password: string,
) => CaldavClient;

const defaultClientFactory: AppleCalendarClientFactory = (username, password) =>
  createCaldavClient({ username, password });

// Apple iCloud implementation of the calendar-discovery port. The access token
// custody hands in is the app-specific password; the account email is bound
// when the adapter is constructed for a connection.
export class AppleCalendarAdapter implements ProviderCalendarAdapter {
  #username: string;
  #makeClient: AppleCalendarClientFactory;

  constructor(
    username: string,
    makeClient: AppleCalendarClientFactory = defaultClientFactory,
  ) {
    this.#username = username;
    this.#makeClient = makeClient;
  }

  async discoverCalendars(input: {
    accessToken: string;
    cursor?: string;
  }): Promise<CalendarDiscovery> {
    const client = this.#makeClient(this.#username, input.accessToken);
    try {
      const discovered = await discoverCaldavCalendars(client, {
        username: this.#username,
        password: input.accessToken,
      });
      const calendars = mapDiscoveredCalendars(
        discovered,
        accountDefaultName(this.#username),
      );
      return { calendars, cursor: null };
    } catch (error) {
      if (error instanceof CaldavClientError) {
        throw new ProviderCalendarError(error.reason, error.message, {
          cause: error,
        });
      }
      throw error;
    }
  }
}

function mapDiscoveredCalendars(
  calendars: readonly DiscoveredCaldavCalendar[],
  defaultName: string,
): DiscoveredCalendar[] {
  const mapped = calendars.map((calendar) => mapCalendar(calendar));
  if (mapped.length === 0) return mapped;

  const primaryByName = mapped.find(
    (calendar) =>
      calendar.displayName.localeCompare(defaultName, undefined, {
        sensitivity: "accent",
      }) === 0,
  );
  const primaryByWritable = mapped.find(
    (calendar) => calendar.capabilities.canWriteEvents,
  );
  const primary = primaryByName ?? primaryByWritable ?? mapped[0]!;

  return mapped.map((calendar) => ({
    ...calendar,
    primary: calendar.providerCalendarId === primary.providerCalendarId,
  }));
}

function mapCalendar(calendar: DiscoveredCaldavCalendar): DiscoveredCalendar {
  const accessRole: CalendarAccessRole = calendar.writable
    ? "editor"
    : "viewer";
  return {
    providerCalendarId: calendar.providerCalendarId,
    displayName: calendar.displayName,
    color: calendar.color,
    eventLabels: [],
    primary: false,
    active: true,
    accessRole,
    capabilities: capabilitiesForAccessRole(accessRole),
    createsGoogleMeet: false,
  };
}

function accountDefaultName(username: string): string {
  const at = username.indexOf("@");
  if (at <= 0) return username;
  return username.slice(0, at);
}
