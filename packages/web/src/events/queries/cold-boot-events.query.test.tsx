import { HttpResponse, http } from "msw";
import dayjs from "@core/util/date/dayjs";
import { act, renderHook, waitFor } from "@web/__tests__/__mocks__/mock.render";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { createMockCalendar } from "@web/__tests__/utils/factories/calendar.factory";
import { useSession } from "@web/auth/compass/session/useSession";
import { setCalendarVisibility } from "@web/calendars/calendar-visibility.store";
import { getLocalCalendarSentinelId } from "@web/calendars/local-calendar.sentinel";
import { ENV_WEB } from "@web/common/constants/env.constants";
import { toUTCOffset } from "@web/common/utils/datetime/web.date.util";
import { useDayEventsQuery } from "@web/events/queries/useDayEventsQuery";
import { useWeekEventsQuery } from "@web/events/queries/useWeekEventsQuery";
import { refreshEventRepositorySource } from "@web/events/repositories/event.repository.source.store";
import { beforeEach, describe, expect, it } from "bun:test";

const visible = createMockCalendar({ name: "Visible" });
const hidden = createMockCalendar({ name: "Hidden" });
const retired = createMockCalendar({ name: "Retired", isActive: false });
const serverCalendarIds = [visible.id, hidden.id].join(",");

function useBootWindows() {
  const session = useSession();
  const start = dayjs.utc("2026-05-18T00:00:00Z");
  const day = useDayEventsQuery({
    startDate: toUTCOffset(start),
    endDate: toUTCOffset(start.add(1, "day")),
  });
  const week = useWeekEventsQuery({
    startOfView: start,
    endOfView: start.add(7, "day"),
  });
  return { session, day, week };
}

describe("cold boot event reads", () => {
  const eventUrls: string[] = [];

  beforeEach(() => {
    eventUrls.length = 0;
    refreshEventRepositorySource(true);
    setCalendarVisibility(hidden.id, false);
    server.use(
      http.get(`${ENV_WEB.API_BASEURL}/calendars`, () =>
        HttpResponse.json({ calendars: [visible, hidden, retired] }),
      ),
      http.get(`${ENV_WEB.API_BASEURL}/event`, ({ request }) => {
        eventUrls.push(request.url);
        return HttpResponse.json({ events: [] });
      }),
    );
  });

  it("issues one range request per window with the server's active calendar ids", async () => {
    const result = renderHook(() => useBootWindows());

    await act(async () => {
      await Promise.resolve();
    });
    expect(eventUrls).toEqual([]);

    act(() => {
      result.result.current.session.setAuthenticated(true);
    });

    await waitFor(() => {
      expect(eventUrls).toHaveLength(2);
      expect(result.result.current.day.isSuccess).toBe(true);
      expect(result.result.current.week.isSuccess).toBe(true);
    });

    const sentinelId = getLocalCalendarSentinelId();
    for (const url of eventUrls) {
      const params = new URL(url).searchParams;
      expect(params.get("kind")).toBe("range");
      expect(params.get("calendarIds")).toBe(serverCalendarIds);
      expect(url).not.toContain(sentinelId);
    }

    act(() => {
      setCalendarVisibility(visible.id, false);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(eventUrls).toHaveLength(2);
  });
});
