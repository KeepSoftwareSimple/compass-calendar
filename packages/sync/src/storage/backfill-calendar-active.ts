import { type Db } from "mongodb";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";

// Stamp calendarActive onto events resources written before the field
// existed, from provider_calendars.active. Rows that already hold the field
// are left alone: discovery mirrors live (de)activation, and a missing
// field is the only gap this has to close. Orphan resources (no calendar
// row) stamp false so they stay out of the stale-event finders.
export async function backfillCalendarActive(db: Db): Promise<number> {
  const resources = db.collection(SYNC_COLLECTIONS.syncResources);
  const missing = await resources.countDocuments({
    resourceKind: "events",
    calendarActive: { $exists: false },
  });
  if (missing === 0) return 0;

  await resources
    .aggregate([
      {
        $match: {
          resourceKind: "events",
          calendarActive: { $exists: false },
        },
      },
      {
        $lookup: {
          from: SYNC_COLLECTIONS.providerCalendars,
          localField: "calendarId",
          foreignField: "_id",
          as: "_calendar",
        },
      },
      {
        $project: {
          calendarActive: {
            $ifNull: [{ $arrayElemAt: ["$_calendar.active", 0] }, false],
          },
        },
      },
      {
        $merge: {
          into: SYNC_COLLECTIONS.syncResources,
          on: "_id",
          whenMatched: "merge",
          whenNotMatched: "discard",
        },
      },
    ])
    .toArray();

  return missing;
}
