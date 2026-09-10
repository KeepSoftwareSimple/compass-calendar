import { z } from "zod/v4";
import { EventIdSchema } from "@core/types/domain-primitives";

// Per-user view preference for hiding an event on the calendar. Never a
// field on the event itself: EventSchema stays untouched, and the backend
// stores one hiddenEvent row per (user, event id).

export const HiddenEventIdsResponseSchema = z.strictObject({
  hiddenEventIds: z.array(EventIdSchema),
});
export type HiddenEventIdsResponse = z.infer<
  typeof HiddenEventIdsResponseSchema
>;

export const SetEventHiddenInputSchema = z.strictObject({
  eventId: EventIdSchema,
  hidden: z.boolean(),
});
export type SetEventHiddenInput = z.infer<typeof SetEventHiddenInputSchema>;
