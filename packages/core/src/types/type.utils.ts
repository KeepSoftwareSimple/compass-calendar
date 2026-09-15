import { type ObjectId } from "bson";
import { z as zod4 } from "zod/v4";
import dayjs from "@core/util/date/dayjs";

/** 24-hex ObjectId string. Shared by wire schemas so the browser never loads bson. */
export const OBJECT_ID_HEX_PATTERN = /^[0-9a-f]{24}$/i;

export const IDSchemaV4 = zod4
  .string()
  .refine((value) => OBJECT_ID_HEX_PATTERN.test(value), {
    message: "Invalid id",
  });

export const zYearMonthDayString = zod4.string().refine(
  (dateString) => {
    return dayjs(
      dateString,
      dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT,
      true,
    ).isValid();
  },
  {
    error: () =>
      `Invalid date string. Must be in ${dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT} format.`,
  },
);

export const TimezoneSchema = zod4.string().refine(
  (timeZone) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone });

      return true;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_) {
      return false;
    }
  },
  { message: "Invalid timezone" },
);

export const RGBHexSchema = zod4.string().regex(/^#[0-9a-f]{6}$/i, {
  message: "Invalid color. Must be a 7-character hex color code.",
});

// An ObjectId kept as its 24-hex string form (Compass-side ids on the wire and
// in Sync's records). Brand it at the point of use for a typed id.
export const ObjectIdStringSchema = zod4.string().regex(OBJECT_ID_HEX_PATTERN);

export const ExpirationDateSchema = zod4
  .union([
    zod4.date(),
    zod4
      .string()
      .regex(/\d+/)
      .transform((v) => dayjs(parseInt(v, 10)).toDate()),
  ])
  .pipe(
    zod4.custom<Date>((v) => v instanceof Date && dayjs().isBefore(v), {
      error: "expiration must be a future date",
    }),
  );

export const StringV4Schema = zod4.string().nonempty();

/** Adds a string _id (Compass-side id) to an object shape */
export type WithId<T> = T & { _id: string };
/** Adds a Mongo ObjectId _id to an object shape (like mongodb's WithId, importable in ui code) */
export type WithObjectId<T> = T & { _id: ObjectId };
export type WithoutId<T> = Omit<T, "_id">;
