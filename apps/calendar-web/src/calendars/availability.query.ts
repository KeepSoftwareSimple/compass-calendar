import { queryOptions, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId } from "@core/types/domain-primitives";
import { AvailabilityApi } from "@web/calendars/availability.api";
import { useCalendarsQuery } from "@web/calendars/calendar.query";

const AVAILABILITY_STALE_TIME_MS = 5 * 60_000;

export interface AvailabilityRange {
  start: string;
  end: string;
}

/**
 * The calendars whose busy time is worth querying: active, currently
 * VISIBLE, and freeBusyReader specifically -
 * an owner/writer/reader calendar already surfaces its busy time as real
 * synced events, so re-querying free/busy for it here would just double it
 * up. Exported standalone (not inlined into the hook below) so a test
 * can derive the exact same id set - and therefore the exact same query key -
 * from a seeded calendars list without duplicating this filter.
 */
export function deriveAvailabilityCalendarIds(
  calendars: Calendar[] | undefined,
): CalendarId[] {
  if (!calendars) return [];

  return calendars
    .filter(
      (calendar) =>
        calendar.isActive &&
        calendar.isVisible &&
        calendar.access === "freeBusyReader",
    )
    .map((calendar) => calendar.id);
}

export function availabilityQueryOptions({
  calendarIds,
  start,
  end,
}: AvailabilityRange & { calendarIds: CalendarId[] }) {
  return queryOptions({
    queryKey: ["availability", { calendarIds, start, end }] as const,
    queryFn: () => AvailabilityApi.query({ calendarIds, start, end }),
    enabled: calendarIds.length > 0,
    staleTime: AVAILABILITY_STALE_TIME_MS,
  });
}

/**
 * Renders busy blocks best-effort only (packet 08 phase 4; A7): there are no
 * push notifications for free/busy, so a short staleTime plus TanStack's
 * default refetch-on-window-focus is the whole freshness story here - no
 * polling loop, no SSE wiring. calendarIds are derived from the calendars
 * query, so hiding a calendar re-keys this query naturally (the hidden
 * calendar just stops appearing in calendarIds) with zero cache surgery.
 */
export function useAvailabilityQuery({ start, end }: AvailabilityRange) {
  const { data: calendars } = useCalendarsQuery();
  const calendarIds = useMemo(
    () => deriveAvailabilityCalendarIds(calendars),
    [calendars],
  );

  return useQuery(availabilityQueryOptions({ calendarIds, start, end }));
}
