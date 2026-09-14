import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { rest } from "msw";
import { type PropsWithChildren } from "react";
import dayjs from "@core/util/date/dayjs";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { createMockCalendar } from "@web/__tests__/utils/factories/calendar.factory";
import { createCompassQueryClient } from "@web/api/query-client";
import { SessionContext } from "@web/auth/compass/session/session.context";
import {
  calendarQueryKeys,
  useCalendarsQuery,
} from "@web/calendars/calendar.query";
import { setCalendarVisibility } from "@web/calendars/calendar-visibility.store";
import {
  getLocalCalendarSentinelId,
  isSynthesizedLocalCalendarList,
} from "@web/calendars/local-calendar.sentinel";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { useWeekEventsQuery } from "@web/events/queries/useWeekEventsQuery";
import { refreshEventRepositorySource } from "@web/events/repositories/event.repository.source.store";
import { beforeEach, describe, expect, it } from "bun:test";

const serverCalendarA = createMockCalendar({ name: "Work" });
const serverCalendarB = createMockCalendar({ name: "Personal" });
const serverCalendars = [serverCalendarA, serverCalendarB];

const weekRange = () => {
  const start = dayjs.utc("2025-11-10T00:00:00Z");
  return { startOfView: start, endOfView: start.endOf("week") };
};

const rangeRequestUrls: URL[] = [];

const installBootHandlers = () => {
  rangeRequestUrls.length = 0;
  server.use(
    rest.get(`${ENV_WEB.API_BASEURL}/calendars`, (_req, res, ctx) =>
      res(ctx.json({ calendars: serverCalendars })),
    ),
    rest.get(`${ENV_WEB.API_BASEURL}/event`, (req, res, ctx) => {
      if (req.url.searchParams.get("kind") === "range") {
        rangeRequestUrls.push(new URL(req.url.href));
      }
      return res(ctx.json({ events: [] }));
    }),
  );
};

const wrapperFor = (
  queryClient: ReturnType<typeof createCompassQueryClient>,
  getAuthenticated: () => boolean,
) =>
  function BootWrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <SessionContext.Provider
          value={{
            authenticated: getAuthenticated(),
            setAuthenticated: () => {},
          }}
        >
          {children}
        </SessionContext.Provider>
      </QueryClientProvider>
    );
  };

describe("cold boot events fetch", () => {
  beforeEach(() => {
    installBootHandlers();
  });

  it("keeps event read keys at 3 segments without calendarIds", () => {
    const key = eventQueryKeys.week({
      source: "remote",
      start: "2025-11-10T00:00:00.000Z",
      end: "2025-11-17T00:00:00.000Z",
    });
    expect(key).toHaveLength(3);
    expect(key[2]).toEqual({
      source: "remote",
      start: "2025-11-10T00:00:00.000Z",
      end: "2025-11-17T00:00:00.000Z",
    });
  });

  it("issues one range request per window with the server's calendar ids", async () => {
    const queryClient = createCompassQueryClient();
    act(() => refreshEventRepositorySource(true));

    const { result } = renderHook(() => useWeekEventsQuery(weekRange()), {
      wrapper: wrapperFor(queryClient, () => true),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    await waitFor(() => {
      expect(result.current.fetchStatus).toBe("idle");
    });

    expect(rangeRequestUrls).toHaveLength(1);
    const params = rangeRequestUrls[0]?.searchParams;
    expect(params?.get("kind")).toBe("range");
    const requestedIds = params?.get("calendarIds")?.split(",") ?? [];
    expect(requestedIds.sort()).toEqual(
      [serverCalendarA.id, serverCalendarB.id].sort(),
    );
    expect(requestedIds).not.toContain(getLocalCalendarSentinelId());
  });

  it("does not refetch the window when one calendar is hidden", async () => {
    const queryClient = createCompassQueryClient();
    act(() => refreshEventRepositorySource(true));

    const { result } = renderHook(() => useWeekEventsQuery(weekRange()), {
      wrapper: wrapperFor(queryClient, () => true),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.fetchStatus).toBe("idle");
    });
    expect(rangeRequestUrls).toHaveLength(1);

    act(() => {
      setCalendarVisibility(serverCalendarA.id, false);
    });

    await waitFor(() => {
      expect(result.current.fetchStatus).toBe("idle");
    });
    expect(rangeRequestUrls).toHaveLength(1);
    expect(result.current.calendarIds).toEqual(
      expect.arrayContaining([serverCalendarA.id, serverCalendarB.id]),
    );
  });

  it("drops the sentinel calendar list once auth resolves, then fetches once", async () => {
    const queryClient = createCompassQueryClient();
    let authenticated = false;

    const { result, rerender } = renderHook(
      () => ({
        calendars: useCalendarsQuery(),
        events: useWeekEventsQuery(weekRange()),
      }),
      { wrapper: wrapperFor(queryClient, () => authenticated) },
    );

    await waitFor(() => {
      expect(result.current.calendars.isSuccess).toBe(true);
    });
    expect(isSynthesizedLocalCalendarList(result.current.calendars.data)).toBe(
      true,
    );
    expect(rangeRequestUrls).toHaveLength(0);

    authenticated = true;
    act(() => refreshEventRepositorySource(true));
    rerender();

    await waitFor(() => {
      expect(result.current.events.isSuccess).toBe(true);
      expect(result.current.events.fetchStatus).toBe("idle");
    });

    expect(
      isSynthesizedLocalCalendarList(
        queryClient.getQueryData(calendarQueryKeys.all),
      ),
    ).toBe(false);
    expect(queryClient.getQueryData(calendarQueryKeys.all)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: serverCalendarA.id }),
        expect.objectContaining({ id: serverCalendarB.id }),
      ]),
    );
    expect(rangeRequestUrls).toHaveLength(1);
    const requestedIds =
      rangeRequestUrls[0]?.searchParams.get("calendarIds")?.split(",") ?? [];
    expect(requestedIds.sort()).toEqual(
      [serverCalendarA.id, serverCalendarB.id].sort(),
    );
  });
});
