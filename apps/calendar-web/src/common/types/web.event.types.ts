import { z } from "zod/v4";
import { ValidatedCompassEventSchema } from "@core/types/compass-event.contracts";
import { CalendarIdSchema } from "@core/types/domain-primitives";
import {
  AttendeeSchema,
  ConferenceSchema,
  OrganizerSchema,
} from "@core/types/event-attendance.contracts";
import {
  EventColorSlotSchema,
  OptionalHexEventColorSchema,
} from "@core/types/event-color.contracts";

/** Event category, based on its display type */
export enum Categories_Event {
  ALLDAY = "allday",
  TIMED = "timed",
}

/** Scope of application for changes made to recurring event instances */
export enum RecurringEventUpdateScope {
  THIS_EVENT = "This Event",
  THIS_AND_FOLLOWING_EVENTS = "This and Following Events",
  ALL_EVENTS = "All Events",
}

// Another of the user's calendars the same meeting also exists on (see
// merge-duplicate-copies.ts). Display-only: the card paints an accent
// gradient from these colors and names them in its label. `label` is the
// other account's email when the copy is on a different account, else that
// calendar's name.
const DuplicateCopySchema = z.object({
  label: z.string(),
  backgroundColor: z.string(),
});
export type DuplicateCopy = z.infer<typeof DuplicateCopySchema>;

const WebEventSchema = ValidatedCompassEventSchema.extend({
  recurrence: z
    .object({
      rule: z.array(z.string()).nullable().optional(),
      eventId: z.string().optional(),
    })
    .optional(),
  order: z.number().optional(),
});
export type WebEvent = z.infer<typeof WebEventSchema>;

// Display projection of Event for grid cards (layout + joined calendar
// metadata). Field names stay CompassEvent-shaped so existing card
// renderers can read `_id` / `startDate` / `isAllDay` without a nested wrap.
const GridEventSchema = WebEventSchema.extend({
  hasFlipped: z.boolean().optional(),
  isOpen: z.boolean().optional(),
  row: z.number().optional(),
  position: z.object({
    isOverlapping: z.boolean(),
    totalEventsInGroup: z.number().default(1),
    widthMultiplier: z.number(), // EG: 0.5 for half width
    horizontalOrder: z.number(),
    dragOffset: z.object({ x: z.number(), y: z.number() }),
    initialX: z.number().nullable(),
    initialY: z.number().nullable(),
  }),
  calendarId: CalendarIdSchema.optional(),
  isBusy: z.boolean().optional(),
  /** Provider-owned event: schedule follows the provider, details editable. */
  isProviderManaged: z.literal(true).optional(),
  isDemo: z.boolean().optional(),
  /** Timed event shown in the all-day row because it spans midnight. */
  isTimedMultiDayDisplay: z.boolean().optional(),
  // Optional Google-mapped event color tag. Joined like calendarId — not part
  // of CompassEvent — so cards can paint a per-event fill without widening
  // the shared core type.
  color: EventColorSlotSchema.optional(),
  // A provider custom color (e.g. a Google event label) with no Compass slot
  // equivalent. Takes precedence over `color` when both are somehow present.
  colorHex: OptionalHexEventColorSchema,
  // The meeting also exists on these other calendars; this card is the
  // surviving copy of a duplicate merge. Joined like isDemo above.
  otherCopies: z.array(DuplicateCopySchema).optional(),
  // Read-only, provider-sourced. Joined like calendarId/color above.
  location: z.string().nullable().optional(),
  organizer: OrganizerSchema.nullable().optional(),
  attendees: z.array(AttendeeSchema).readonly().optional(),
  conference: ConferenceSchema.nullable().optional(),
});
export type GridEvent = z.infer<typeof GridEventSchema>;
