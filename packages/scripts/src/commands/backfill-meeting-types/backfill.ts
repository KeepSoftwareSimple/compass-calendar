import { type Collection, type Filter, ObjectId } from "mongodb";
import {
  BookingDurationMinutesSchema,
  defaultMeetingTypes,
} from "@core/types/booking.contracts";
import { type BookingPageRecord } from "@backend/booking/booking-page.record";

export type MeetingTypesBackfillChange = {
  pageId: string;
  durationMinutes: number;
};

export type MeetingTypesBackfillSkip = {
  pageId: string;
  reason: "invalid_duration";
};

export type BackfillMeetingTypesReport = {
  dryRun: boolean;
  matched: number;
  modified: number;
  skipped: MeetingTypesBackfillSkip[];
  changes: MeetingTypesBackfillChange[];
};

const missingMeetingTypes = (): Filter<BookingPageRecord> => ({
  meetingTypes: { $exists: false },
});

/**
 * Stores the one meeting type every pre-meeting-types page already reads as
 * (see `resolveBookingMeetingTypes`), so Mongo matches what the API serves.
 * Idempotent: pages that already have `meetingTypes` are never touched, and
 * each write re-checks the field is still missing.
 */
export async function backfillMeetingTypes(
  pages: Collection<BookingPageRecord>,
  options: { dryRun: boolean; batchSize: number },
): Promise<BackfillMeetingTypesReport> {
  const changes: MeetingTypesBackfillChange[] = [];
  const skipped: MeetingTypesBackfillSkip[] = [];
  let lastId: ObjectId | undefined;

  for (;;) {
    const batch = await pages
      .find(
        lastId
          ? { ...missingMeetingTypes(), _id: { $gt: lastId } }
          : missingMeetingTypes(),
      )
      .sort({ _id: 1 })
      .limit(options.batchSize)
      .project({ _id: 1, durationMinutes: 1 })
      .toArray();
    if (batch.length === 0) break;

    for (const row of batch) {
      const pageId = String(row["_id"]);
      const duration = BookingDurationMinutesSchema.safeParse(
        row["durationMinutes"],
      );
      if (!duration.success) {
        skipped.push({ pageId, reason: "invalid_duration" });
        continue;
      }
      changes.push({ pageId, durationMinutes: duration.data });
    }
    lastId = batch[batch.length - 1]?.["_id"] as ObjectId | undefined;
  }

  if (options.dryRun || changes.length === 0) {
    return {
      dryRun: options.dryRun,
      matched: changes.length,
      modified: 0,
      skipped,
      changes,
    };
  }

  let modified = 0;
  for (let i = 0; i < changes.length; i += options.batchSize) {
    const slice = changes.slice(i, i + options.batchSize);
    const result = await pages.bulkWrite(
      slice.map((change) => ({
        updateOne: {
          filter: {
            _id: new ObjectId(change.pageId),
            ...missingMeetingTypes(),
          },
          update: {
            $set: {
              meetingTypes: defaultMeetingTypes(
                BookingDurationMinutesSchema.parse(change.durationMinutes),
              ),
            },
          },
        },
      })),
      { ordered: false },
    );
    modified += result.modifiedCount;
  }

  return {
    dryRun: false,
    matched: changes.length,
    modified,
    skipped,
    changes,
  };
}
