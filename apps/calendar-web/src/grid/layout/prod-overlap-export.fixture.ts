import { Origin } from "@core/constants/core.constants";
import { CalendarIdSchema, EventIdSchema } from "@core/types/domain-primitives";
import { type EventSchedule } from "@core/types/event.contracts";
import { createMockEvent } from "@web/__tests__/utils/factories/event.factory";
import { type GridEvent } from "@web/common/types/web.event.types";
import { deriveCalendarEventViewModel } from "@web/events/queries/event.view-model";

/** Scrubbed row shape from `prod-overlap-export` (packages/scripts). */
export type ProdOverlapExportInstance = {
  eventId: string;
  calendarId: string;
  label: string;
  schedule: EventSchedule;
  recurrence: ReturnType<typeof createMockEvent>["recurrence"];
  color?: string;
  colorHex?: string | null;
};

/** Map scrubbed prod export rows through the same view-model path as the week grid. */
export const gridEventsFromProdOverlapExport = (
  instances: ProdOverlapExportInstance[],
): GridEvent[] => {
  const events = instances.map((instance) => {
    if (instance.schedule.kind !== "timed") {
      throw new Error(`expected timed schedule for ${instance.label}`);
    }
    return createMockEvent({
      id: EventIdSchema.parse(instance.eventId),
      calendarId: CalendarIdSchema.parse(instance.calendarId),
      content: {
        kind: "details",
        title: instance.label,
        description: "",
      },
      schedule: instance.schedule,
      recurrence: instance.recurrence,
    });
  });

  const ids = events.map((event) => event.id);
  const entities = Object.fromEntries(events.map((event) => [event.id, event]));
  return deriveCalendarEventViewModel({ entities, ids }).timedEvents.map(
    (gridEvent) => ({ ...gridEvent, origin: Origin.COMPASS }),
  );
};
