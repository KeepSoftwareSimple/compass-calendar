import { type QueryClient } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import dayjs from "@core/util/date/dayjs";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realDayQuery from "@web/events/queries/day.event.query";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const fetchDayEvents = mock(async () => ({
  ids: ["event-1"],
  entities: {
    "event-1": {
      _id: "event-1",
      title: "Focus",
      startDate: "2025-11-11T09:00:00",
      endDate: "2025-11-11T10:00:00",
    },
  },
}));

mockModuleForFile("@web/events/queries/day.event.query", realDayQuery, {
  fetchDayEvents,
});

const { renderHook } =
  require("@web/__tests__/__mocks__/mock.render") as typeof import("@web/__tests__/__mocks__/mock.render");
const { createCompassQueryClient } =
  require("@web/api/query-client") as typeof import("@web/api/query-client");
const { useDayEvents } =
  require("@web/views/Day/hooks/events/useDayEvents") as typeof import("@web/views/Day/hooks/events/useDayEvents");
const { dayEventQueryRange } =
  require("@web/views/Day/util/day-window.util") as typeof import("@web/views/Day/util/day-window.util");

describe("useDayEvents", () => {
  beforeEach(() => {
    fetchDayEvents.mockClear();
  });

  // Source-agnostic: the active repository source can be "local" or "remote"
  // depending on process-wide auth state, so match cache entries by their
  // date-range metadata (like the read hooks' own keys do) rather than
  // asserting a specific source.
  const findDayEntry = (queryClient: QueryClient, date: dayjs.Dayjs) => {
    const { startDate, endDate } = dayEventQueryRange(date);
    const match = queryClient
      .getQueriesData({ queryKey: eventQueryKeys.scope("day") })
      .find(([key]) => {
        const metadata = key[2] as { start?: string; end?: string } | undefined;
        return metadata?.start === startDate && metadata?.end === endDate;
      });
    return match?.[1];
  };

  // Pins an explicit offset zone (the machine's may be UTC, where the
  // correct and incorrect formats coincide) so a return to .utc(true), which
  // shifted the window off local midnight, fails here.
  it("keeps the local offset so evening events stay inside the day window", () => {
    const date = dayjs.tz("2026-07-16 12:00", "America/Denver");
    const { startDate, endDate } = dayEventQueryRange(date);

    const eveningEvent = dayjs.tz("2026-07-16 21:00", "America/Denver");
    expect(eveningEvent.valueOf()).toBeGreaterThanOrEqual(
      Date.parse(startDate),
    );
    expect(eveningEvent.valueOf()).toBeLessThan(Date.parse(endDate));
  });

  it("fetches day events into the query cache", async () => {
    const queryClient = createCompassQueryClient();
    // Local-mode, like the route loader hands the hook (see loaders.test.ts).
    const date = dayjs("2025-11-11T00:00:00.000");

    renderHook(() => useDayEvents(date), { queryClient });

    await waitFor(() => {
      expect(findDayEntry(queryClient, date)).toEqual(
        expect.objectContaining({ ids: ["event-1"] }),
      );
    });
    // Also prefetches the adjacent days (see usePrefetchAdjacentEvents).
    await waitFor(() => {
      expect(findDayEntry(queryClient, date.subtract(1, "day"))).toEqual(
        expect.objectContaining({ ids: ["event-1"] }),
      );
      expect(findDayEntry(queryClient, date.add(1, "day"))).toEqual(
        expect.objectContaining({ ids: ["event-1"] }),
      );
    });
  });

  it("re-fetches with a new key when the date changes", async () => {
    const queryClient = createCompassQueryClient();
    const initialDate = dayjs("2025-11-11T00:00:00.000");

    const { rerender } = renderHook(({ date }) => useDayEvents(date), {
      initialProps: { date: initialDate },
      queryClient,
    });

    await waitFor(() => {
      expect(findDayEntry(queryClient, initialDate)).toBeDefined();
    });

    const nextDate = initialDate.add(1, "day");
    rerender({ date: nextDate });

    await waitFor(() => {
      expect(findDayEntry(queryClient, nextDate)).toEqual(
        expect.objectContaining({ ids: ["event-1"] }),
      );
    });
  });
});
