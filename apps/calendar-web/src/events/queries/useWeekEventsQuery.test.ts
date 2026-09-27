import { waitFor } from "@testing-library/react";
import { EventScheduleSchema } from "@core/types/event.contracts";
import dayjs from "@core/util/date/dayjs";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { toUTCOffset } from "@web/common/utils/datetime/web.date.util";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { normalizeEventList } from "@web/events/queries/event.query.normalize";
import * as realWeekQuery from "@web/events/queries/week.event.query";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const weekEvent = createMockEvent({
  schedule: EventScheduleSchema.parse({
    kind: "timed",
    start: "2025-11-10T09:00:00.000Z",
    end: "2025-11-10T10:00:00.000Z",
    timeZone: "UTC",
  }),
});

const fetchWeekEvents = mock(async () => normalizeEventList([weekEvent]));

mockModuleForFile("@web/events/queries/week.event.query", realWeekQuery, {
  fetchWeekEvents,
});

const { renderHook } =
  require("@web/__tests__/__mocks__/mock.render") as typeof import("@web/__tests__/__mocks__/mock.render");
const { createCompassQueryClient } =
  require("@web/api/query-client") as typeof import("@web/api/query-client");
const { useWeekEventsQuery } =
  require("@web/events/queries/useWeekEventsQuery") as typeof import("@web/events/queries/useWeekEventsQuery");

const range = () => {
  const start = dayjs.utc("2025-11-10T00:00:00Z");
  return { startOfView: start, endOfView: start.endOf("week") };
};

describe("useWeekEventsQuery", () => {
  beforeEach(() => {
    fetchWeekEvents.mockClear();
  });

  it("returns fetched week events without syncing Redux", async () => {
    const queryClient = createCompassQueryClient();

    const result = renderHook(() => useWeekEventsQuery(range()), {
      queryClient,
    });

    await waitFor(() => {
      expect(result.result.current.data?.ids).toEqual([weekEvent.id]);
    });
  });

  it("serves a cached remount from cache without a second fetch", async () => {
    const queryClient = createCompassQueryClient();

    const first = renderHook(() => useWeekEventsQuery(range()), {
      queryClient,
    });
    await waitFor(() => {
      expect(first.result.current.isSuccess).toBe(true);
    });
    first.unmount();
    const callsAfterFirst = fetchWeekEvents.mock.calls.length;

    // Same key within staleTime → cache hit, no network.
    const second = renderHook(() => useWeekEventsQuery(range()), {
      queryClient,
    });
    await waitFor(() => {
      expect(second.result.current.data?.ids).toEqual([weekEvent.id]);
    });
    expect(fetchWeekEvents.mock.calls.length).toBe(callsAfterFirst);
  });

  it("returns query error when the fetch rejects", async () => {
    // Stay rejected for the whole test — Strict Mode remounts would
    // otherwise consume a one-shot mock and leave a successful retry.
    fetchWeekEvents.mockImplementation(async () => {
      throw new Error("boom");
    });
    const queryClient = createCompassQueryClient();

    const result = renderHook(() => useWeekEventsQuery(range()), {
      queryClient,
    });

    await waitFor(() => {
      expect(result.result.current.error?.message).toBe("boom");
    });

    fetchWeekEvents.mockImplementation(async () =>
      normalizeEventList([weekEvent]),
    );
  });

  it("serves overlapping placeholder data from cache while fetching a shifted range", async () => {
    const queryClient = createCompassQueryClient();
    const start = dayjs.utc("2025-11-10T00:00:00Z");
    const end = start.add(6, "day").endOf("day");
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
        start: toUTCOffset(start),
        end: toUTCOffset(end),
      }),
      normalizeEventList([event]),
    );

    const shiftedStart = start.add(1, "day");
    const shiftedEnd = shiftedStart.add(6, "day").endOf("day");

    const result = renderHook(
      () =>
        useWeekEventsQuery({
          startOfView: shiftedStart,
          endOfView: shiftedEnd,
        }),
      { queryClient },
    );

    expect(result.result.current.data?.ids).toEqual([event.id]);
    expect(result.result.current.isPlaceholderData).toBe(true);
  });

  it("keeps already displayed events when a refresh fails", async () => {
    const queryClient = createCompassQueryClient();
    const first = renderHook(() => useWeekEventsQuery(range()), {
      queryClient,
    });
    await waitFor(() => {
      expect(first.result.current.isSuccess).toBe(true);
    });

    fetchWeekEvents.mockImplementation(async () => {
      throw new Error("boom");
    });

    await first.result.current.refetch();

    await waitFor(() => {
      expect(first.result.current.isError).toBe(true);
    });
    expect(first.result.current.data?.ids).toEqual([weekEvent.id]);
  });

  it("cancels an obsolete range read without treating it as a failure", async () => {
    const observedSignals: AbortSignal[] = [];
    fetchWeekEvents.mockImplementation((...args: unknown[]) => {
      const signal = args[3];
      if (signal instanceof AbortSignal) observedSignals.push(signal);
      return new Promise((_resolve, reject) => {
        if (!(signal instanceof AbortSignal)) return;
        signal.addEventListener("abort", () => {
          const error = new Error("The operation was aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });

    const queryClient = createCompassQueryClient();
    const result = renderHook(() => useWeekEventsQuery(range()), {
      queryClient,
    });

    await waitFor(() => {
      expect(observedSignals.length).toBeGreaterThan(0);
    });

    await queryClient.cancelQueries({
      queryKey: eventQueryKeys.scope("week"),
    });

    expect(result.result.current.isError).toBe(false);
    expect(observedSignals.some((signal) => signal.aborted)).toBe(true);
    result.unmount();
  });
});
