import { Origin } from "@core/constants/core.constants";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import { type GridEvent } from "@web/common/types/web.event.types";
import { gridEventDefaultPosition } from "@web/common/utils/event/event.util";

const denver = "America/Denver";

/**
 * Reconstructed Sat Oct 31 2026 (America/Denver) grid payloads matching Tyler's
 * prod week column (read-only prod export was unavailable in this environment).
 * Mixed encodings mirror Outlook/Google sync: Z instants, offset wall times, and
 * naive wall-clock end strings on imported cards.
 */
export const tylerOct31OverlapGridEvents = (): GridEvent[] => [
  {
    _id: "tyler-fall-festival",
    calendarId: CalendarIdSchema.parse("507f1f77bcf86cd799439013"),
    description: "",
    endDate: "2026-10-31T17:30:00-06:00",
    isAllDay: false,
    origin: Origin.COMPASS,
    position: gridEventDefaultPosition,
    recurrence: undefined,
    startDate: "2026-10-31T15:00:00-06:00",
    timeZone: denver,
    title: "H: Fall Festival | Venture Church",
    user: "",
  },
  {
    _id: "tyler-compass-demo",
    calendarId: CalendarIdSchema.parse("507f1f77bcf86cd799439014"),
    description: "",
    endDate: "2026-10-31T23:00:00.000Z",
    isAllDay: false,
    origin: Origin.COMPASS,
    position: gridEventDefaultPosition,
    recurrence: undefined,
    startDate: "2026-10-31T15:30:00-06:00",
    title: "Record Compass demo",
    user: "",
  },
  {
    _id: "tyler-update",
    description: "",
    endDate: "2026-10-31T19:00:00-06:00",
    isAllDay: false,
    origin: Origin.COMPASS,
    position: gridEventDefaultPosition,
    recurrence: { eventId: "series-update", rule: ["RRULE:FREQ=WEEKLY"] },
    startDate: "2026-10-31T18:30:00-06:00",
    timeZone: denver,
    title: "Update 4e2d",
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
    _id: "tyler-deutsch",
    calendarId: CalendarIdSchema.parse("507f1f77bcf86cd799439012"),
    description: "",
    endDate: "2026-10-31T19:30:00",
    isAllDay: false,
    origin: Origin.COMPASS,
    position: gridEventDefaultPosition,
    recurrence: undefined,
    startDate: "2026-11-01T01:00:00.000Z",
    title: "Deutsch …",
    user: "",
  },
];
