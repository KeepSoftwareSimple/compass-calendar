import { type QueryClient } from "@tanstack/react-query";
import { type Dayjs } from "@core/util/date/dayjs";
import { type OfflineDataStore } from "@web/common/storage/offline-data/offline-data.store";
import { getOfflineDataStore } from "@web/common/storage/offline-data/offline-data.store.registry";
import { toUTCOffset } from "@web/common/utils/datetime/web.date.util";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { eventMatchesRange } from "@web/events/queries/event.query.normalize";

export type DemoEventsRange = {
  start: string;
  end: string;
};

type DemoEventsReadStore = Pick<OfflineDataStore, "getAllEvents">;
type DemoEventsWriteStore = Pick<
  OfflineDataStore,
  "getAllEvents" | "deleteEvent"
>;

/** Inclusive calendar days → exclusive-end instant range for demo overlap checks. */
export function toDemoEventsRange(
  startOfView: Dayjs,
  endOfView: Dayjs,
): DemoEventsRange {
  return {
    start: toUTCOffset(startOfView.startOf("day")),
    end: toUTCOffset(endOfView.startOf("day").add(1, "day")),
  };
}

export async function hasDemoEvents(
  range?: DemoEventsRange,
  getStore: () => DemoEventsReadStore = getOfflineDataStore,
): Promise<boolean> {
  const records = await getStore().getAllEvents();
  if (!range) {
    return records.some((record) => record.isDemo);
  }

  return records.some(
    (record) =>
      record.isDemo && eventMatchesRange(record.event, range.start, range.end),
  );
}

export async function clearDemoEvents(
  queryClient: QueryClient,
  getStore: () => DemoEventsWriteStore = getOfflineDataStore,
): Promise<number> {
  const store = getStore();
  const records = await store.getAllEvents();
  const demoRecords = records.filter((record) => record.isDemo);

  await Promise.all(demoRecords.map((record) => store.deleteEvent(record.id)));

  await queryClient.invalidateQueries({ queryKey: eventQueryKeys.all });

  return demoRecords.length;
}
