import { faker } from "@faker-js/faker";
import {
  type ProviderAdapters,
  type ResolveProviderAdapters,
} from "@sync/providers/provider-adapters";
import {
  type ProviderEvent,
  type ProviderEventRead,
} from "@sync/providers/provider-event.port";
import {
  type ProviderEventPage,
  type ProviderEventReader,
  type ProviderEventReadInput,
} from "@sync/providers/provider-event-reader.port";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";
import { type SyncResourceRecord } from "@sync/storage/contracts/sync-resource.contracts";
import { type ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { type SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

const objectId = () => faker.database.mongodbObjectId();

type CalendarUpsertInput = Parameters<
  ProviderCalendarRepository["upsertByProviderCalendar"]
>[0];

// One writable, active, primary Google calendar under a fresh owner — the
// shape most db tests hand-rolled locally. Override any field; overriding
// tenantId/principalId/connectionId groups several calendars under one owner.
export const seedProviderCalendar = (
  calendars: ProviderCalendarRepository,
  overrides: Partial<CalendarUpsertInput> = {},
): Promise<ProviderCalendarRecord> =>
  calendars.upsertByProviderCalendar({
    tenantId: objectId() as ProviderCalendarRecord["tenantId"],
    principalId: objectId() as ProviderCalendarRecord["principalId"],
    connectionId: objectId() as ProviderCalendarRecord["connectionId"],
    providerCalendarId: "primary@google.com",
    displayName: "Google",
    color: null,
    active: true,
    primary: true,
    accessRole: "owner",
    capabilities: {
      canReadEvents: true,
      canWriteEvents: true,
      canReadBusy: true,
      canInviteAttendees: true,
    },
    ...overrides,
  });

// Ensure the calendar's events resource, optionally already imported (holding
// a cursor), as a prior import/pull would have left it. A seeded cursor
// represents an established calendar from before the test's job begins, so it
// also marks the bootstrap ready unless the caller overrides that; tests that
// exercise the bootstrap lifecycle seed without a cursor.
export const ensureEventsResource = async (
  resources: SyncResourceRepository,
  calendar: Pick<
    ProviderCalendarRecord,
    "_id" | "tenantId" | "principalId" | "connectionId"
  >,
  options: {
    cursor?: string | null;
    bootstrapState?: SyncResourceRecord["bootstrapState"];
    now?: () => Date;
  } = {},
): Promise<SyncResourceRecord> => {
  const resource = await resources.ensure({
    tenantId: calendar.tenantId,
    principalId: calendar.principalId,
    connectionId: calendar.connectionId,
    resourceKind: "events",
    calendarId: calendar._id,
  });
  if (options.cursor) {
    await resources.advanceCursor(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
      options.cursor,
      (options.now ?? (() => new Date()))(),
    );
  }
  const bootstrapState =
    options.bootstrapState ?? (options.cursor ? "ready" : undefined);
  if (bootstrapState) {
    await resources.setBootstrapState(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
      bootstrapState,
    );
  }
  const seeded = await resources.findById(
    calendar.tenantId,
    calendar.principalId,
    resource._id,
  );
  if (!seeded) throw new Error("seeded resource vanished");
  return seeded;
};

// The timed schedule most db tests give their scripted provider events.
export const TIMED_SCHEDULE = {
  kind: "timed" as const,
  start: "2026-07-14T09:00:00-06:00",
  end: "2026-07-14T10:00:00-06:00",
  timeZone: "America/Denver",
};

// One single (non-recurring) provider event, ready for a scripted page.
export const singleEvent = (id: string, title = id): ProviderEvent => ({
  kind: "event",
  providerEventId: id,
  providerVersion: `etag-${id}`,
  providerUpdatedAt: null,
  content: {
    title,
    description: "",
    location: null,
    organizer: null,
    attendees: [],
    conference: null,
  },
  schedule: TIMED_SCHEDULE,
  busy: true,
  recurrence: { kind: "single" },
});

export const pageOf = (
  events: ProviderEventRead[],
  opts: {
    nextPageToken?: string | null;
    nextSyncToken?: string | null;
    skipped?: number;
  } = {},
): ProviderEventPage => ({
  events,
  skipped: opts.skipped ?? 0,
  nextPageToken: opts.nextPageToken ?? null,
  nextSyncToken: opts.nextSyncToken ?? null,
});

// Replays scripted pages, records read inputs, or throws a scripted error
// (optionally only once, e.g. an expired cursor) on the next read.
export class FakeReader implements ProviderEventReader {
  calls: ProviderEventReadInput[] = [];
  #pages: ProviderEventPage[];
  #error: unknown;
  #errorOnce: boolean;

  constructor(
    pages: ProviderEventPage[],
    error: unknown = null,
    errorOnce = false,
  ) {
    this.#pages = [...pages];
    this.#error = error;
    this.#errorOnce = errorOnce;
  }

  async listEventPage(
    input: ProviderEventReadInput,
  ): Promise<ProviderEventPage> {
    this.calls.push(input);
    if (this.#error) {
      const error = this.#error;
      if (this.#errorOnce) this.#error = null;
      throw error;
    }
    const page = this.#pages.shift();
    if (!page) throw new Error("FakeReader: no page scripted");
    return page;
  }
}

// Access-token custody stub for engines that resolve tokens per job.
export const fakeTokenSource = {
  getValidAccessToken: async () => "access-token",
  discardRevoked: async () => {},
  invalidateAccessToken: async () => {},
};

const noopAuthAdapter = {
  refreshAccessToken: async () => ({
    accessToken: "access-token",
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  }),
  revoke: async () => {},
};

const noopWriter = {
  createEvent: async () => {
    throw new Error("FakeWriter: createEvent not scripted");
  },
  fetchEvent: async () => {
    throw new Error("FakeWriter: fetchEvent not scripted");
  },
  patchEvent: async () => {
    throw new Error("FakeWriter: patchEvent not scripted");
  },
  deleteEvent: async () => {},
  fetchInstanceAt: async () => {
    throw new Error("FakeWriter: fetchInstanceAt not scripted");
  },
};

const noopNotifications = {
  watch: async (input: { channelId: string }) => ({
    channelId: input.channelId,
    resourceId: "provider-resource",
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  }),
  stopChannel: async () => {},
};

const noopDiscovery = {
  discoverCalendars: async () => ({
    calendars: [],
    cursor: null,
  }),
};

// One adapter bundle for dispatch and custody tests. Override any port; reader
// is required because most db tests script event pages through FakeReader.
export function fakeAdapters(
  reader: ProviderEventReader,
  overrides: Partial<Omit<ProviderAdapters, "reader">> = {},
): ProviderAdapters {
  return {
    auth: overrides.auth ?? noopAuthAdapter,
    calendars: overrides.calendars ?? noopDiscovery,
    reader,
    writer: overrides.writer ?? noopWriter,
    notifications: overrides.notifications ?? noopNotifications,
    contacts: overrides.contacts,
  };
}

export function fakeResolveAdapters(
  reader: ProviderEventReader,
  overrides: Partial<Omit<ProviderAdapters, "reader">> = {},
): ResolveProviderAdapters {
  const adapters = fakeAdapters(reader, overrides);
  return (_provider, _connection) => adapters;
}
