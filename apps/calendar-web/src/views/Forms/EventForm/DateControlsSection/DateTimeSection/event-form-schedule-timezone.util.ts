import { type GridEventDraft } from "@web/events/event-draft.types";
import { scheduleTimeZoneFromDraft } from "@web/events/grid-event-draft.adapter";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";

/** Zone stored on save: keep the event's own zone unless this is a new draft. */
export function timedOutputTimeZoneForDraft(
  draft: GridEventDraft,
): string | undefined {
  const schedule = draft.values.schedule;
  if (schedule.kind !== "timed") return undefined;
  if (draft.kind === "edit") {
    return scheduleTimeZoneFromDraft(draft);
  }
  return getEffectiveTimeZone();
}
