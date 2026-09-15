import { EventListQuerySchema } from "@core/types/event-command.contracts";
import {
  ensureOfflineDataStoreReady,
  getOfflineDataStore,
} from "@web/common/storage/offline-data/offline-data.store.registry";
import { expandLocalEventRecords } from "@web/events/recurrence/expandLocalEventRecords";
import { normalizeLocalEventRecords } from "./event.query.normalize";
import { type NormalizedEventQueryData } from "./event.query.types";

type FetchLocalEventsPayload = { startDate: string; endDate: string };

export async function fetchLocalEventsRange(
  payload: FetchLocalEventsPayload,
): Promise<NormalizedEventQueryData> {
  if (!payload.startDate || !payload.endDate) {
    throw new Error("Event query requires startDate and endDate");
  }

  const query = EventListQuerySchema.parse({
    kind: "range",
    start: payload.startDate,
    end: payload.endDate,
  });

  // All records, not the store's range read: a series record's own schedule
  // is just its first occurrence, so range-filtering before expansion would
  // drop every series that started before the queried window.
  await ensureOfflineDataStoreReady();
  const records = await getOfflineDataStore().getAllEvents();
  return normalizeLocalEventRecords(
    expandLocalEventRecords(records, { start: query.start, end: query.end }),
  );
}
