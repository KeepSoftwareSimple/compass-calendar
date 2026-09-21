import { type CompassEvent } from "@core/types/compass-event.contracts";
import { type Event } from "@core/types/event.contracts";

// Grid cards and the draft adapter both project Event recurrence onto the
// CompassEvent-shaped `recurrence` field. An occurrence's own pointer has no
// rule; opening one in the form reads as non-recurring unless the caller
// resolves the series base and passes those rules through.
export function gridRecurrenceFromEvent(
  event: Event,
  seriesRules?: readonly string[],
): CompassEvent["recurrence"] {
  return event.recurrence.kind === "series"
    ? { rule: [...event.recurrence.rules], eventId: event.id }
    : event.recurrence.kind === "occurrence"
      ? {
          eventId: event.recurrence.seriesId,
          ...(seriesRules?.length ? { rule: [...seriesRules] } : {}),
        }
      : undefined;
}
