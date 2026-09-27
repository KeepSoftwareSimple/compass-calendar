import { eventMatchesRange } from "@web/events/queries/event.query.normalize";
import { type LocalEventRecord } from "@web/events/types/local-event.record";
import { projectSeriesMaterialization } from "./projectRecurringEdit";

/**
 * Range-read over local records with series expansion: local storage keeps
 * one record per series (no materialized instances, unlike the backend), so
 * occurrences are expanded here at read time. Instances inherit the series
 * record's demo flag; a stored record with the same composed id (an edited
 * occurrence) wins over its expanded counterpart. Mirroring the server's
 * list join, the series base record is returned only alongside its in-range
 * instances.
 */
export async function expandLocalEventRecords(
  records: readonly LocalEventRecord[],
  range: { start: string; end: string },
): Promise<LocalEventRecord[]> {
  const storedIds = new Set(records.map((record) => record.id));
  const expanded = await Promise.all(
    records.map(async (record) => {
      if (record.event.recurrence.kind !== "series") {
        return eventMatchesRange(record.event, range.start, range.end)
          ? [record]
          : [];
      }

      const { upserts } = await projectSeriesMaterialization({
        base: record.event,
        ranges: [range],
        exdates: record.exdates,
      });
      const instances = upserts
        .filter(
          (event) =>
            event.recurrence.kind === "occurrence" &&
            !storedIds.has(event.id) &&
            eventMatchesRange(event, range.start, range.end),
        )
        .map(
          (event): LocalEventRecord => ({
            version: 2,
            id: event.id,
            event,
            isDemo: record.isDemo,
          }),
        );

      return instances.length > 0 ? [record, ...instances] : [];
    }),
  );

  return expanded.flat();
}
