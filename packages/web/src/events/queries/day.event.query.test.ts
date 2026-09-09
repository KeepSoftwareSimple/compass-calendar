import { EventIdSchema } from "@core/types/domain-primitives";
import { EventScheduleSchema } from "@core/types/event.contracts";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { composeOccurrenceId } from "@core/util/occurrence-id";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { toUTCOffset } from "@web/common/utils/datetime/web.date.util";
import { type EventRepository } from "@web/events/repositories/event.repository.types";
import { fetchDayEvents } from "./day.event.query";
import { describe, expect, it, mock } from "bun:test";

/** Same shape as dayEventQueryRange, without importing the hook module. */
const dayRange = (date: Dayjs) => ({
  startDate: toUTCOffset(date.startOf("day")),
  endDate: toUTCOffset(date.add(1, "day").startOf("day")),
});

const mondayAllDay = createMockEvent({
  content: { kind: "details", title: "AW-0-#", description: "" },
  schedule: EventScheduleSchema.parse({
    kind: "allDay",
    start: "2026-08-10",
    end: "2026-08-11",
  }),
});

describe("fetchDayEvents remote Sync startAt skew", () => {
  it("pads the Sync request and keeps Monday all-day only on Monday (Denver)", async () => {
    const list = mock(async () => [mondayAllDay]);
    const repository = { list } as unknown as EventRepository;

    const sunday = dayjs.tz("2026-08-09 12:00", "America/Denver");
    const monday = dayjs.tz("2026-08-10 12:00", "America/Denver");
    const sundayRange = dayRange(sunday);
    const mondayRange = dayRange(monday);

    const sundayResult = await fetchDayEvents(
      sundayRange,
      repository,
      "remote",
    );
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "range",
        start: toUTCOffset(dayjs(sundayRange.startDate).subtract(1, "day")),
        end: toUTCOffset(dayjs(sundayRange.endDate).add(1, "day")),
      }),
    );
    expect(sundayResult.ids).toEqual([]);

    list.mockClear();
    const mondayResult = await fetchDayEvents(
      mondayRange,
      repository,
      "remote",
    );
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "range",
        start: toUTCOffset(dayjs(mondayRange.startDate).subtract(1, "day")),
        end: toUTCOffset(dayjs(mondayRange.endDate).add(1, "day")),
      }),
    );
    expect(mondayResult.ids).toEqual([mondayAllDay.id]);
    expect(mondayResult.entities[mondayAllDay.id]?.content).toMatchObject({
      title: "AW-0-#",
    });
  });

  it("keeps a series base whose first occurrence predates the window", async () => {
    const base = createMockEvent({
      id: EventIdSchema.parse("aaaaaaaaaaaaaaaaaaaaaaaa"),
      content: { kind: "details", title: "My Birthday", description: "" },
      schedule: EventScheduleSchema.parse({
        kind: "allDay",
        start: "2024-09-14",
        end: "2024-09-15",
      }),
      recurrence: { kind: "series", rules: ["RRULE:FREQ=YEARLY"] },
    });
    const occurrence = createMockEvent({
      id: EventIdSchema.parse(
        composeOccurrenceId({
          eventId: base.id,
          recurrenceId: "2026-09-14T00:00:00.000Z",
        }),
      ),
      content: { kind: "details", title: "My Birthday", description: "" },
      schedule: EventScheduleSchema.parse({
        kind: "allDay",
        start: "2026-09-14",
        end: "2026-09-15",
      }),
      recurrence: { kind: "occurrence", seriesId: base.id },
    });
    const staleSingle = createMockEvent({
      schedule: EventScheduleSchema.parse({
        kind: "allDay",
        start: "2024-09-14",
        end: "2024-09-15",
      }),
    });
    // A series whose only instance sits in the padded day outside the window
    // brings its base along from Sync, but neither belongs to this day.
    const paddedBase = createMockEvent({
      id: EventIdSchema.parse("bbbbbbbbbbbbbbbbbbbbbbbb"),
      schedule: EventScheduleSchema.parse({
        kind: "allDay",
        start: "2020-01-15",
        end: "2020-01-16",
      }),
      recurrence: { kind: "series", rules: ["RRULE:FREQ=MONTHLY"] },
    });
    const paddedOccurrence = createMockEvent({
      id: EventIdSchema.parse(
        composeOccurrenceId({
          eventId: paddedBase.id,
          recurrenceId: "2026-09-15T00:00:00.000Z",
        }),
      ),
      schedule: EventScheduleSchema.parse({
        kind: "allDay",
        start: "2026-09-15",
        end: "2026-09-16",
      }),
      recurrence: { kind: "occurrence", seriesId: paddedBase.id },
    });
    const list = mock(async () => [
      occurrence,
      paddedOccurrence,
      base,
      paddedBase,
      staleSingle,
    ]);
    const repository = { list } as unknown as EventRepository;

    const result = await fetchDayEvents(
      dayRange(dayjs.tz("2026-09-14 12:00", "America/Denver")),
      repository,
      "remote",
    );

    expect(result.ids).toEqual([occurrence.id, base.id]);
    expect(result.entities[base.id]?.schedule).toEqual(base.schedule);
  });

  it("does not pad or call the repository for an empty calendarIds list", async () => {
    const list = mock(async () => [mondayAllDay]);
    const repository = { list } as unknown as EventRepository;
    const monday = dayjs.tz("2026-08-10 12:00", "America/Denver");

    const result = await fetchDayEvents(
      { ...dayRange(monday), calendarIds: [] },
      repository,
      "remote",
    );

    expect(list).not.toHaveBeenCalled();
    expect(result.ids).toEqual([]);
  });
});
