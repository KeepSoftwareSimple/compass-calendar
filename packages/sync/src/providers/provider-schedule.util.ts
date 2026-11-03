import { EventScheduleSchema } from "@core/types/event.contracts";
import { ProviderEventError } from "@sync/providers/provider-event.port";

/**
 * safeParse the neutral schedule so a value the contract rejects surfaces as a
 * skippable ProviderEventError, not a raw ZodError that would escape the
 * reader's per-event skip boundary and fail a whole import page.
 *
 * Every provider normalizer resolves its own start/end shape (Graph dateTime
 * pairs, Google date vs dateTime, iCal DTSTART/DTEND) and then hands the
 * neutral candidate here, so the rejection message stays identical across
 * providers.
 */
export function parseProviderSchedule(candidate: unknown) {
  const parsed = EventScheduleSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ProviderEventError(
      "unmappableSchedule",
      "Event start/end could not be resolved to a schedule",
      { cause: parsed.error },
    );
  }
  return parsed.data;
}
