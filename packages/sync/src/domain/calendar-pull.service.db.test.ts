import { faker } from "@faker-js/faker";
import { type SyncCommandInput } from "@core/types/sync/command.contracts";
import {
  FakeReader,
  pageOf as page,
  TIMED_SCHEDULE as schedule,
  seedProviderCalendar,
  singleEvent as single,
  fakeTokenSource as tokenSource,
} from "@sync/__tests__/helpers/fixtures";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import {
  type CalendarPullDeps,
  pullCalendarChanges,
} from "@sync/domain/calendar-pull.service";
import { reprojectOccurrences } from "@sync/domain/reproject";
import { googleInstanceEventId } from "@sync/providers/google/google-instance-id";
import {
  type ProviderEvent,
  type ProviderEventCancellation,
} from "@sync/providers/provider-event.port";
import {
  ProviderEventReadError,
  type ProviderEventReader,
} from "@sync/providers/provider-event-reader.port";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";
import { CommandRepository } from "@sync/storage/repositories/command.repository";
import { EventRepository } from "@sync/storage/repositories/event.repository";
import { EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

const objectId = () => faker.database.mongodbObjectId();
const now = () => new Date("2026-07-10T00:00:00.000Z");

const content = (title: string) => ({
  title,
  description: "",
  location: null,
  organizer: null,
  attendees: [],
  conference: null,
});
const master = (id: string): ProviderEvent => ({
  ...single(id),
  recurrence: { kind: "seriesMaster", rules: ["RRULE:FREQ=WEEKLY;COUNT=3"] },
});
const cancellation = (id: string): ProviderEventCancellation => ({
  kind: "cancellation",
  providerEventId: id,
  providerVersion: `etag-${id}`,
  series: null,
});
const seriesCancellation = (
  id: string,
  seriesProviderId: string,
  recurrenceId: string,
): ProviderEventCancellation => ({
  kind: "cancellation",
  providerEventId: id,
  providerVersion: `etag-${id}`,
  series: { seriesProviderId, recurrenceId },
});
describe("pullCalendarChanges", () => {
  const storage = setupSyncStorage(import.meta.url);
  let events: EventRepository;
  let occurrences: EventOccurrenceRepository;
  let resources: SyncResourceRepository;
  let commands: CommandRepository;
  let calendars: ProviderCalendarRepository;

  beforeEach(() => {
    events = new EventRepository(storage.db());
    occurrences = new EventOccurrenceRepository(storage.db(), storage.client());
    resources = new SyncResourceRepository(storage.db());
    commands = new CommandRepository(storage.db());
    calendars = new ProviderCalendarRepository(storage.db());
  });

  const deps = (reader: FakeReader): CalendarPullDeps => ({
    events,
    occurrences,
    resources,
    commands,
    reader,
    custody: tokenSource,
  });

  const seedCalendar = (
    eventLabels: ProviderCalendarRecord["eventLabels"] = [],
  ): Promise<ProviderCalendarRecord> =>
    seedProviderCalendar(calendars, { eventLabels });

  // Put the calendar's events resource into the imported state at a cursor.
  const seedImported = async (
    calendar: ProviderCalendarRecord,
    cursor = "cursor-0",
  ) => {
    const resource = await resources.ensure({
      tenantId: calendar.tenantId,
      principalId: calendar.principalId,
      connectionId: calendar.connectionId,
      resourceKind: "events",
      calendarId: calendar._id,
    });
    await resources.advanceCursor(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
      cursor,
      now(),
    );
    return resource;
  };

  // Seed a provider-linked local event (as import would leave it).
  const seedEvent = (
    calendar: ProviderCalendarRecord,
    read: ProviderEvent,
    recurrence: EventRecord["recurrence"] = { kind: "single" },
  ): Promise<EventRecord> =>
    events.upsertByProviderIdentity({
      tenantId: calendar.tenantId,
      principalId: calendar.principalId,
      origin: "provider",
      calendarId: calendar._id,
      clientEventId: null,
      connectionId: calendar.connectionId,
      providerEventId: read.providerEventId as never,
      providerVersion: read.providerVersion as never,
      providerUpdatedAt: null,
      deliveryState: null,
      providerMetadata: null,
      content: read.content,
      schedule: read.schedule,
      recurrence,
      lifecycleState: "active",
      generation: 0,
      confirmedAt: now(),
    });

  const eventCount = (calendarId: string) =>
    storage
      .db()
      .collection(SYNC_COLLECTIONS.events)
      .countDocuments({ calendarId });

  it("returns notImported and reads nothing when the resource has no cursor", async () => {
    const calendar = await seedCalendar();
    // ensure the resource exists but never advance a cursor onto it.
    await resources.ensure({
      tenantId: calendar.tenantId,
      principalId: calendar.principalId,
      connectionId: calendar.connectionId,
      resourceKind: "events",
      calendarId: calendar._id,
    });
    const reader = new FakeReader([]);

    const result = await pullCalendarChanges(deps(reader), calendar, now);

    expect(result.status).toBe("notImported");
    expect(reader.calls).toHaveLength(0);
    // Even an early-exit pull stamps the attempt: the reconcile sweep selects
    // least-recently-attempted resources, so a resource whose pull cannot
    // proceed must still rotate to the back of the line instead of being
    // re-selected by every sweep (2026-07-29 head-of-line starvation).
    const stamped = await storage
      .db()
      .collection(SYNC_COLLECTIONS.syncResources)
      .findOne({ calendarId: calendar._id, resourceKind: "events" });
    expect(stamped?.lastAttemptAt).toEqual(now());
  });

  it("reads from the stored cursor and advances to the new one", async () => {
    const calendar = await seedCalendar();
    await seedImported(calendar, "cursor-0");
    const reader = new FakeReader([
      page([single("new-1")], { nextSyncToken: "cursor-1" }),
    ]);

    const result = await pullCalendarChanges(deps(reader), calendar, now);

    expect(reader.calls[0].cursor).toBe("cursor-0");
    expect(reader.calls[0].window ?? null).toBeNull();
    if (result.status !== "applied") throw new Error("expected applied");
    expect(result.resource.syncCursor).toBe("cursor-1");
    expect(result.changed).toBe(1);
  });

  it("passes the calendar's event-color labels to the reader", async () => {
    const calendar = await seedCalendar([{ id: "label-1", hex: "#009688" }]);
    await seedImported(calendar, "cursor-0");
    const reader = new FakeReader([
      page([single("new-1")], { nextSyncToken: "cursor-1" }),
    ]);

    await pullCalendarChanges(deps(reader), calendar, now);

    expect(reader.calls[0].colorLabels).toEqual(
      new Map([["label-1", "#009688"]]),
    );
  });

  it("writes into the active generation when a prior repair left one staged", async () => {
    // A repair bumped importGeneration ahead of activeGeneration but never
    // activated (crashed/incomplete). A pull must still write the live (active)
    // generation, or its new events land in a generation reads never serve.
    const calendar = await seedCalendar();
    const resource = await seedImported(calendar, "cursor-0");
    await resources.startNewGeneration(
      calendar.tenantId,
      calendar.principalId,
      resource._id,
    ); // importGeneration -> 1, activeGeneration stays 0

    const reader = new FakeReader([
      page([single("new-1")], { nextSyncToken: "cursor-1" }),
    ]);
    const result = await pullCalendarChanges(deps(reader), calendar, now);

    if (result.status !== "applied") throw new Error("expected applied");
    const occAt = (generation: number) =>
      storage
        .db()
        .collection(SYNC_COLLECTIONS.eventOccurrences)
        .countDocuments({ calendarId: calendar._id, generation });
    // The pulled event is visible at the active generation, not stranded in the
    // repair's staged one.
    expect(await occAt(0)).toBe(1);
    expect(await occAt(1)).toBe(0);
  });

  it("applies a provider deletion by removing the local event", async () => {
    const calendar = await seedCalendar();
    await seedImported(calendar);
    await seedEvent(calendar, single("doomed"));
    expect(await eventCount(calendar._id)).toBe(1);
    const reader = new FakeReader([
      page([cancellation("doomed")], { nextSyncToken: "cursor-1" }),
    ]);

    const result = await pullCalendarChanges(deps(reader), calendar, now);

    if (result.status !== "applied") throw new Error("expected applied");
    expect(result.deleted).toBe(1);
    expect(await eventCount(calendar._id)).toBe(0);
  });

  it("deletes a whole series when its master is cancelled", async () => {
    const calendar = await seedCalendar();
    await seedImported(calendar);
    const m = await seedEvent(calendar, master("m"), {
      kind: "seriesMaster",
      rules: ["RRULE:FREQ=WEEKLY;COUNT=3"],
    });
    // An exception of that series.
    await events.upsertByProviderIdentity({
      tenantId: calendar.tenantId,
      principalId: calendar.principalId,
      origin: "provider",
      calendarId: calendar._id,
      clientEventId: null,
      connectionId: calendar.connectionId,
      providerEventId: "m-ex" as never,
      providerVersion: "etag-ex" as never,
      providerUpdatedAt: null,
      deliveryState: null,
      providerMetadata: null,
      content: content("ex"),
      schedule,
      recurrence: {
        kind: "exception",
        seriesId: m._id,
        recurrenceId: "2026-07-21T09:00:00-06:00" as never,
        cancelled: false,
      },
      lifecycleState: "active",
      generation: 0,
      confirmedAt: now(),
    });
    expect(await eventCount(calendar._id)).toBe(2);
    const reader = new FakeReader([
      page([cancellation("m")], { nextSyncToken: "cursor-1" }),
    ]);

    const result = await pullCalendarChanges(deps(reader), calendar, now);

    if (result.status !== "applied") throw new Error("expected applied");
    // Master and its exception both gone.
    expect(await eventCount(calendar._id)).toBe(0);
  });

  it("preserves a contested exception when its series is cancelled", async () => {
    const calendar = await seedCalendar();
    await seedImported(calendar);
    const m = await seedEvent(calendar, master("m"), {
      kind: "seriesMaster",
      rules: ["RRULE:FREQ=WEEKLY;COUNT=3"],
    });
    const putException = (providerEventId: string, recurrenceId: string) =>
      events.upsertByProviderIdentity({
        tenantId: calendar.tenantId,
        principalId: calendar.principalId,
        origin: "provider",
        calendarId: calendar._id,
        clientEventId: null,
        connectionId: calendar.connectionId,
        providerEventId: providerEventId as never,
        providerVersion: `etag-${providerEventId}` as never,
        providerUpdatedAt: null,
        deliveryState: null,
        providerMetadata: null,
        content: content(providerEventId),
        schedule,
        recurrence: {
          kind: "exception",
          seriesId: m._id,
          recurrenceId: recurrenceId as never,
          cancelled: false,
        },
        lifecycleState: "active",
        generation: 0,
        confirmedAt: now(),
      });
    const contested = await putException(
      "ex-edit",
      "2026-07-21T09:00:00-06:00",
    );
    await putException("ex-plain", "2026-07-28T09:00:00-06:00");
    // A pending Compass edit still targets the contested occurrence.
    await commands.submit({
      tenantId: calendar.tenantId,
      principalId: calendar.principalId,
      idempotencyKey: `idem-${objectId()}` as never,
      eventId: contested._id,
      input: {
        kind: "update",
        invitation: "all",
        content: content("my local edit"),
        schedule,
        recurrence: { kind: "preserve" },
        scope: "this",
        recurrenceId: "2026-07-21T09:00:00-06:00",
      } as unknown as SyncCommandInput,
      expectedVersion: null,
    });
    const reader = new FakeReader([
      page([cancellation("m")], { nextSyncToken: "cursor-1" }),
    ]);

    const result = await pullCalendarChanges(deps(reader), calendar, now);

    if (result.status !== "applied") throw new Error("expected applied");
    // Master and the uncontested exception are gone; the contested one survives
    // for its in-flight edit to reconcile against the provider.
    const remaining = await events.findById(
      calendar.tenantId,
      calendar.principalId,
      contested._id,
    );
    expect(remaining).not.toBeNull();
    expect(await eventCount(calendar._id)).toBe(1);
  });

  it("keeps an event with an unacknowledged Compass command", async () => {
    const calendar = await seedCalendar();
    await seedImported(calendar);
    const event = await seedEvent(calendar, single("contested"));
    // A pending local command still targets this event.
    await commands.submit({
      tenantId: calendar.tenantId,
      principalId: calendar.principalId,
      idempotencyKey: `idem-${objectId()}` as never,
      eventId: event._id,
      input: {
        kind: "delete",
        invitation: "all",
        scope: "all",
        recurrenceId: null,
      } as unknown as SyncCommandInput,
      expectedVersion: null,
    });
    const reader = new FakeReader([
      page([cancellation("contested")], { nextSyncToken: "cursor-1" }),
    ]);

    const result = await pullCalendarChanges(deps(reader), calendar, now);

    if (result.status !== "applied") throw new Error("expected applied");
    // The provider deletion is withheld — the local intent survives.
    expect(result.deleted).toBe(0);
    expect(await eventCount(calendar._id)).toBe(1);
  });

  it("treats a deletion of an already-absent event as a no-op", async () => {
    const calendar = await seedCalendar();
    await seedImported(calendar);
    const reader = new FakeReader([
      page([cancellation("ghost")], { nextSyncToken: "cursor-1" }),
    ]);

    const result = await pullCalendarChanges(deps(reader), calendar, now);

    if (result.status !== "applied") throw new Error("expected applied");
    expect(result.deleted).toBe(0);
    expect(result.resource.syncCursor).toBe("cursor-1");
  });

  it("tombstones a cancelled series occurrence from a sparse instance id", async () => {
    const calendar = await seedCalendar();
    await seedImported(calendar);
    const m = await seedEvent(calendar, master("m"), {
      kind: "seriesMaster",
      rules: ["RRULE:FREQ=WEEKLY;COUNT=3"],
    });
    await reprojectOccurrences(occurrences, m, now);
    const cancelledInstant = "2026-07-21T15:00:00.000Z";
    const instanceId = googleInstanceEventId("m", cancelledInstant, "timed");
    const reader = new FakeReader([
      page([seriesCancellation(instanceId, "m", cancelledInstant)], {
        nextSyncToken: "cursor-1",
      }),
    ]);

    const result = await pullCalendarChanges(deps(reader), calendar, now);

    if (result.status !== "applied") throw new Error("expected applied");
    expect(result.resource.syncCursor).toBe("cursor-1");
    // Master stays; the instance becomes a cancelled exception, not a series delete.
    expect(await eventCount(calendar._id)).toBe(2);
    const occs = await storage
      .db()
      .collection(SYNC_COLLECTIONS.eventOccurrences)
      .find({ calendarId: calendar._id })
      .toArray();
    const atCancelled = occs.filter(
      (row) =>
        new Date(row.startAt as Date).getTime() ===
        Date.parse(cancelledInstant),
    );
    expect(atCancelled).toHaveLength(1);
    expect(atCancelled[0]?.cancelled).toBe(true);
    expect(occs.filter((row) => row.cancelled !== true)).toHaveLength(2);
  });

  it("deletes a standalone whose id looks like an instance when no master exists", async () => {
    const calendar = await seedCalendar();
    await seedImported(calendar);
    const id = "weird_20260721T150000Z";
    await seedEvent(calendar, single(id));
    const reader = new FakeReader([
      page([seriesCancellation(id, "weird", "2026-07-21T15:00:00.000Z")], {
        nextSyncToken: "cursor-1",
      }),
    ]);

    const result = await pullCalendarChanges(deps(reader), calendar, now);

    if (result.status !== "applied") throw new Error("expected applied");
    expect(result.deleted).toBe(1);
    expect(await eventCount(calendar._id)).toBe(0);
  });

  it("applies an unresolved instance-shaped cancellation before the page checkpoint", async () => {
    const calendar = await seedCalendar();
    await seedImported(calendar);
    const id = "weird_20260721T150000Z";
    await seedEvent(calendar, single(id));
    const reader = new FakeReader([
      page([seriesCancellation(id, "weird", "2026-07-21T15:00:00.000Z")], {
        nextPageToken: "p2",
      }),
      page([], { nextSyncToken: "cursor-1" }),
    ]);

    const result = await pullCalendarChanges(deps(reader), calendar, now);

    if (result.status !== "applied") throw new Error("expected applied");
    expect(result.deleted).toBe(1);
    expect(await eventCount(calendar._id)).toBe(0);
    expect(result.resource.syncCursor).toBe("cursor-1");
  });

  it("retries the page with a reminted token after a one-off 401", async () => {
    const calendar = await seedCalendar();
    await seedImported(calendar);
    const reader = new FakeReader(
      [page([single("a")], { nextSyncToken: "cursor-1" })],
      new ProviderEventReadError("authExpired", "401"),
      true,
    );
    const invalidated: string[] = [];
    const tokens: string[] = [];
    const custody = {
      getValidAccessToken: async () => {
        const token = tokens.length === 0 ? "stale-token" : "fresh-token";
        tokens.push(token);
        return token;
      },
      discardRevoked: async () => {},
      invalidateAccessToken: async (connectionId: string) => {
        invalidated.push(connectionId);
      },
    };

    const result = await pullCalendarChanges(
      { ...deps(reader), custody },
      calendar,
      now,
    );

    if (result.status !== "applied") throw new Error("expected applied");
    expect(result.changed).toBe(1);
    expect(result.resource.syncCursor).toBe("cursor-1");
    expect(invalidated).toEqual([calendar.connectionId]);
    expect(reader.calls.map((call) => call.accessToken)).toEqual([
      "stale-token",
      "fresh-token",
    ]);
  });

  it("hands off to repair on an expired cursor without touching it", async () => {
    const calendar = await seedCalendar();
    await seedImported(calendar, "stale");
    const reader = new FakeReader(
      [],
      new ProviderEventReadError("cursorExpired", "410"),
    );

    const result = await pullCalendarChanges(deps(reader), calendar, now);

    expect(result.status).toBe("cursorExpired");
    // The stored cursor is left untouched for the repair path.
    const resource = await resources.findById(
      calendar.tenantId,
      calendar.principalId,
      result.resource._id,
    );
    expect(resource?.syncCursor).toBe("stale");
  });

  it("advances the cursor only after every page commits", async () => {
    const calendar = await seedCalendar();
    await seedImported(calendar);
    const reader = new FakeReader([
      page([single("a")], { nextPageToken: "p2" }),
      page([single("b")], { nextSyncToken: "cursor-1" }),
    ]);

    const result = await pullCalendarChanges(deps(reader), calendar, now);

    if (result.status !== "applied") throw new Error("expected applied");
    // First page carried no sync token, so the cursor moves to the last page's.
    expect(result.resource.syncCursor).toBe("cursor-1");
    expect(result.resource.pageCursor).toBeNull();
    expect(reader.calls[1].pageToken).toBe("p2");
    expect(result.changed).toBe(2);
  });

  describe("push change marker", () => {
    // A notification stamps changeNotifiedAt; the pull that observes it clears
    // the marker and reports how long the provider-to-applied hop took.
    it("clears the marker it served and reports push latency", async () => {
      const calendar = await seedCalendar();
      const resource = await seedImported(calendar);
      const notifiedAt = new Date("2026-07-09T23:59:55.000Z");
      await resources.markChangeNotified(
        calendar.tenantId,
        calendar.principalId,
        resource._id,
        notifiedAt,
      );
      const reader = new FakeReader([
        page([single("a")], { nextSyncToken: "c" }),
      ]);

      const result = await pullCalendarChanges(deps(reader), calendar, now);

      if (result.status !== "applied") throw new Error("expected applied");
      expect(result.changedDuringPull).toBe(false);
      // now() is 2026-07-10T00:00:00Z, five seconds after the notification.
      expect(result.pushLatencyMs).toBe(5_000);
      const stored = await resources.findById(
        calendar.tenantId,
        calendar.principalId,
        resource._id,
      );
      expect(stored?.changeNotifiedAt).toBeNull();
    });

    it("reports no latency and leaves the marker null when no notification drove the pull", async () => {
      const calendar = await seedCalendar();
      const resource = await seedImported(calendar);
      const reader = new FakeReader([page([], { nextSyncToken: "c" })]);

      const result = await pullCalendarChanges(deps(reader), calendar, now);

      if (result.status !== "applied") throw new Error("expected applied");
      expect(result.pushLatencyMs).toBeNull();
      expect(result.changedDuringPull).toBe(false);
      const stored = await resources.findById(
        calendar.tenantId,
        calendar.principalId,
        resource._id,
      );
      expect(stored?.changeNotifiedAt).toBeNull();
    });

    // The regression this whole field exists for: the notification's own
    // enqueue coalesced onto this pull's claimed row and did nothing, so if the
    // pull also cleared the marker the change would be lost until the 15-minute
    // reconcile sweep.
    it("reports changedDuringPull and keeps the newer marker when a notification lands mid-pull", async () => {
      const calendar = await seedCalendar();
      const resource = await seedImported(calendar);
      const arrivedDuringPull = new Date("2026-07-10T00:00:03.000Z");

      // Stamps the marker as a side effect of the provider read — i.e. the
      // notification lands after this pull has already seen the provider.
      const reader: ProviderEventReader = {
        listEventPage: async () => {
          await resources.markChangeNotified(
            calendar.tenantId,
            calendar.principalId,
            resource._id,
            arrivedDuringPull,
          );
          return page([single("a")], { nextSyncToken: "c" });
        },
      };

      const result = await pullCalendarChanges(
        { ...deps(new FakeReader([])), reader },
        calendar,
        now,
      );

      if (result.status !== "applied") throw new Error("expected applied");
      expect(result.changedDuringPull).toBe(true);
      const stored = await resources.findById(
        calendar.tenantId,
        calendar.principalId,
        resource._id,
      );
      // Left set on purpose: the next pass owns it.
      expect(stored?.changeNotifiedAt).toEqual(arrivedDuringPull);
    });
  });
});
