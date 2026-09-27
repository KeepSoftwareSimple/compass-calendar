import { EventScheduleSchema } from "@core/types/event.contracts";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { type NormalizedEventQueryData } from "./event.query.types";
import { deriveCalendarEventViewModel } from "./event.view-model";

const normalized = (
  ...events: ReturnType<typeof createMockEvent>[]
): NormalizedEventQueryData => ({
  ids: events.map(({ id }) => id),
  entities: Object.fromEntries(events.map((item) => [item.id, item])),
});

describe("Event query view models", () => {
  test("derives Week and Day timed/all-day layouts", () => {
    const timed = createMockEvent();
    const allDay = createMockEvent({
      schedule: EventScheduleSchema.parse({
        kind: "allDay",
        start: "2026-07-05",
        end: "2026-07-06",
      }),
    });
    const data = normalized(timed, allDay);

    const week = deriveCalendarEventViewModel(data);
    const day = deriveCalendarEventViewModel(data);

    expect(week.timedEvents.map(({ _id }) => _id)).toEqual([timed.id]);
    expect(week.allDayEvents.map(({ _id }) => _id)).toEqual([allDay.id]);
    expect(week.rowCount).toBe(1);
    expect(day.events).toEqual([timed, allDay]);
    expect(day.timedEvents).toEqual(week.timedEvents);
  });

  test("excludes a series base from grid cards but keeps its occurrence", () => {
    const base = createMockEvent({
      recurrence: { kind: "series", rules: ["RRULE:FREQ=WEEKLY"] },
    });
    const occurrence = createMockEvent({
      recurrence: { kind: "occurrence", seriesId: base.id },
    });
    const data = normalized(base, occurrence);

    const result = deriveCalendarEventViewModel(data);

    expect(result.timedEvents.map(({ _id }) => _id)).toEqual([occurrence.id]);
    expect(result.events.map(({ id }) => id)).toEqual([base.id, occurrence.id]);
  });

  test("marks demo events from normalized demoEventIds", () => {
    const demo = createMockEvent();
    const user = createMockEvent();
    const data: NormalizedEventQueryData = {
      ...normalized(demo, user),
      demoEventIds: [demo.id],
    };

    const result = deriveCalendarEventViewModel(data);
    const demoCard = result.timedEvents.find(({ _id }) => _id === demo.id);
    const userCard = result.timedEvents.find(({ _id }) => _id === user.id);

    expect(demoCard?.isDemo).toBe(true);
    expect(userCard?.isDemo).toBe(false);
  });

  test("carries optional content.color onto grid event cards", () => {
    const colored = createMockEvent({
      content: {
        kind: "details",
        title: "Blue meeting",
        description: "",
        color: "blue",
      },
    });
    const plain = createMockEvent();
    const result = deriveCalendarEventViewModel(normalized(colored, plain));

    expect(
      result.timedEvents.find(({ _id }) => _id === colored.id)?.color,
    ).toBe("blue");
    expect(
      result.timedEvents.find(({ _id }) => _id === plain.id),
    ).not.toHaveProperty("color");
  });

  test("carries optional content.colorHex onto grid event cards", () => {
    const labeled = createMockEvent({
      content: {
        kind: "details",
        title: "Eucalyptus meeting",
        description: "",
        colorHex: "#009688",
      },
    });
    const plain = createMockEvent();
    const result = deriveCalendarEventViewModel(normalized(labeled, plain));

    expect(
      result.timedEvents.find(({ _id }) => _id === labeled.id)?.colorHex,
    ).toBe("#009688");
    expect(
      result.timedEvents.find(({ _id }) => _id === plain.id),
    ).not.toHaveProperty("colorHex");
  });

  test("returns stable empty shapes", () => {
    const week = deriveCalendarEventViewModel();
    expect(week).toEqual({
      entities: {},
      events: [],
      timedEvents: [],
      allDayEvents: [],
      rowCount: 1,
      demoEventIds: undefined,
    });
  });

  test("promotes multi-day timed events into the all-day row", () => {
    const multiDayTimed = createMockEvent({
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: "2026-07-24T08:00:00.000Z",
        end: "2026-07-25T18:00:00.000Z",
        timeZone: "UTC",
      }),
    });
    const sameDayTimed = createMockEvent();
    const data = normalized(multiDayTimed, sameDayTimed);

    const result = deriveCalendarEventViewModel(data);

    expect(result.timedEvents.map(({ _id }) => _id)).toEqual([sameDayTimed.id]);
    expect(result.allDayEvents.map(({ _id }) => _id)).toEqual([
      multiDayTimed.id,
    ]);
    const promoted = result.allDayEvents[0];
    expect(promoted?.isAllDay).toBe(true);
    expect(promoted?.isTimedMultiDayDisplay).toBe(true);
    expect(promoted?.startDate).toBe("2026-07-24");
    expect(promoted?.endDate).toBe("2026-07-26");
  });

  test("promotes midnight-to-midnight timed events into the all-day row", () => {
    const fullDayTimed = createMockEvent({
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: "2026-07-24T00:00:00.000Z",
        end: "2026-07-25T00:00:00.000Z",
        timeZone: "UTC",
      }),
    });
    const eveningToMidnight = createMockEvent({
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: "2026-07-24T22:00:00.000Z",
        end: "2026-07-25T00:00:00.000Z",
        timeZone: "UTC",
      }),
    });
    const data = normalized(fullDayTimed, eveningToMidnight);

    const result = deriveCalendarEventViewModel(data);

    expect(result.timedEvents.map(({ _id }) => _id)).toEqual([
      eveningToMidnight.id,
    ]);
    expect(result.allDayEvents.map(({ _id }) => _id)).toEqual([
      fullDayTimed.id,
    ]);
    const promoted = result.allDayEvents[0];
    expect(promoted?.isAllDay).toBe(true);
    expect(promoted?.isTimedMultiDayDisplay).toBe(true);
    expect(promoted?.startDate).toBe("2026-07-24");
    expect(promoted?.endDate).toBe("2026-07-25");
  });
});
