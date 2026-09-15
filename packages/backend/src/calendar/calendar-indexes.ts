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

const hasCalendarIndex = async (name: string): Promise<boolean> => {
  const indexes = await mongoService.calendar.indexes();
  return indexes.some((index) => index.name === name);
};

export async function ensureCalendarIndexes(): Promise<void> {
  await mongoService.calendar.createIndex(
    { userId: 1 },
    { name: CALENDAR_USER_ID_INDEX },
  );

  if (await hasCalendarIndex(CALENDAR_USER_ID_LOCAL_UNIQUE_INDEX)) {
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
