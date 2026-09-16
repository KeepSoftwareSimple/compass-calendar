import { Logger } from "@core/logger/winston.logger";
import mongoService from "@backend/common/services/mongo.service";

const logger = Logger("app:calendar.indexes");

export const CALENDAR_USER_ID_INDEX = "calendar_userId";

export const CALENDAR_USER_ID_LOCAL_UNIQUE_INDEX =
  "calendar_userId_local_unique";

const DUPLICATE_USER_ID_LOG_LIMIT = 10;

type DuplicateLocalCalendarUser = {
  _id: unknown;
  count: number;
};

const findDuplicateLocalCalendarUsers = async () => {
  return mongoService.calendar
    .aggregate<DuplicateLocalCalendarUser>([
      { $match: { "source.provider": "local" } },
      { $group: { _id: "$userId", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();
};

type CalendarIndex = {
  name?: string;
  key?: Record<string, unknown>;
  unique?: boolean;
  partialFilterExpression?: unknown;
};

// Databases migrated in July 2026 already carry an unnamed
// createIndex({ userId: 1 }) that Mongo called `userId_1`. Mongo rejects the
// same key under a different name (IndexOptionsConflict, code 85) and the
// backend exits on startup errors, so match the plain userId index by key
// instead of by name.
const isPlainUserIdIndex = (index: CalendarIndex): boolean =>
  JSON.stringify(index.key) === JSON.stringify({ userId: 1 }) &&
  !index.unique &&
  !index.partialFilterExpression;

const listCalendarIndexes = async (): Promise<CalendarIndex[]> => {
  try {
    return await mongoService.calendar.indexes();
  } catch (error) {
    // A fresh database has no calendar collection until the first
    // createIndex below creates it.
    if ((error as { codeName?: string }).codeName === "NamespaceNotFound") {
      return [];
    }
    throw error;
  }
};

export async function ensureCalendarIndexes(): Promise<void> {
  const existing = await listCalendarIndexes();

  if (!existing.some(isPlainUserIdIndex)) {
    await mongoService.calendar.createIndex(
      { userId: 1 },
      { name: CALENDAR_USER_ID_INDEX },
    );
  }

  if (
    existing.some((index) => index.name === CALENDAR_USER_ID_LOCAL_UNIQUE_INDEX)
  ) {
    logger.info("Ensured calendar indexes");
    return;
  }

  const duplicates = await findDuplicateLocalCalendarUsers();
  if (duplicates.length > 0) {
    const sampleUserIds = duplicates
      .slice(0, DUPLICATE_USER_ID_LOG_LIMIT)
      .map((row) => String(row._id));
    logger.warn(
      `Skipping ${CALENDAR_USER_ID_LOCAL_UNIQUE_INDEX}: ${duplicates.length} user(s) have more than one local calendar. Dedupe those rows and restart the backend to create the unique index.`,
      { sampleUserIds },
    );
    return;
  }

  try {
    await mongoService.calendar.createIndex(
      { userId: 1, "source.provider": 1 },
      {
        name: CALENDAR_USER_ID_LOCAL_UNIQUE_INDEX,
        unique: true,
        partialFilterExpression: { "source.provider": "local" },
      },
    );
    logger.info("Ensured calendar indexes");
  } catch (error) {
    logger.warn(
      `Skipping ${CALENDAR_USER_ID_LOCAL_UNIQUE_INDEX}: unique index build failed. Dedupe duplicate local calendars and restart.`,
      error,
    );
  }
}
