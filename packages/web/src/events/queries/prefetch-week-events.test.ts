import dayjs from "@core/util/date/dayjs";
import { createMockCalendar } from "@web/__tests__/utils/factories/calendar.factory";
import { createCompassQueryClient } from "@web/api/query-client";
import { calendarQueryKeys } from "@web/calendars/calendar.query";
import { ROOT_ROUTES } from "@web/common/constants/routes";
import { weekEventsViewQueryOptions } from "@web/events/queries/event.query.options";
import {
  prefetchWeekEventsQuery,
  weekDateStringFromPathname,
} from "@web/events/queries/prefetch-week-events";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { weekEventsQueryWindow } from "@web/views/Week/util/week-window.util";
import { describe, expect, it, spyOn } from "bun:test";

describe("weekDateStringFromPathname", () => {
  it("reads the dated week path and ignores the bare week route", () => {
    expect(weekDateStringFromPathname(`${ROOT_ROUTES.WEEK}/2026-05-18`)).toBe(
      "2026-05-18",
    );
    expect(weekDateStringFromPathname(ROOT_ROUTES.WEEK)).toBeUndefined();
  });
});

describe("prefetchWeekEventsQuery", () => {
  it("starts the same week-events query the view hook will read", () => {
    const client = createCompassQueryClient();
    client.setQueryData(calendarQueryKeys.all, [createMockCalendar()]);
    const prefetchQuery = spyOn(client, "prefetchQuery").mockResolvedValue(
      undefined as never,
    );

    try {
      prefetchWeekEventsQuery({
        dateString: "2026-05-18",
        authenticated: true,
        client,
      });

      const { startOfView, endOfView } = weekEventsQueryWindow(
        dayjs.tz("2026-05-18", getEffectiveTimeZone()),
      );
      const expected = weekEventsViewQueryOptions({
        startOfView,
        endOfView,
        source: "remote",
      });

      expect(prefetchQuery).toHaveBeenCalledTimes(1);
      expect(prefetchQuery.mock.calls[0]?.[0]).toMatchObject({
        queryKey: expected.queryKey,
      });
    } finally {
      prefetchQuery.mockRestore();
    }
  });
});
