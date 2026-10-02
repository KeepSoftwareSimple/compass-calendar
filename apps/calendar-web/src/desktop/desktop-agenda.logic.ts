import {
  DESKTOP_AGENDA_MAX_ITEMS,
  type DesktopAgenda,
} from "@core/types/desktop-bridge.contracts";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";

/** Debounce window for pushing agenda updates to the macOS shell. */
export const DESKTOP_AGENDA_DEBOUNCE_MS = 250;

export type DesktopAgendaCandidate = {
  _id?: string;
  title?: string;
  startDate: string;
  endDate: string;
  isDemo?: boolean;
};

/**
 * Timed events for today's local calendar day, sorted by start, capped for the
 * menu bar payload.
 */
export function buildDesktopAgenda(
  now: Dayjs,
  events: readonly DesktopAgendaCandidate[],
): DesktopAgenda {
  const dayStart = now.startOf("day");
  const dayEnd = dayStart.add(1, "day");

  return events
    .flatMap((event) => {
      if (!event._id || event.isDemo) return [];
      const start = dayjs(event.startDate);
      const end = dayjs(event.endDate);
      if (!start.isValid() || !end.isValid()) return [];
      if (!start.isBefore(dayEnd) || !end.isAfter(dayStart)) return [];
      const title = event.title?.trim() || "Untitled event";
      return [
        {
          id: event._id,
          title,
          startsAt: event.startDate,
          endsAt: event.endDate,
        },
      ];
    })
    .sort((a, b) => dayjs(a.startsAt).valueOf() - dayjs(b.startsAt).valueOf())
    .slice(0, DESKTOP_AGENDA_MAX_ITEMS);
}
