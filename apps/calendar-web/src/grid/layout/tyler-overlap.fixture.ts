import { Origin } from "@core/constants/core.constants";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { type GridEvent } from "@web/common/types/web.event.types";
import { gridEventDefaultPosition } from "@web/common/utils/event/event.util";

const denver = "America/Denver";

/**
 * Synthetic Oct 31 2026 (America/Denver) overlap matching Tyler's prod case:
 * imported "Monthly Ritual" (longer) and Outlook "Unwind" (shorter) at 7 PM,
 * plus a recurring neighbor ending at 7 PM. Grid `startDate` strings mirror
 * mixed encodings after sync: Z instant on one card, offset wall clock on the
 * other (see #4905).
 */
export const tylerOct31OverlapGridEvents = (): GridEvent[] => [
  {
    _id: "tyler-ritual",
    calendarId: CalendarIdSchema.parse("507f1f77bcf86cd799439012"),
    description: "",
    endDate: "2026-10-31T20:30:00-06:00",
    isAllDay: false,
    origin: Origin.COMPASS,
    position: gridEventDefaultPosition,
    recurrence: undefined,
    startDate: "2026-11-01T01:00:00.000Z",
    title: "Monthly Ritual",
    user: "",
  },
  {
    _id: "tyler-unwind",
    calendarId: CalendarIdSchema.parse("507f1f77bcf86cd799439011"),
    description: "",
    endDate: "2026-10-31T20:00:00-06:00",
    isAllDay: false,
    origin: Origin.COMPASS,
    position: gridEventDefaultPosition,
    recurrence: { eventId: "series-unwind", rule: ["RRULE:FREQ=WEEKLY"] },
    startDate: "2026-10-31T19:00:00-06:00",
    timeZone: denver,
    title: "Unwind",
    user: "",
  },
  {
    _id: "tyler-update",
    description: "",
    endDate: "2026-10-31T19:00:00-06:00",
    isAllDay: false,
    origin: Origin.COMPASS,
    position: gridEventDefaultPosition,
    recurrence: undefined,
    startDate: "2026-10-31T18:00:00-06:00",
    timeZone: denver,
    title: "Update 4e2d",
    user: "",
  },
];
