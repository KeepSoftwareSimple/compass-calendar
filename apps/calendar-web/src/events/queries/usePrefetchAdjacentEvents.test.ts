import { waitFor } from "@testing-library/react";
import dayjs from "@core/util/date/dayjs";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realWeekQuery from "@web/events/queries/week.event.query";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const fetchWeekEvents = mock(async () => ({
  ids: ["week-neighbor"],
  entities: {
    "week-neighbor": {
      _id: "week-neighbor",
      title: "Neighbor week event",
      startDate: "2025-11-03T09:00:00",
      endDate: "2025-11-03T10:00:00",
    },
  },
}));

mockModuleForFile("@web/events/queries/week.event.query", realWeekQuery, {
  fetchWeekEvents,
});

const { renderHook } =
  require("@web/__tests__/__mocks__/mock.render") as typeof import("@web/__tests__/__mocks__/mock.render");
const { createCompassQueryClient } =
  require("@web/api/query-client") as typeof import("@web/api/query-client");
const { eventQueryKeys } =
  require("@web/events/queries/event.query.keys") as typeof import("@web/events/queries/event.query.keys");
const { weekEventsQueryOptions } =
  require("@web/events/queries/event.query.options") as typeof import("@web/events/queries/event.query.options");
const { usePrefetchAdjacentEvents } =
  require("@web/events/queries/usePrefetchAdjacentEvents") as typeof import("@web/events/queries/usePrefetchAdjacentEvents");

const currentStart = dayjs.utc("2025-11-10T00:00:00Z");
const previousStart = currentStart.subtract(7, "day");
const nextStart = currentStart.add(7, "day");

const previous = {
  startDate: previousStart.format(),
  endDate: previousStart.endOf("week").format(),
};
const next = {
  startDate: nextStart.format(),
  endDate: nextStart.endOf("week").format(),
};

const previousKey = eventQueryKeys.week({
  source: "local",
  start: previous.startDate,
  end: previous.endDate,
});
const nextKey = eventQueryKeys.week({
  source: "local",
  start: next.startDate,
  end: next.endDate,
});
const currentKey = eventQueryKeys.week({
  source: "local",
  start: currentStart.format(),
  end: currentStart.endOf("week").format(),
});

describe("usePrefetchAdjacentEvents", () => {
  beforeEach(() => {
    fetchWeekEvents.mockClear();
  });

  it("populates the cache for the previous and next range under the read hook's own keys", async () => {
    const queryClient = createCompassQueryClient();

    renderHook(
      () => usePrefetchAdjacentEvents(weekEventsQueryOptions, previous, next),
      { queryClient },
    );

    type CachedWeekData = { ids: string[]; entities: Record<string, unknown> };
    await waitFor(() => {
      expect(queryClient.getQueryData<CachedWeekData>(previousKey)).toEqual({
        ids: ["week-neighbor"],
        entities: expect.any(Object),
      });
      expect(queryClient.getQueryData<CachedWeekData>(nextKey)).toEqual({
        ids: ["week-neighbor"],
        entities: expect.any(Object),
      });
    });
    expect(queryClient.getQueryData(currentKey)).toBeUndefined();
    expect(fetchWeekEvents.mock.calls.length).toBe(2);
  });

  it("does not refetch an already-cached, fresh adjacent range", async () => {
    const queryClient = createCompassQueryClient();

    const first = renderHook(
      () => usePrefetchAdjacentEvents(weekEventsQueryOptions, previous, next),
      { queryClient },
    );
    await waitFor(() => {
      expect(fetchWeekEvents.mock.calls.length).toBe(2);
    });
    first.unmount();

    renderHook(
      () => usePrefetchAdjacentEvents(weekEventsQueryOptions, previous, next),
      { queryClient },
    );

    // The second effect runs immediately; waiting for its first fetch would
    // only add a real-time delay without observing additional behavior.
    await Promise.resolve();
    expect(fetchWeekEvents.mock.calls.length).toBe(2);
  });
});
