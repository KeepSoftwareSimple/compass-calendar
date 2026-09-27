import { QueryClient } from "@tanstack/react-query";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { EventScheduleSchema } from "@core/types/event.contracts";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { createObjectIdString } from "@web/common/utils/id/object-id.util";
import {
  deriveOverlappingEventQueryData,
  findEventInCache,
  getEventQueryEntries,
  insertEventIntoQueries,
  patchEventInQueries,
  removeEventFromQueries,
  removeEventsByCalendarFromQueries,
} from "./event.query.cache";
import { eventQueryKeys } from "./event.query.keys";
import { normalizeEventList } from "./event.query.normalize";
import { type NormalizedEventQueryData } from "./event.query.types";

const normalized = (
  ...events: ReturnType<typeof createMockEvent>[]
): NormalizedEventQueryData => ({
  ids: events.map(({ id }) => id),
  entities: Object.fromEntries(events.map((item) => [item.id, item])),
});

const keys = {
  localWeek: eventQueryKeys.week({
    source: "local",
    start: "2026-07-01T00:00:00.000Z",
    end: "2026-07-08T00:00:00.000Z",
  }),
  remoteWeek: eventQueryKeys.week({
    source: "remote",
    start: "2026-07-01T00:00:00.000Z",
    end: "2026-07-08T00:00:00.000Z",
  }),
};

describe("event query cache", () => {
  test("enumerates Event entries and finds by source", () => {
    const client = new QueryClient();
    const event = createMockEvent();
    client.setQueryData(keys.localWeek, normalized(event));
    client.setQueryData(
      keys.remoteWeek,
      normalized(
        createMockEvent({
          content: { kind: "details", title: "Remote", description: "" },
        }),
      ),
    );
    client.setQueryData(["tasks"], { ids: ["task-1"] });

    expect(getEventQueryEntries(client)).toHaveLength(2);
    expect(findEventInCache(client, event.id, "local")?.content).toMatchObject({
      title: "Test Event",
    });
  });

  test("inserts only into entries accepted by membership", () => {
    const client = new QueryClient();
    const event = createMockEvent();
    client.setQueryData(keys.localWeek, normalized(event));
    client.setQueryData(keys.remoteWeek, normalized(event));
    const created = createMockEvent({
      content: { kind: "details", title: "Created", description: "" },
    });

    insertEventIntoQueries(
      client,
      created,
      ({ metadata }) => metadata.source === "local",
    );

    expect(
      client.getQueryData<NormalizedEventQueryData>(keys.localWeek),
    ).toEqual(normalized(event, created));
    expect(
      client.getQueryData<NormalizedEventQueryData>(keys.remoteWeek)?.ids,
    ).toEqual([event.id]);
  });

  test("patches and removes every cached copy immutably", () => {
    const client = new QueryClient();
    const event = createMockEvent();
    const initial = normalized(event);
    client.setQueryData(keys.localWeek, initial);

    patchEventInQueries(client, event.id, {
      content: { kind: "details", title: "Patched", description: "" },
    });
    expect(initial.entities[event.id].content).toEqual(event.content);
    expect(findEventInCache(client, event.id)?.content).toMatchObject({
      title: "Patched",
    });
    removeEventFromQueries(client, event.id);

    expect(
      client.getQueryData<NormalizedEventQueryData>(keys.localWeek),
    ).toEqual({ ids: [], entities: {} });
  });

  test("removes events belonging to the given calendar ids without touching other events", () => {
    const client = new QueryClient();
    const keptCalendarId = CalendarIdSchema.parse(createObjectIdString());
    const revokedCalendarId = CalendarIdSchema.parse(createObjectIdString());
    const kept = createMockEvent({ calendarId: keptCalendarId });
    const revoked = createMockEvent({ calendarId: revokedCalendarId });
    client.setQueryData(keys.localWeek, normalized(kept, revoked));

    removeEventsByCalendarFromQueries(client, new Set([revokedCalendarId]));

    expect(
      client.getQueryData<NormalizedEventQueryData>(keys.localWeek),
    ).toEqual(normalized(kept));
  });

  test("derives a subset from a cached superset range", () => {
    const client = new QueryClient();
    const event = createMockEvent({
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: "2026-07-03T09:00:00.000Z",
        end: "2026-07-03T10:00:00.000Z",
        timeZone: "UTC",
      }),
    });
    client.setQueryData(keys.localWeek, normalizeEventList([event]));

    const result = deriveOverlappingEventQueryData(client, {
      source: "local",
      startDate: "2026-07-02T00:00:00.000Z",
      endDate: "2026-07-04T23:59:59.999Z",
    });

    expect(result?.ids).toEqual([event.id]);
  });

  test("returns undefined when no cached range overlaps", () => {
    const client = new QueryClient();

    expect(
      deriveOverlappingEventQueryData(client, {
        source: "local",
        startDate: "2026-07-01T00:00:00.000Z",
        endDate: "2026-07-08T00:00:00.000Z",
      }),
    ).toBeUndefined();
  });

  test("returns empty placeholder when an overlapping week has no events in range", () => {
    const client = new QueryClient();
    const event = createMockEvent({
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: "2026-07-03T09:00:00.000Z",
        end: "2026-07-03T10:00:00.000Z",
        timeZone: "UTC",
      }),
    });
    client.setQueryData(keys.localWeek, normalizeEventList([event]));

    expect(
      deriveOverlappingEventQueryData(client, {
        source: "local",
        startDate: "2026-07-05T00:00:00.000Z",
        endDate: "2026-07-06T00:00:00.000Z",
      }),
    ).toEqual({ ids: [], entities: {} });
  });
});
