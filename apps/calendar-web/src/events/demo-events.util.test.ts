import { EventScheduleSchema } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import { createMockLocalEventRecord } from "@web/__tests__/utils/factories/event.factory";
import {
  clearDemoEvents,
  hasDemoEvents,
  toDemoEventsRange,
} from "@web/events/demo-events.util";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const getAllEvents = mock(
  async () => [] as ReturnType<typeof createMockLocalEventRecord>[],
);
const deleteEvent = mock(async () => undefined);
const invalidateQueries = mock(async () => undefined);
const getStore = () => ({ getAllEvents, deleteEvent });

describe("toDemoEventsRange", () => {
  it("builds an exclusive-end range from inclusive calendar days", () => {
    const start = dayjs("2026-07-26");
    const end = dayjs("2026-08-01");

    expect(toDemoEventsRange(start.hour(15), end.endOf("day"))).toEqual({
      start: start.startOf("day").format(),
      end: end.startOf("day").add(1, "day").format(),
    });
  });
});

describe("hasDemoEvents", () => {
  beforeEach(() => {
    getAllEvents.mockClear();
    deleteEvent.mockClear();
    invalidateQueries.mockClear();
  });

  it("returns true when any demo event exists", async () => {
    getAllEvents.mockResolvedValueOnce([
      createMockLocalEventRecord({}, true),
      createMockLocalEventRecord({}, false),
    ]);

    await expect(hasDemoEvents(undefined, getStore)).resolves.toBe(true);
  });

  it("returns false when no demo events exist", async () => {
    getAllEvents.mockResolvedValueOnce([createMockLocalEventRecord({}, false)]);

    await expect(hasDemoEvents(undefined, getStore)).resolves.toBe(false);
  });

  it("returns true only when a demo event overlaps the given range", async () => {
    const inRange = createMockLocalEventRecord(
      {
        schedule: EventScheduleSchema.parse({
          kind: "timed",
          start: "2026-07-27T10:00:00.000-05:00",
          end: "2026-07-27T11:00:00.000-05:00",
          timeZone: "America/Chicago",
        }),
      },
      true,
    );
    const outOfRange = createMockLocalEventRecord(
      {
        schedule: EventScheduleSchema.parse({
          kind: "timed",
          start: "2026-08-03T10:00:00.000-05:00",
          end: "2026-08-03T11:00:00.000-05:00",
          timeZone: "America/Chicago",
        }),
      },
      true,
    );
    getAllEvents.mockResolvedValue([inRange, outOfRange]);

    await expect(
      hasDemoEvents(
        {
          start: "2026-07-26T00:00:00.000-05:00",
          end: "2026-08-02T00:00:00.000-05:00",
        },
        getStore,
      ),
    ).resolves.toBe(true);

    await expect(
      hasDemoEvents(
        {
          start: "2026-08-02T00:00:00.000-05:00",
          end: "2026-08-09T00:00:00.000-05:00",
        },
        getStore,
      ),
    ).resolves.toBe(true);

    await expect(
      hasDemoEvents(
        {
          start: "2026-08-09T00:00:00.000-05:00",
          end: "2026-08-16T00:00:00.000-05:00",
        },
        getStore,
      ),
    ).resolves.toBe(false);
  });

  it("ignores non-demo events inside the range", async () => {
    getAllEvents.mockResolvedValueOnce([
      createMockLocalEventRecord(
        {
          schedule: EventScheduleSchema.parse({
            kind: "timed",
            start: "2026-07-27T10:00:00.000-05:00",
            end: "2026-07-27T11:00:00.000-05:00",
            timeZone: "America/Chicago",
          }),
        },
        false,
      ),
    ]);

    await expect(
      hasDemoEvents(
        {
          start: "2026-07-26T00:00:00.000-05:00",
          end: "2026-08-02T00:00:00.000-05:00",
        },
        getStore,
      ),
    ).resolves.toBe(false);
  });

  it("matches all-day demo events with exclusive range end", async () => {
    getAllEvents.mockResolvedValueOnce([
      createMockLocalEventRecord(
        {
          schedule: EventScheduleSchema.parse({
            kind: "allDay",
            start: "2026-07-27",
            end: "2026-07-28",
          }),
        },
        true,
      ),
    ]);

    await expect(
      hasDemoEvents(
        {
          start: "2026-07-26T00:00:00.000-05:00",
          end: "2026-08-02T00:00:00.000-05:00",
        },
        getStore,
      ),
    ).resolves.toBe(true);
  });
});

describe("clearDemoEvents", () => {
  beforeEach(() => {
    getAllEvents.mockClear();
    deleteEvent.mockClear();
    invalidateQueries.mockClear();
  });

  it("deletes only demo events and invalidates the events query", async () => {
    const demo = createMockLocalEventRecord({}, true);
    const user = createMockLocalEventRecord({}, false);
    getAllEvents.mockResolvedValueOnce([demo, user]);

    const removed = await clearDemoEvents(
      { invalidateQueries } as never,
      getStore,
    );

    expect(removed).toBe(1);
    expect(deleteEvent).toHaveBeenCalledTimes(1);
    expect(deleteEvent).toHaveBeenCalledWith(demo.id);
    expect(invalidateQueries).toHaveBeenCalledTimes(1);
  });
});
