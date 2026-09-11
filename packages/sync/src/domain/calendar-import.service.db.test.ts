import { type ProviderEventId } from "@core/types/sync/identity.contracts";
import {
  pageOf as page,
  seedProviderCalendar,
  singleEvent as single,
  fakeTokenSource as tokenSource,
} from "@sync/__tests__/helpers/fixtures";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import {
  type CalendarImportDeps,
  importCalendarEvents,
} from "@sync/domain/calendar-import.service";
import { type AccessTokenSource } from "@sync/domain/provider-write-ladder";
import {
  type ProviderEvent,
  type ProviderEventRead,
} from "@sync/providers/provider-event.port";
import {
  type ProviderEventPage,
  type ProviderEventReader,
  type ProviderEventReadInput,
} from "@sync/providers/provider-event-reader.port";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";
import { EventRepository } from "@sync/storage/repositories/event.repository";
import { EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

const now = () => new Date("2026-07-10T00:00:00.000Z");

// A reader serving scripted pages, one script for the windowed (fast) pass and
// one for the full (cursor-earning) pass. Records every call.
class FakeReader implements ProviderEventReader {
  calls: ProviderEventReadInput[] = [];
  #window: ProviderEventPage[];
  #full: ProviderEventPage[];

  constructor(opts: {
    window?: ProviderEventPage[];
    full: ProviderEventPage[];
  }) {
    this.#window = [...(opts.window ?? [emptyPage()])];
    this.#full = [...opts.full];
  }

  async listEventPage(
    input: ProviderEventReadInput,
  ): Promise<ProviderEventPage> {
    this.calls.push(input);
    const queue = input.window ? this.#window : this.#full;
    const page = queue.shift();
    if (!page) throw new Error("FakeReader: no page scripted");
    return page;
  }
}

const master = (
  id: string,
  rules = ["RRULE:FREQ=WEEKLY;COUNT=3"],
): ProviderEvent => ({
  ...single(id),
  recurrence: { kind: "seriesMaster", rules },
});

const instance = (
  id: string,
  seriesProviderId: string,
  recurrenceId: string,
  title = id,
): ProviderEvent => ({
  ...single(id, title),
  recurrence: { kind: "instance", seriesProviderId, recurrenceId },
});

const cancellation = (id: string): ProviderEventRead => ({
  kind: "cancellation",
  providerEventId: id,
  providerVersion: `etag-${id}`,
  series: null,
});

const emptyPage = () => page([]);

describe("importCalendarEvents", () => {
  const storage = setupSyncStorage(import.meta.url);
  let events: EventRepository;
  let occurrences: EventOccurrenceRepository;
  let resources: SyncResourceRepository;
  let calendars: ProviderCalendarRepository;

  beforeEach(() => {
    events = new EventRepository(storage.db());
    occurrences = new EventOccurrenceRepository(storage.db(), storage.client());
    resources = new SyncResourceRepository(storage.db());
    calendars = new ProviderCalendarRepository(storage.db());
  });

  const seedCalendar = (
    eventLabels: ProviderCalendarRecord["eventLabels"] = [],
  ): Promise<ProviderCalendarRecord> =>
    seedProviderCalendar(calendars, { eventLabels });

  const deps = (reader: FakeReader): CalendarImportDeps => ({
    events,
    occurrences,
    resources,
    reader,
    custody: tokenSource,
  });

  const occCount = (calendarId: string) =>
    storage
      .db()
      .collection(SYNC_COLLECTIONS.eventOccurrences)
      .countDocuments({ calendarId });

  const occStarts = async (eventId: string) =>
    (
      await storage
        .db()
        .collection(SYNC_COLLECTIONS.eventOccurrences)
        .find({ eventId })
        .sort({ startAt: 1 })
        .toArray()
    ).map((o) => (o["startAt"] as Date).toISOString());

  it("imports singles, projects them, and advances the cursor from the full pass", async () => {
    const calendar = await seedCalendar();
    const reader = new FakeReader({
      full: [page([single("a"), single("b")], { nextSyncToken: "cursor-1" })],
    });

    const result = await importCalendarEvents(deps(reader), calendar, now);

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.resource.syncCursor).toBe("cursor-1");
    expect(result.resource.pageCursor).toBeNull();
    expect(await occCount(calendar._id)).toBe(2);
  });

  it("runs the windowed pass before the full pass", async () => {
    const calendar = await seedCalendar();
    const reader = new FakeReader({
      window: [page([single("w")])],
      full: [page([single("a")], { nextSyncToken: "cursor-1" })],
    });

    await importCalendarEvents(deps(reader), calendar, now);

    expect(reader.calls[0]!.window).not.toBeNull();
    expect(reader.calls.at(-1)?.window).toBeNull();
  });

  it("passes the calendar's event-color labels to every reader call", async () => {
    const calendar = await seedCalendar([{ id: "label-1", hex: "#009688" }]);
    const reader = new FakeReader({
      window: [page([single("w")])],
      full: [page([single("a")], { nextSyncToken: "cursor-1" })],
    });

    await importCalendarEvents(deps(reader), calendar, now);

    for (const call of reader.calls) {
      expect(call.colorLabels).toEqual(new Map([["label-1", "#009688"]]));
    }
  });

  it("projects every occurrence of an imported series master", async () => {
    const calendar = await seedCalendar();
    const reader = new FakeReader({
      full: [page([master("m")], { nextSyncToken: "cursor-1" })],
    });

    await importCalendarEvents(deps(reader), calendar, now);

    const stored = await events.findByProviderIdentity(
      calendar.tenantId,
      calendar.principalId,
      {
        connectionId: calendar.connectionId,
        calendarId: calendar._id,
        providerEventId: "m" as ProviderEventId,
      },
    );
    expect(stored?.recurrence.kind).toBe("seriesMaster");
    expect(await occStarts(stored?._id as string)).toHaveLength(3);
  });

  it("links an instance that arrives before its master on the same page", async () => {
    const calendar = await seedCalendar();
    const reader = new FakeReader({
      full: [
        page(
          [
            instance("m_i1", "m", "2026-07-21T09:00:00-06:00", "Moved"),
            master("m"),
          ],
          { nextSyncToken: "cursor-1" },
        ),
      ],
    });

    const result = await importCalendarEvents(deps(reader), calendar, now);

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    const exceptions = await events.findSeriesExceptions(
      calendar.tenantId,
      calendar.principalId,
      (await masterId(events, calendar, "m")) as never,
    );
    expect(exceptions).toHaveLength(1);
  });

  it("links an instance whose master arrives on a later page", async () => {
    const calendar = await seedCalendar();
    const reader = new FakeReader({
      full: [
        page([instance("m_i1", "m", "2026-07-21T09:00:00-06:00")], {
          nextPageToken: "p2",
        }),
        page([master("m")], { nextSyncToken: "cursor-1" }),
      ],
    });

    const result = await importCalendarEvents(deps(reader), calendar, now);

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    // The master's projection excludes the exception's instant (3 rules - 1
    // excepted instant = 2 master rows), and the exception projects its own.
    const mId = (await masterId(events, calendar, "m")) as string;
    expect(await occStarts(mId)).toHaveLength(2);
  });

  it("writes a cancelled series occurrence as a tombstone that excludes its instant", async () => {
    const calendar = await seedCalendar();
    // A deleted occurrence of an active weekly series (3 occurrences) comes back
    // as a cancellation carrying the series link. Its instant must not resurface.
    const cancelled = "2026-07-21T09:00:00-06:00";
    const reader = new FakeReader({
      full: [
        page(
          [
            master("m"),
            {
              kind: "cancellation",
              providerEventId: "m_c1",
              providerVersion: "etag-c",
              series: { seriesProviderId: "m", recurrenceId: cancelled },
            },
          ],
          { nextSyncToken: "cursor-1" },
        ),
      ],
    });

    const result = await importCalendarEvents(deps(reader), calendar, now);

    expect(result.imported).toBe(2); // master + cancelled exception
    const mId = (await masterId(events, calendar, "m")) as string;
    // The master projects 2 live rows (its excepted instant excluded).
    expect(await occStarts(mId)).toEqual([
      "2026-07-14T15:00:00.000Z",
      "2026-07-28T15:00:00.000Z",
    ]);
    // The tombstone exists and its own occurrence row is cancelled.
    const exceptions = await events.findSeriesExceptions(
      calendar.tenantId,
      calendar.principalId,
      mId as never,
    );
    expect(exceptions).toHaveLength(1);
    expect(
      exceptions[0]?.recurrence.kind === "exception" &&
        exceptions[0]?.recurrence.cancelled,
    ).toBe(true);
  });

  it("links a cancelled occurrence that arrives before its master", async () => {
    const calendar = await seedCalendar();
    const cancelled = "2026-07-21T09:00:00-06:00";
    const reader = new FakeReader({
      full: [
        page(
          [
            {
              kind: "cancellation",
              providerEventId: "m_c1",
              providerVersion: "etag-c",
              series: { seriesProviderId: "m", recurrenceId: cancelled },
            },
          ],
          { nextPageToken: "p2" },
        ),
        page([master("m")], { nextSyncToken: "cursor-1" }),
      ],
    });

    const result = await importCalendarEvents(deps(reader), calendar, now);

    expect(result.skipped).toBe(0);
    const mId = (await masterId(events, calendar, "m")) as string;
    expect(await occStarts(mId)).toHaveLength(2);
  });

  it("counts an instance whose master never appears as skipped", async () => {
    const calendar = await seedCalendar();
    const reader = new FakeReader({
      full: [
        page([instance("orphan_i", "ghost", "2026-07-21T09:00:00-06:00")], {
          nextSyncToken: "cursor-1",
        }),
      ],
    });

    const result = await importCalendarEvents(deps(reader), calendar, now);

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
    expect(await occCount(calendar._id)).toBe(0);
  });

  it("carries the reader's per-event skip count into the result", async () => {
    const calendar = await seedCalendar();
    const reader = new FakeReader({
      full: [page([single("a")], { nextSyncToken: "cursor-1", skipped: 3 })],
    });

    const result = await importCalendarEvents(deps(reader), calendar, now);

    expect(result.skipped).toBe(3);
  });

  it("keeps a cancellation from importing anything", async () => {
    const calendar = await seedCalendar();
    const reader = new FakeReader({
      full: [
        page([cancellation("gone"), single("a")], {
          nextSyncToken: "cursor-1",
        }),
      ],
    });

    const result = await importCalendarEvents(deps(reader), calendar, now);

    expect(result.imported).toBe(1);
    expect(await occCount(calendar._id)).toBe(1);
  });

  it("dedupes an event that appears on two pages", async () => {
    const calendar = await seedCalendar();
    const reader = new FakeReader({
      full: [
        page([single("a")], { nextPageToken: "p2" }),
        page([single("a")], { nextSyncToken: "cursor-1" }),
      ],
    });

    const result = await importCalendarEvents(deps(reader), calendar, now);

    expect(await occCount(calendar._id)).toBe(1);
    expect(result.imported).toBe(1);
    expect(result.resource.syncCursor).toBe("cursor-1");
  });

  it("counts an event once when both passes import it", async () => {
    const calendar = await seedCalendar();
    // The same event is in the windowed range and the full pass. It must be
    // counted once (distinct id), and per-event skips counted only once too.
    const reader = new FakeReader({
      window: [page([single("a")], { skipped: 1 })],
      full: [page([single("a")], { nextSyncToken: "cursor-1", skipped: 1 })],
    });

    const result = await importCalendarEvents(deps(reader), calendar, now);

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(await occCount(calendar._id)).toBe(1);
  });

  it("is a no-op once the resource already has a cursor", async () => {
    const calendar = await seedCalendar();
    await importCalendarEvents(
      deps(
        new FakeReader({
          full: [page([single("a")], { nextSyncToken: "cursor-1" })],
        }),
      ),
      calendar,
      now,
    );
    const reader = new FakeReader({
      full: [page([single("b")], { nextSyncToken: "cursor-2" })],
    });

    const result = await importCalendarEvents(deps(reader), calendar, now);

    expect(result.imported).toBe(0);
    expect(reader.calls).toHaveLength(0);
    expect(result.resource.syncCursor).toBe("cursor-1");
  });

  it("throws rather than finishing without a cursor", async () => {
    const calendar = await seedCalendar();
    const reader = new FakeReader({ full: [page([single("a")])] });

    await expect(
      importCalendarEvents(deps(reader), calendar, now),
    ).rejects.toThrow(/no sync cursor/);
    // The event still imported, but the cursor is not advanced, so a retry
    // re-imports idempotently rather than going incremental on partial data.
    const resource = await resources.findById(
      calendar.tenantId,
      calendar.principalId,
      (await resourceId(resources, calendar)) as string,
    );
    expect(resource?.syncCursor).toBeNull();
  });

  it("stamps the attempt even when the token fetch throws", async () => {
    // The reconcile sweep selects least-recently-attempted resources. A
    // doomed connection's import must rotate to the back of the sweep after
    // failing, not tie at lastAttemptAt: null forever and keep winning slots
    // (2026-07-29: this exact ordering bug kept ~100 credential-less
    // resources at the sweep's head even after the pull-path half of the fix
    // had already shipped).
    const calendar = await seedCalendar();
    const reader = new FakeReader({ full: [emptyPage()] });
    const deadCustody: AccessTokenSource = {
      getValidAccessToken: async () => {
        throw new Error("token fetch failed");
      },
      discardRevoked: async () => {},
      invalidateAccessToken: async () => {},
    };

    await expect(
      importCalendarEvents(
        { events, occurrences, resources, reader, custody: deadCustody },
        calendar,
        now,
      ),
    ).rejects.toThrow("token fetch failed");

    const resourceIdValue = (await resourceId(resources, calendar)) as string;
    const resource = await resources.findById(
      calendar.tenantId,
      calendar.principalId,
      resourceIdValue,
    );
    expect(resource?.lastAttemptAt).toEqual(now());
  });

  it("skips the windowed pass when resuming from a page checkpoint", async () => {
    const calendar = await seedCalendar();
    // Prime the resource with a mid-full-pass checkpoint.
    const resource = await resources.ensure({
      tenantId: calendar.tenantId,
      principalId: calendar.principalId,
      connectionId: calendar.connectionId,
      resourceKind: "events",
      calendarId: calendar._id,
    });
    await resources.setPageCheckpoint(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
      "resume-token",
    );
    const reader = new FakeReader({
      window: [page([single("should-not-read")])],
      full: [page([single("a")], { nextSyncToken: "cursor-1" })],
    });

    await importCalendarEvents(deps(reader), calendar, now);

    // No windowed call at all; the first (and only) read resumes the full pass.
    expect(reader.calls.every((c) => c.window === null)).toBe(true);
    expect(reader.calls[0]!.pageToken).toBe("resume-token");
  });
});

// --- small helpers to keep the tests readable ---

async function masterId(
  events: EventRepository,
  calendar: ProviderCalendarRecord,
  providerEventId: string,
): Promise<string> {
  const record = await events.findByProviderIdentity(
    calendar.tenantId,
    calendar.principalId,
    {
      connectionId: calendar.connectionId,
      calendarId: calendar._id,
      providerEventId: providerEventId as ProviderEventId,
    },
  );
  if (!record)
    throw new Error(`no local event for provider id ${providerEventId}`);
  return record._id;
}

async function resourceId(
  resources: SyncResourceRepository,
  calendar: ProviderCalendarRecord,
): Promise<string> {
  const [resource] = await resources.listByConnection(
    calendar.tenantId,
    calendar.principalId,
    calendar.connectionId,
  );
  if (!resource) throw new Error("no resource for connection");
  return resource._id;
}
