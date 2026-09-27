import { waitFor } from "@testing-library/react";
import { EventScheduleSchema } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { toUTCOffset } from "@web/common/utils/datetime/web.date.util";
import * as realDayQuery from "@web/events/queries/day.event.query";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { normalizeEventList } from "@web/events/queries/event.query.normalize";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const dayEvent = createMockEvent({
  schedule: EventScheduleSchema.parse({
    kind: "timed",
    start: "2025-11-12T09:00:00.000Z",
    end: "2025-11-12T10:00:00.000Z",
    timeZone: "UTC",
  }),
});

const fetchDayEvents = mock(async () => normalizeEventList([dayEvent]));

mockModuleForFile("@web/events/queries/day.event.query", realDayQuery, {
  fetchDayEvents,
});

const { renderHook } =
  require("@web/__tests__/__mocks__/mock.render") as typeof import("@web/__tests__/__mocks__/mock.render");
const { createCompassQueryClient } =
  require("@web/api/query-client") as typeof import("@web/api/query-client");
const { useDayEventsQuery } =
  require("@web/events/queries/useDayEventsQuery") as typeof import("@web/events/queries/useDayEventsQuery");

const dayRange = (date = "2025-11-12") => {
  const start = dayjs.utc(`${date}T00:00:00Z`);
  return {
    startDate: toUTCOffset(start),
    endDate: toUTCOffset(start.add(1, "day")),
  };
};

describe("useDayEventsQuery", () => {
  beforeEach(() => {
    fetchDayEvents.mockClear();
  });

  it("returns fetched day events", async () => {
    const queryClient = createCompassQueryClient();

    const result = renderHook(() => useDayEventsQuery(dayRange()), {
      queryClient,
    });

    await waitFor(() => {
      expect(result.result.current.data?.ids).toEqual([dayEvent.id]);
    });
  });

  it("serves overlapping placeholder data from a cached week while fetching", async () => {
    const queryClient = createCompassQueryClient();
    const weekStart = dayjs.utc("2025-11-10T00:00:00Z");
    const weekEnd = weekStart.add(6, "day").endOf("day");
    const event = createMockEvent({
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: "2025-11-12T09:00:00.000Z",
        end: "2025-11-12T10:00:00.000Z",
        timeZone: "UTC",
      }),
    });
    queryClient.setQueryData(
      eventQueryKeys.week({
        source: "local",
        start: toUTCOffset(weekStart),
        end: toUTCOffset(weekEnd),
      }),
      normalizeEventList([event]),
    );

    const result = renderHook(() => useDayEventsQuery(dayRange("2025-11-12")), {
      queryClient,
    });

    expect(result.result.current.data?.ids).toEqual([event.id]);
    expect(result.result.current.isPlaceholderData).toBe(true);
    expect(result.result.current.isPending).toBe(false);
  });

  it("serves an empty placeholder for a day with no events inside a cached week", async () => {
    const queryClient = createCompassQueryClient();
    const weekStart = dayjs.utc("2025-11-10T00:00:00Z");
    const weekEnd = weekStart.add(6, "day").endOf("day");
    const event = createMockEvent({
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: "2025-11-11T09:00:00.000Z",
        end: "2025-11-11T10:00:00.000Z",
        timeZone: "UTC",
      }),
    });
    queryClient.setQueryData(
      eventQueryKeys.week({
        source: "local",
        start: toUTCOffset(weekStart),
        end: toUTCOffset(weekEnd),
      }),
      normalizeEventList([event]),
    );

    const result = renderHook(() => useDayEventsQuery(dayRange("2025-11-14")), {
      queryClient,
    });

    expect(result.result.current.data).toEqual({ ids: [], entities: {} });
    expect(result.result.current.isPlaceholderData).toBe(true);
    expect(result.result.current.isPending).toBe(false);
  });
});
